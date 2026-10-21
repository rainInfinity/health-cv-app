# 普通渠道云端请求接口

## 配置与请求边界

应用端通过 `createCloudClient` 显式创建服务作用域，不使用模块级单例。`baseUrl` 必须是 HTTP(S) 服务根地址（可包含部署前缀），不含 `/api/v1`；客户端内部追加 `/api/v1/{channel}`，调用方不再拼 API 版本或渠道段。`channel` 由运行配置显式提供，不从语言、时区或设备型号推断，也不能使用管理端 `manager`。

```ts
const client = createCloudClient({
  baseUrl: runtimeConfig.serviceRoot,
  channel: runtimeConfig.channel,
  getAccessToken: readCurrentAccessToken,
});
```

`getAccessToken` 是同步读取当前内存 Access Token 的回调；Axios 请求拦截器在每次受保护请求前调用它。注册、登录、刷新和登出不读取或附带 Access Token。密码与令牌只通过对应请求体或 `Authorization: Bearer` 发送，不放入 URL。SDK 的单次方法只发起一个后端请求，不自动刷新、重发、重试、轮询、上传后提交或创建后查询；会话协调由应用 auth 模块负责。

每个方法可单独传入 `signal` 和 `timeoutMs`。请求失败以 `CloudClientError` reject，`kind` 为 `api`、`network`、`timeout`、`cancelled` 或 `protocol`；HTTP 状态与后端业务 `code` 分开保留，可取得的 `requestId` 和 `Retry-After` 也会保留。错误对象不携带 Axios 配置、原始响应或请求载荷。

## 普通渠道 JSON 接口

下表路径相对于客户端内部构造的 `/api/v1/{channel}` 前缀。JSON 成功响应必须包含 `code: "OK"` 和 `data`；SDK 只返回 `data`，合法的 `data: null` 保持为 `null`。SDK 校验 HTTP 状态、JSON 语法和响应封套，不校验或改写业务 DTO 字段。

请求/响应 DTO 集中定义在包内 `types/dto/request.ts` 和 `types/dto/response.ts`，由包根的 `Req`、`Rsp` 命名空间导出，例如 `Req.Users.ProfilePatchRequest`、`Req.Tasks.SubmitTaskRequest` 与 `Rsp.Tasks.TaskDetail`。DTO 提供 TypeScript 编译期类型，不执行业务字段运行时校验。

| SDK 方法 | 请求 | 认证 | 请求与返回语义 |
| --- | --- | --- | --- |
| `auth.register` | `POST /auth/register` | 无 Access | 接收用户名和密码，返回公开账号；不自动登录。 |
| `auth.login` | `POST /auth/login` | 无 Access | 接收用户名和密码，返回当前渠道的 Access/Refresh Token 对。 |
| `auth.refresh` | `POST /auth/refresh` | 无 Access | 请求体为 `{ refreshToken }`，显式返回轮换后的 Token 对。 |
| `auth.logout` | `POST /auth/logout` | 无 Access | 请求体为 `{ refreshToken }`；成功的 `data: null` 仍表示成功。 |
| `users.getMe` | `GET /users/me` | Bearer | 返回当前账号公开标识。 |
| `users.getProfile` | `GET /users/me/profile` | Bearer | 返回本人资料，不把十进制字符串或时间改成数值或 `Date`。 |
| `users.updateProfile` | `PATCH /users/me/profile` | Bearer | 只发送显式提供的白名单字段，并使用服务端完整资料响应。 |
| `models.list` | `GET /models` | Bearer | 返回当前普通渠道可用模型分页。 |
| `tasks.create` | `POST /tasks` | Bearer | 请求体只含 `{ modelId }`；返回固定模型版本的草稿摘要。 |
| `tasks.list` | `GET /tasks` | Bearer | 返回当前账号任务摘要分页。 |
| `tasks.getById` | `GET /tasks/{task_id}` | Bearer | 返回任务详情；`FAILED` 是成功取得的业务状态，不是请求异常。 |
| `tasks.submit` | `POST /tasks/{task_id}/submit` | Bearer | 可不传请求体；也可传 `Req.Tasks.SubmitTaskRequest`；返回提交后的任务摘要。 |

