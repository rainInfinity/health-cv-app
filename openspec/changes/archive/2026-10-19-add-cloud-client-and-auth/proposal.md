# 请求客户端与认证接入

## Why

后端已提供普通渠道认证、本人资料、模型目录及异步任务接口，而当前 App 仍是工程基线，没有可复用的请求模块和认证接入。需要在接入业务页面前明确传输、会话与缓存的责任边界，避免旧项目的 Cookie 协议、混合错误处理和网络失败即退出行为进入新项目。

## What Changes

- 新增 `packages/cloud-client`，按 `apis/auth.ts`、`user.ts`、`model.ts`、`task.ts` 集中组织单次请求接口；包根仍公开 `auth`、`users`、`models`、`tasks` 资源。所有请求与响应 DTO 集中在包内的 `types/dto`，通过 `Req`、`Rsp` 命名空间统一导出。
- `baseUrl` 接收服务根地址，客户端内部组装 `/api/v1/{channel}`；Axios 拦截器统一附加请求凭据、解包 JSON 响应并映射结构化错误，认证刷新仍由应用 auth 协调。
- JSON 成功响应解包为 `data`，不执行业务 DTO 字段级运行时校验；失败统一 reject 结构化错误，保留业务错误码、HTTP 状态和可取得的请求标识，不把任务失败误判为请求失败。
- 任务详情同步后端新增的可空 `qualityFailure` 判别联合类型；任务摘要与分页不包含该字段。
- 支持单文件 multipart 上传、鉴权下载、取消和可选的逐请求进度回调；进度允许未知总量，100% 不代表操作成功，不负责文件落盘和清理。
- 在应用端新增 auth 模块，负责安全凭据保存、启动恢复、受控刷新、退出和认证失效；Nano Stores 对外提供认证状态，不在 `cloud-client` 中引入 Store。
- 接入应用端 React Query，明确本人账号及资料等服务端数据的缓存归属、会话隔离、退出清理和旧响应阻断；不持久化健康资料、任务或通用查询缓存。
- 同步架构和开发说明，并用受控账号、合成文件及实际 RN 运行验证行为。新增安全存储依赖后重新验证现有 Android 开发构建，不改变 Hello World 页面要求。
- 不包含登录或业务页面、管理端、采集实现、测量编排、任务轮询、后台传输、断点续传、自动重试写请求及任务恢复。

## Capabilities

### New Capabilities

- `cloud-api-access`：普通渠道 API 的类型化访问、响应与错误语义、文件传输和进度通知。
- `app-auth-session`：应用端认证生命周期、安全凭据持久化、认证状态以及会话作用域内的缓存隔离与清理。

### Modified Capabilities

无。现有 `android-app-foundation` 的可启动、依赖可构建和验证记录要求继续适用，不修改其规格。

## Impact

- 新增 `packages/cloud-client`，扩展 `pnpm-workspace.yaml` 的功能包匹配，更新必要的包依赖与锁文件；请求与响应 DTO 在该包内集中管理，不新增独立 contracts 工作区包。
- 客户端配置使用服务根地址，由内部路径构造固定的 `/api/v1/{channel}`；实际后端 API 路径保持不变。
- 新增 `apps/native/src/app/auth`、`app/query` 及必要的组装接入；具体目录职责见设计，不建立独立 auth、storage 或 contracts 公共包。
- Axios 归请求包；Nano Stores、React Query 和原生安全存储归应用端。建议采用与现有 Expo SDK 兼容的 `expo-secure-store`，凭据不进入普通 MMKV 偏好。
- 实现同步更新 `docs/architecture/code-organization.md`、`technology-stack.md` 及 `docs/development` 下的联调和配置说明。
- 以后端 `docs/frontend-integration.md` 与 OpenAPI 为契约依据；当前发现的 `gender=null` 描述冲突和下载成功载荷缺失需在对接记录中列明，不修改后端或猜测新接口。
- 不新增或变更服务端接口，不发布模型、不切换渠道版本，不承诺已有 Android 之外的平台已验证。
