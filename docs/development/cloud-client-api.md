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

请求/响应 DTO 集中定义在包内 `types/dto/request.ts` 和 `types/dto/response.ts`，由包根的 `Req`、`Rsp` 命名空间导出，例如 `Req.Tasks.SubmitTaskRequest`、`Req.Measurements.MeasurementListParams` 与 `Rsp.Measurements.MeasurementRecord`。包根同时公开 `CloudClient`、`MeasurementsApi` 等接口类型。DTO 提供 TypeScript 编译期类型，不执行业务字段运行时校验。

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
| `tasks.getById` | `GET /tasks/{task_id}` | Bearer | 返回任务详情及可空 `measurement`；`FAILED` 是成功取得的业务状态，不是请求异常。 |
| `tasks.submit` | `POST /tasks/{task_id}/submit` | Bearer | 可不传请求体；也可独立提供采集属性、客户端元数据；返回不含 `measurement` 的任务摘要。 |
| `measurements.latest` | `GET /measurements/latest` | Bearer | 返回固定五键，各为最新有效记录或 `null`，不填默认读数。 |
| `measurements.list` | `GET /measurements` | Bearer | 必填 `metric/from/to`，可选 `offset/limit`；只返回一页 `items/total/offset/limit`。 |

提交请求示例：

```json
{
  "measurement": {
    "captureMethod": "fingertip",
    "captureMode": "active",
    "durationMs": 30001
  },
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

`measurement` 与 `clientMetadata` 独立，可以省略或传 `null`，表示未知；非空对象必须同时提供 `captureMethod`（`fingertip | fingertip_chest`）、`captureMode`（`active`）和实际正式窗口 `durationMs`。后端要求时长为 `1–9223372036854775807` 的严格整数毫秒，拒绝空对象、缺项、额外字段及非法值，并返回 `422 / INVALID_INPUT`。应用使用原生实际时长，不以目标三十秒代替；SDK 不添加默认值、不转换数值，也不新增 `capturedAt`、`submittedAt` 或身份／版本覆盖字段。JS `number` 的精确整数范围小于后端整数上限，调用方应提供可精确表达的实际毫秒值。

详情的 `measurement` 为已冻结三项或 `null`；草稿和缺少采集属性的旧任务保留 `null`。任务摘要、列表和提交响应不含该字段，不从模型或算法补造采集属性。`result` 仍为原始 `Record<string, unknown>` 或 `null`，不在 SDK 内解析场景成员、推断指标或改写键名。

任务详情的 `qualityFailure` 仅表示算法质量拒绝：`LOW_SCORE` 携带 `{ score, threshold }`，`NO_VALID_SIGNAL` 的 `details` 为 `null`。成功任务、普通失败，以及没有有效历史质量明细的任务均为 `null`；任务摘要和列表项不包含 `qualityFailure`。`FAILED` 仍是正常取得的业务状态，不代表 HTTP 或请求失败。

## 最新健康结果与指标历史

```ts
import type { Req, Rsp } from '@health-cv-app/cloud-client';

const latest: Rsp.Measurements.LatestMeasurements =
  await client.measurements.latest({ signal });
const query: Req.Measurements.MeasurementListParams = {
  metric: 'heartRate',
  from: '2026-11-01',
  to: '2026-11-22',
  offset: 0,
  limit: 100,
};
const page: Rsp.Measurements.MeasurementPage =
  await client.measurements.list(query, { signal, timeoutMs: 10000 });