提交请求示例：

```json
{
  "clientMetadata": {
    "deviceModel": "Pixel 9",
    "brand": "Google",
    "appVersion": "2.4.1",
    "custom": {
      "appBuild": 42
    }
  }
}
```

提交接口兼容不传请求体。省略整个请求体、发送 `{}` 或将 `clientMetadata` 设为 `null`，均表示未提供元数据；`clientMetadata: {}` 是有效的空对象。`clientMetadata` 必须是 JSON 对象或 `null`，其他类型会被拒绝。服务端将其作为独立任务快照保存，不返回给普通用户查询；它是客户端自报信息，不证明设备身份。不要提交密码、令牌或其他敏感信息。SDK 调用形式为 `tasks.submit(taskId, request?, options?)`。

任务详情的 `qualityFailure` 仅表示算法质量拒绝：`LOW_SCORE` 携带 `{ score, threshold }`，`NO_VALID_SIGNAL` 的 `details` 为 `null`。成功任务、普通失败，以及没有有效历史质量明细的任务均为 `null`；任务摘要和列表项不包含 `qualityFailure`。`FAILED` 仍是正常取得的业务状态，不代表 HTTP 或请求失败。

任务输入和输出使用独立的文件接口，不由 JSON 方法自动串联：上传路由为 `POST /tasks/{task_id}/files`，由 `tasks.uploadFile(taskId, { logicalName, file: { uri, name, type } }, options)` 每次发送一个 `logicalName` 和一个 React Native 文件引用。已有 URI scheme 保持不变，裸本地路径规范化为 `file://` URI；SDK 不读取整文件或编码 Base64，由运行时生成 multipart boundary。上传返回服务端 `fileId`、`logicalName`、`sizeBytes`（字节）、`uploadedAt` 和 `isSelected`。输入下载为 `GET /tasks/{task_id}/files/{file_id}/download`，输出下载为 `GET /tasks/{task_id}/outputs/{logical_name}/download`；输出名按单一路径段编码。下载返回 `{ body: Blob, contentType, contentDisposition }`，成功载荷是二进制，不是 JSON 业务包装，也不自动落盘。

不存在普通用户的管理模型、任务取消、任务删除或文件列表接口。不要调用 `/manager/...`，也不要把取消本地传输描述成服务端撤销任务。

## 分页、时间与空值

模型目录和任务列表都接受可选 `offset`、`limit`。未提供时让服务端使用 OpenAPI 默认值 `offset=0`、`limit=20`；返回页包含 `items`、`total`、`offset`、`limit`，不改名为 `count`。

任务时间是 Asia/Shanghai 的原始字符串，格式示例为 `YYYY-MM-DD HH:mm:ss`，没有时区后缀。资料出生日期是日期字符串；身高和体重响应为十进制字符串或 `null`。SDK 不转为浮点数、不按设备时区解析时间。

PATCH 中缺席字段表示不修改，显式 `null` 表示清空可空资料字段，具体值按原意提交。病史布尔值的 `false` 是明确的否；`historyJson` 内部键的 `null` 表示删除该键，整个 `historyJson: null` 表示清空对象。性别使用 `0` 未知、`1` 男、`2` 女；SDK 请求 DTO 不允许 `null`。

任务摘要和详情保留服务端状态、固定模型版本、`isExample`、安全失败字段及原始扩展对象。客户端不递归转换键名，不推断失败任务结果，也不解释算法字段为通用医学指标。

## OpenAPI 差异

