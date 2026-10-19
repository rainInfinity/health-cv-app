# 请求客户端与认证接入设计

## Context

动机和范围见 [proposal.md](proposal.md)。当前 `apps/native/App.tsx` 仅显示 Hello World，workspace 只匹配 `apps/*`，尚无 `packages/cloud-client` 或 auth 实现。Axios、React Query、Nano Stores、MMKV 和文件库已在应用依赖中；安全凭据存储未接入。

[代码组织](../../../docs/architecture/code-organization.md)和[技术选型](../../../docs/architecture/technology-stack.md)已经确定通信包、应用组装、服务端缓存与业务状态分离。本变更沿用这些方向，将尚未确定的后端请求协议具体化，不创建第二套服务层或通用基础设施包。

契约依据是后端仓库 `health-service/docs/frontend-integration.md` 和测试环境 [OpenAPI](https://test-backend.myhealthyclub.com/api/v1/openapi.json)。旧项目 `nxhe-app-intl/src/api` 的资源分组可参考，但 Cookie、硬编码渠道、数字错误码、`he()` 和下载后自动保存文件不可沿用。旧用户 Store 将网络错误视为未登录，也不可复制。

## Goals / Non-Goals

**目标：**
- 一次 SDK 调用对应一次请求；认证恢复与重发由应用端统一协调，不侵入资源接口或页面。
- 凭据、可订阅认证状态和服务端缓存各有一个负责人；退出、令牌轮换与旧响应有明确顺序。
- 文件方法提供真实字节进度和取消能力，返回值不依赖界面、文件目录或 Store。
- 在现有 Expo/RN 组合上验证真实网络与原生行为，保持现有开发构建和 Hello World 页面。

**非目标：**
- 不另建独立 contracts/DTO 工作区包；公共请求和响应 DTO 集中在 `cloud-client` 包内。
- 不实现登录/资料/任务页面、测量编排、轮询、后台传输、断点续传、离线健康档案或草稿恢复。
- 不新增管理端和后端接口，也不将参考项目的算法或采集参数移植为新契约。

## Decisions

### 1. 按资源组织 SDK，应用端单独拥有 auth

`packages/cloud-client/src` 保留 `http/`、`apis/` 和 `types/` 三个职责边界。`apis/auth.ts`、`apis/user.ts`、`apis/model.ts`、`apis/task.ts` 分别提供资源方法；所有请求与响应 DTO 集中放入 `types/dto/request.ts` 与 `types/dto/response.ts`，使用 `Req`、`Rsp` 命名空间按资源归组，并由包根统一导出。API 方法名和公开的 `CloudClient` 资源属性保持不变。

应用端使用 `src/app/auth` 承载会话操作、状态、凭据适配和必要类型，`src/app/query` 承载 QueryClient、查询键与资源查询配置，`bootstrap.ts` 连接真实依赖。只为实际职责创建文件，不按目录示意预建空模块；通信包采用上述 `apis/` 资源文件布局，不保留旧 SDK 兼容路径。

选择分组实例而不是旧项目的全局单例，使服务地址和渠道不依赖模块顶层常量，也避免跨账号测试共享运行状态。auth 不独立发布为公共包，不让安全存储或 React 依赖进入通信包。

### 2. 显式创建客户端，外部提供当前 Access

公开入口采用 `createCloudClient({ baseUrl, channel, getAccessToken, timeoutMs })` 的形式。`baseUrl` 表示服务根地址，不含 `/api/v1`；客户端内部统一组装 `/api/v1/{channel}`。普通渠道为后端已知的用户渠道，不包含 `manager`。

`getAccessToken` 为同步读取内存凭据的函数，返回字符串或 `null`；SDK 不在每次请求时读取安全存储，也不持有第二份权威令牌。认证入口不读取或要求 Access；受保护接口在存在令牌时添加 Bearer 头。未提供令牌的直接 SDK 调用仍能取得后端的认证错误，应用端则通过 auth 门控避免恢复期间启动业务请求。

只公开资源方法，内部路径由接口定义构造，不提供任意 URL 加 Bearer 的公共能力。请求选项只公开所需的 `signal`、`timeoutMs` 和文件进度回调，不透传整个 Axios 配置。

服务地址和渠道由应用组装显式配置，不根据语言、系统时区或参考项目推断发行地区。首次产品渠道可以稍后选择，因为实现支持配置且联调可显式指定渠道；文档示例不成为隐式生产默认值。

### 3. 成功解包，错误结构化，不复制 HTTP 实现

JSON 方法返回 `Promise<T>`。成功必须满足后端约定的 HTTP 成功状态、`code=OK` 及有效响应封套；`data=null` 是合法成功值。通信层不校验 `data` 内部的 DTO 字段，响应数据按对应 TypeScript 类型交给调用方。认证登出不能用 `if (data)` 判断成功。

统一的 `CloudClientError` 具有 `kind`（`api/network/timeout/cancelled/protocol`）、安全 `message` 和可选的 `status/code/requestId/retryAfter`。`code` 仅表示后端业务码；HTTP 实现内部错误不放入该字段。`requestId` 优先取有效 JSON 包装，缺席时读取 `X-Request-ID`；`Retry-After` 保留为原响应头字符串，是否等待由上层决定。

未知业务错误码原样保留。非 JSON、结构损坏或错误响应中缺少业务包装时保留实际 HTTP 状态，使用通用安全消息，不展示原始正文。错误不保留完整 AxiosError、请求配置或原始响应作为可日志化的 `cause`，避免密码、令牌、资料和文件引用泄漏。

选择 reject 而不是完整后端包装或 `Result<T>`，使正常数据调用和 React Query 错误状态直接对应。任务 `FAILED` 仍是成功取得的任务数据，客户端不把它变成通信错误。UI 以后按业务码映射文案，服务端安全消息仅作适当回退；本变更不实现提示。

### 4. 接口和 DTO 以已实现契约为界

| 分组 | 方法语义 | 后端路径（相对渠道前缀） |
|---|---|---|
| `auth` | `register/login/refresh/logout` | `/auth/register`、`/auth/login`、`/auth/refresh`、`/auth/logout` |
| `users` | `getMe/getProfile/updateProfile` | `GET /users/me`、`GET /users/me/profile`、`PATCH /users/me/profile` |
| `models` | `list` | `GET /models` |
| `tasks` | `create/list/getById` | `POST /tasks`、`GET /tasks`、`GET /tasks/{id}` |
| `tasks` | `uploadFile/submit` | `POST /tasks/{id}/files`、`POST /tasks/{id}/submit` |
| `tasks` | `downloadInput/downloadOutput` | `GET /tasks/{id}/files/{fileId}/download`、`GET /tasks/{id}/outputs/{logicalName}/download` |

请求 DTO 与响应 DTO 集中定义并使用资源命名空间区分。PATCH 仍只按允许字段构造，省略字段不改写，`gender` 使用 `0 | 1 | 2` 且不可为 `null`；病史保留 `false` 和删除键的 `null`。身高、体重请求支持约定的数字或十进制字符串，响应保留字符串。分页使用后端 `total`，不继续使用旧项目的 `count`。业务时间保持字符串，不隐式构造 Date。类型声明不执行运行时字段校验。

任务摘要和详情分开；详情的算法结果作为未解释对象保留原键名。`Rsp.Tasks.TaskDetail.qualityFailure` 按后端契约为可空判别联合：`LOW_SCORE` 的 `details` 是实际数值 `{ score, threshold }`，`NO_VALID_SIGNAL` 的 `details` 是 `null`；其他情况为 `null`，任务摘要和分页不包含该字段。它仅提供编译期类型，不做运行时字段校验。完整保留固定版本、`isExample` 和安全失败字段，不提供不存在的任务取消、删除、文件列表或模型管理查询。

当前 OpenAPI 的 `gender` schema 与禁止 `null` 的描述冲突，下载 200 未声明载荷。采用明确 DTO 与对接指南约束，不全量生成 SDK，不通过宽泛断言掩盖差异；在联调文档中记录并反馈后端，不在本变更改后端。

### 5. 文件返回值和进度分离

上传输入使用带 `uri/name/type` 的文件引用和单独的 `logicalName`。URI 已带协议时保留，裸本地路径只规范化一次；支持范围依据实际 RN 文件引用验证，不擅自承诺任意系统选择器 URI。FormData 的两个字段为 `logicalName` 和 `file`，由运行时补齐 boundary；不将文件读成字符串、Base64 或样本数组。

上传返回 `TaskInputFile` 元数据。下载选择原生支持的 `Blob` 作为载荷，返回包含 `body`、可空 `contentType` 和可空 `contentDisposition` 的文件结果，不解析成磁盘路径，不保证友好文件名。当前 RN 在启动时提供 Blob 与 FileReader 全局接口；成功文件保持原生二进制载荷，避免 `ArrayBuffer -> Base64 -> 临时文件` 的额外复制。仅失败的 JSON 正文需要用可用的文本读取能力解析，不把整个成功文件转换到 JS 字符串。实现中必须在实际 RN 验证该路径，不以 Node 的 Blob 行为替代。

文件方法可传 `onProgress`，回调只包含 `loadedBytes` 和可选 `totalBytes`；仅当总量是可信正值时提供它，否则使用 `undefined`。百分比由调用方派生，不再保存重复的比例状态。上传和下载分别接入 Axios 对应的进度事件，沿用已有节流，不另建事件总线或为平滑展示生成事件。无回调时不增加额外监听。

进度仅表示该请求消息体的传输，不代表后端校验、文件持久化、任务处理或上层落盘完成；multipart 总量不等同于本地文件大小。已知总量到 100% 后仍等待 Promise 最终结果，错误正文的下载进度也不能标记操作成功。取消、超时或请求结束后阻断迟到回调。多文件整体进度、速率和剩余时间估算均不在本次范围。

### 6. 应用端认证是唯一会话负责人

应用端 auth 模块持有内存令牌、会话代次和令牌修订号；Nano Stores 中只发布一个只读可订阅快照，通过认证命令推进，不保留内部状态与同步 Store 两套业务状态。建议状态为 `restoring/anonymous/authenticated/unavailable`，其中 `unavailable` 提供非敏感原因码，例如网络不可达、凭据存储失败或刷新结果不确定。身份字段仅保留必要账号标识；完整账号和资料归 Query Cache。

组装层创建 SDK、auth 和 QueryClient，使用可显式传入的配置初始化一次恢复，并向应用提供实例和 Provider。恢复不由页面挂载触发。没有凭据进入 `anonymous`；存在凭据则确认 `users.getMe`，必要时走受控刷新；确认后才进入 `authenticated`。网络失败进入 `unavailable`，保留可能仍有效的凭据，暂停新的受保护操作，不伪造已确认身份或直接清空为未登录。

应用端 `signIn` 直接调用认证 SDK，保存令牌并确认账号，再向调用方返回非敏感账号结果；`register` 仍只注册。若账号确认暂失败，凭据保留且状态为不可确认，可在网络恢复后重新确认。认证敏感调用不经通用 `useMutation`，避免其参数与返回值在 MutationCache 中留下密码和令牌对。后续 UI 可订阅认证状态或使用页面本地提交状态，不需要暴露原始认证响应。

选择独立认证状态而不是复制旧项目的 `user + isLoading + isError` 组合，是为了明确恢复失败、确定未登录和已确认登录的差异，并避免多个布尔值构成无法解释的组合。

### 7. Axios 拦截器处理传输共性，认证刷新由应用 auth 负责

auth 模块提供统一的受保护调用入口，应用查询配置通过它调用 SDK 的单个资源方法。该入口捕获会话代次和令牌修订号，确认当前会话可用后执行请求。仅 `401 / INVALID_TOKEN` 可以触发刷新；同一会话共享一个在途刷新 Promise。迟到 401 的修订号若已落后，使用当前令牌重发一次而不是再次刷新。

刷新使用最新 Refresh，先完成安全记录更新，再发布内存令牌对并唤醒等待者。原业务操作至多重发一次，第二次失败直接返回；这是认证拒绝后的受控重发，不是网络超时或业务错误的自动重试。取消一个等待者只取消该操作，不取消其他调用共享的刷新；已取消操作不重发。文件重发通过原始文件引用重新构造 FormData，不复用已消耗或已取消的传输体。

刷新明确认证失败时关闭对应会话；403 返回权限/渠道错误而不循环刷新。网络、5xx 或超时进入暂不可确认状态，不自动反复使用可能已失效的旧 Refresh。刷新已轮换但安全写入失败时不回滚到旧 Refresh，也不发布已持久化成功的假象；允许重新认证。Access/Refresh 生命周期不硬编码为 7/30 天，不把 JWT 解码当作服务端认证。

Axios 请求拦截器按请求标记读取外部 Access Token 并设置 Bearer 头；响应拦截器负责 JSON 封套解包和结构化错误映射。拦截器只处理单次传输，不刷新、不重试；受保护调用入口保留在应用 auth 层，以便用会话代次与令牌修订号协调并发刷新、迟到 401 和退出竞争。参考项目的 Cookie 与固定客户端密钥不适用于当前 Bearer 契约。

### 8. 安全存储和退出使用同一套顺序约束

使用与项目 Expo SDK 兼容的 `expo-secure-store`，通过 CNG 配置和原生构建验证接入。`credentials` 模块按规范化服务地址与渠道生成只含安全字符、无歧义的作用域键，保存一个令牌对 JSON 记录；不在普通 MMKV 中保存敏感凭据，不增加生物识别提示作为默认行为。

所有凭据写入和清除在应用 auth 内串行，并在提交前检查会话代次，避免旧登录/刷新写入与退出删除竞争。退出先关闭旧会话的新调用入口、推进代次、取消受保护调用及查询并清除其缓存，同时排队清除本地凭据；在途旧结果不再发布。

若已有刷新在途，退出与其协调确定最新可取得的 Refresh 后尽力撤销；远端撤销不阻止本地退出，也不在远端完成后再次无条件删除可能属于新登录的记录。服务端成功返回 `null` 仍表示撤销成功。网络失败只表示远端撤销未确认；安全存储删除失败必须另外反馈，不能承诺下次启动一定没有旧记录。旧 Access 服务端仍可能有效到过期，不宣称退出会立即撤销所有令牌。

iOS Keychain 重装残留、Android 自动备份排除、存储容量和读写失败均按所选 SecureStore 版本核对，并记录实际验证边界；本变更不把“卸载必然清除凭据”作为契约，也不添加独立设备管理或注销全部会话能力。

### 9. 缓存使用会话代次，不使用令牌字符串

QueryClient 归应用端。受保护查询键包含规范化服务地址、渠道、会话代次和资源参数；新登录或切换作用域产生新代次，正常令牌轮换不改变代次。认证状态不完整复制 `me`、profile 或请求 loading/error。账号确认成功后把账号响应写入当前作用域，资料 PATCH 使用服务端完整响应更新缓存，而不是局部请求对象或默认空值。

查询和更新在写入或返回给缓存前检查捕获的会话代次；退出先关闭入口并取消，再移除旧作用域缓存，迟到结果不得重新填入。对当前会话之外的查询键不进行无条件覆盖。清理包含受保护查询和变更状态，但不清理语言/主题偏好。当前阶段不持久化 Query Cache、MutationCache、资料或任务，也不承诺进程重启后恢复离线健康档案或上传表单。

本次 QueryClient 对查询和变更都显式关闭通用自动重试，重发仅限上述认证拒绝后的单次受控操作。受保护查询由认证状态门控；变更调用不持久化或排队到重连后自动执行。RN 焦点与网络状态不使用浏览器 `window` 替代，不为没有实际页面消费者的场景预建后台重取流程。任务轮询和 App 退出后的任务恢复另行设计。

### 10. 验证按风险选择，不用包装层测试堆数量

永久回归优先覆盖真实消费者风险：PATCH 缺席/空值/false、合法空成功与失败任务、错误码保真、刷新并发/迟到 401、退出与迟到响应、刷新结果未知、存储失败和进度 100% 后失败。使用确定性隔离的边界与时序样例，不为 DTO 字段抄写、请求转发、导出存在或源码文本建立测试。

真实 RN smoke 覆盖安全存储读写与跨启动恢复、实际上传/下载、已知/未知总量呈现、取消和回调终止。只用合成信号和受控账号；触发测试后端写入前按环境权限确认账号与影响，不发布模型或切换共享渠道。可用合成文件创建草稿、上传后下载原输入验证传输，无需实现采集或轮询完整推理。需要可观察传输时使用足够大的合成文件和受控限速，不伪造进度。

开发探针和临时界面在取得证据后移除，生产保留真实模块与必要回归。新增原生依赖后重建 Android development build 并观察 Hello World 仍能启动；iOS 验证若不可用必须明确记录，不能用 Android 或 Node 结果代替。

## Risks / Trade-offs

- Refresh 轮换成功但响应丢失 → 不无限重试旧 Refresh，明确不可确认状态和重新认证路径；客户端不承诺无损恢复。
- 新令牌已签发但安全存储写入失败 → 不回滚旧 Refresh、不静默降级存储；当前恢复链失败，记录非敏感原因并允许重新登录。
- 清缓存后旧响应再次写入 → 会话代次检查、取消与作用域移除配合使用，不能只做一次 `clear`。
- 认证参数或结果在变更缓存中驻留 → 敏感认证调用不走通用 mutation 缓存，也不将 Token 放进查询键或调试日志。
- RN 下载载荷、进度频率及总量可得性存在平台差异 → 使用已有 XHR 进度路径和原生 Blob，实际设备验证；未知总量保持未知，不以浏览器或 Node smoke 代替。
- Blob 仍可能占用原生内存，不等于磁盘流式下载 → 避免成功载荷转 Base64；本次不承诺无限大小或后台文件传输，记录实际文件规模与内存观察。
- OpenAPI 字段描述存在缺口 → 明确 DTO 和对接约束，并向后端记录差异，不以未经校验的生成代码覆盖业务语义。
- 不持久化服务端缓存 → 重启后需重新查询；换取更简单的隐私边界和退出语义，离线健康数据不在当前范围。

## Migration Plan

1. 接入 `packages/cloud-client` 与应用端配置、auth、QueryClient；当前没有旧 SDK 或 Cookie 会话需要兼容或迁移。
2. 接入安全存储及其 CNG 配置，锁定与 Expo 兼容的版本，完成 Android 重建；现有 Hello World 页面保持不变。
3. 用显式环境和渠道执行契约回归与真实 RN 联调，通过后更新架构、配置和验证说明。
4. 若实现需回退，只回退本变更的客户端/应用接入及依赖，不执行后端数据迁移或撤销其他用户会话；本变更不修改后端 schema。

## Open Questions

- 首个产品发行渠道和生产 API 地址由产品及部署方在接入时提供。客户端始终显式注入，文档中的 `ios-cn`、`android-cn` 仅为指定联调作用域，不构成默认发行决策。
- 受控联调账号、可用模型及首次设备验证窗口在实际运行前确认；它们不改变请求与认证规格。没有可用业务资源时先完成可达的只读与本地验证，并明确尚缺的环境前提，不生成假资源或声称完整业务验收通过。