```

`Rsp.Measurements.Metric` 为 `bloodPressure | heartRate | respirationRate | oxygenSaturation | diabetesRisk`；最新接口始终返回同名五键，每项独立取当前账号、当前渠道的最新有效记录或 `null`。失败任务、失败成员、`ALL_FAILED`、示例和未知算法不生成记录；某指标无新有效值时，服务端可保留此前有效值。完整报告通过记录的 `taskId` 继续查询任务与下载输出。

每条 `Rsp.Measurements.MeasurementRecord` 保留以下后端字段，不转换时间、补默认来源或解释医学等级：

| 字段 | 类型与语义 |
| --- | --- |
| `recordId` | 稳定字符串 `<taskId>:<metric>`；同任务不同指标分别标识。 |
| `taskId`、`metric` | 关联任务主键与上述五种指标之一。 |
| `submittedAt` | 服务端冻结提交时刻的北京时间原字符串，如 `2026-11-22 08:30:00`；不是采集开始、创建或完成时刻，不新增 `capturedAt`。 |
| `captureMethod` | `fingertip`、`fingertip_chest` 或 `null`，旧任务来源未知时保留 `null`。 |
| `captureMode` | `active` 或 `null`。 |
| `durationMs` | 实际毫秒数或 `null`；不补目标时长。 |
| `readings` | `{ code: string, value: number, unit: string }[]`；不舍入、限幅、换单位或改名。 |
| `quality` | `{ score: number, threshold: number }` 或 `null`，只保留实际合法质量。 |
| `riskLevel` | 风险原始 `0`、`1`、`2` 编码，其余指标为 `null`，不重算档位。 |
| `modelId`、`versionId`、`version` | 任务固定模型、版本主键及原版本字符串；场景记录保留场景版本，不跟随当前渠道选择变化。 |
| `algorithmKey` | 实际成功成员或独立算法标识，不等于场景模型版本。 |

血压读数为同任务的 `sbp/dbp`（`mmHg`）；心率为 `hr`（`beats_per_minute`），呼吸率为 `br`（`breaths_per_minute`），血氧为 `spo2`（`percent`），风险为 `diabetes_probability`（`ratio`）。风险概率保留原值，不转换成血糖或临床患病概率。

历史的 `from/to` 是严格北京时间 `YYYY-MM-DD`，包含首尾日，按 `submittedAt` 筛选。分页缺省交由服务端使用 `offset=0/limit=20`，`limit` 为 1–100；SDK 原样发送显式筛选，不纠正日期或分页。非法日期、反向区间、未知指标及越界分页的 `422 / INVALID_INPUT` 按现有 `CloudClientError` reject，不伪装空列表。真正无结果或偏移超过范围时保留成功返回的空 `items` 及完整区间 `total`。

这是普通 offset 分页，不是固定快照；一次 `list` 只读取一页，不自动取完整区间、去重、计算统计或轮询。上层应完整加载后再展示最终趋势与统计；任一页失败不能当空页，发现总数变化、重复 `recordId` 或已知新有效结果时应整段刷新，不混用旧页。可比性分组及 UTC+8 展示属于应用层职责，SDK 不改 DTO。


## 文件传输

上传路由为 `POST /tasks/{task_id}/files`，调用 `tasks.uploadFile(taskId, { logicalName, file: { uri, name, type } }, options)`，每次发送一个输入逻辑名和一个文件。已有 URI scheme 保持不变，裸本地路径转成 `file://`；SDK 不读取整文件或编码 Base64，不手写 `Content-Type`，由 React Native 生成 multipart boundary。

上传返回 `fileId`、`logicalName`、`sizeBytes`（字节）、`uploadedAt` 和 `isSelected`。后端合同要求文件非空，默认上限为 `52,428,800` 字节（50 MiB），实际部署及代理限制可能不同，接口不提供上限查询。仅可上传到本人当前渠道的 `DRAFT` 任务。

同一 `logicalName` 再次上传会选择新文件记录，旧记录和文件仍保留；超时重传可能新增记录，不是覆盖或幂等重放。普通用户没有输入文件列表接口，任务详情也不返回完整输入集合，调用方需保存回执，不能仅靠详情恢复上传历史。

输入下载为 `GET /tasks/{task_id}/files/{file_id}/download`，输出下载为 `GET /tasks/{task_id}/outputs/{logical_name}/download`；输出名按单一路径段编码。下载返回 `{ body: Blob, contentType, contentDisposition }`，成功载荷是二进制，不是 JSON 业务包装，也不自动落盘。

进度通过单次请求的 `onProgress({ loadedBytes, totalBytes? })` 提供，字节数来自 Axios 事件，总量无法可靠取得时省略。SDK 不合成百分比或定时进度，上传到 100% 后仍可能返回业务错误。请求结束或取消后不再发出迟到进度；`signal` 只终止本地传输，不撤销已到达服务端的操作，进度也不代表云端处理或上层落盘。

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


只记录错误类别、状态、业务码和请求标识；不要输出凭据、完整资料、请求配置或原始响应。无凭据错误不替代使用受控账号验证成功路径。