测试环境 [OpenAPI](https://test-backend.myhealthyclub.com/api/v1/openapi.json) 的 `ProfilePatchRequest.gender` schema 同时允许整数和 `null`，但其描述写明不能为 `null`。实现遵守接口描述及业务约束：`gender` 只能是 `0 | 1 | 2`；如需修正 schema，应在后端处理，不把矛盾扩散到调用方类型。

OpenAPI 对两个下载路由的 HTTP 200 只声明状态说明，没有声明 JSON schema 或二进制媒体载荷。调用方应按文件接口接收 Blob，并从响应头读取可用媒体类型和附件信息；只有错误状态才尝试解析 JSON 错误包装，不能将错误正文当成文件成功。

React Native 的 Blob 可能没有标准 `text()` 方法；读取下载错误时，SDK 使用平台 `FileReader.readAsText` 解析 JSON，并在完成后释放失败响应 Blob。成功下载的 Blob 由调用方负责消费和按平台能力释放；SDK 不复制或落盘。

文件传输可在单次请求选项中提供 `onProgress({ loadedBytes, totalBytes? })` 与 `signal`。字节数来自 Axios 实际传输事件；总量无法可靠取得时不提供 `totalBytes`，SDK 不合成百分比或定时进度。响应成功、传输到 100% 和服务端业务成功是不同事实：上传到 100% 后仍可能返回业务错误。请求结束或取消后不再发出迟到进度；取消只终止本地传输观察，不撤销已经到达服务端的业务操作。进度不代表后端处理或上层落盘。下载仍返回 Blob，不在 SDK 中读入 Base64、创建本地文件或调用文件保存能力。

## Android RN 实际传输验证

在 `Pixel_5` Android 17 / API 37 arm64 模拟器、Expo development build、测试后端 `android-cn` 渠道完成以下验证。请求使用已授权测试账号；文档不记录凭据。

| 场景 | 实测结果 |
| --- | --- |
| PPG 输入 | 使用后端文档中的合成 `ppg.csv`（188 字节）原生文件 URI 上传；服务端回执的 `logicalName=ppg`、`sizeBytes=188` 与实际文件一致。原输入下载返回 188 字节 Blob，读取后的文本与 fixture 完全一致，媒体类型为 `application/octet-stream`。上传和下载各观察到 1 次进度回调；这两个小文件的 `totalBytes` 未从联调界面留存。 |
| 传输总量 | 使用 8 MiB 本地文件和非法逻辑名验证错误响应。上传实际收到 9 次事件，末次 `loadedBytes=8,388,948`、`totalBytes=8,388,948`；之后服务端返回 HTTP 422，说明传输完成不等于业务成功。 |
| 取消 | 原生上传在首个进度事件后调用 `AbortController.abort()`；取消结果为 `cancelled`，取消时 1 次事件，等待 200 ms 后新增事件为 0。 |
| 输出文件 | 已提交示例任务的详情为 `SUBMITTED` 且没有 `output_files`；缺失输出名下载得到结构化 `404 / NOT_FOUND`。当前环境没有成功输出文件可验证，因此未宣称 RN 输出下载成功。 |

上述记录只覆盖该 Android 模拟器与测试渠道；没有验证 iOS 或实体设备。

## 只读错误路径验证

无凭据时可执行一次只读的 `GET /users/me`，验证 Access 缺席时 SDK 不伪造身份、不刷新或重试，并将后端拒绝映射为结构化错误。该路径不创建或修改账号、资料、模型、任务或文件：

```ts
import { CloudClientError, createCloudClient } from '@health-cv-app/cloud-client';

const client = createCloudClient({
  baseUrl: runtimeConfig.apiBaseUrl,
  channel: runtimeConfig.channel,
  getAccessToken: () => null,
});

try {
  await client.users.getMe();
  throw new Error('预期未认证请求返回 HTTP 401');
} catch (error) {
  if (!(error instanceof CloudClientError) || error.kind !== 'api' || error.status !== 401) {
    throw error;
  }
  console.log(error.code, error.requestId);
}
```

只读验证记录：使用测试后端 `ios-cn` 渠道且不提供 Access Token 执行上述 GET，收到 HTTP 401、业务码 `INVALID_TOKEN`，SDK 返回 `kind=api`。这是 Node 请求 smoke，不代表 React Native 运行时验证。

只记录错误类别、状态、业务码和请求标识；不要输出凭据、完整资料、请求配置或原始响应。无凭据错误不替代使用受控账号验证成功路径。
