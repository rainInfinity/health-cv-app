# Native 认证会话与服务端缓存

## 显式运行配置

应用只在同时提供 `EXPO_PUBLIC_API_BASE_URL` 和 `EXPO_PUBLIC_CHANNEL` 时组装云端服务。服务地址是不含 `/api/v1` 的 HTTP(S) 根地址；渠道是普通渠道，不能为 `manager`。配置不从系统语言、时区或设备型号推断。模板位于 `apps/native/.env.template`；本机可在 `apps/native/.env` 覆盖配置，该文件已忽略，不要把账号、密码或令牌放入 Expo 公开环境变量。

缺少任一配置时，`App.tsx` 仍显示 `Hello World`，不会创建默认 API 客户端，也不会猜测要恢复哪个作用域。显式配置存在时，`apps/native/index.ts` 在注册根组件前导入 `src/app/bootstrap.ts`；该模块创建唯一的云端客户端、SecureStore 凭据适配器、认证管理器和 QueryClient，并启动一次会话恢复，因此不依赖 React 页面挂载。

## 认证状态和凭据

认证 Nano Store 只公开 `restoring`、`anonymous`、`authenticated` 和 `unavailable`。已确认时只包含 `userId`、`username`；不保存令牌、密码或完整资料。注册返回账号但不建立会话；登录先保存完整令牌对，再调用本人账号接口确认身份。

`expo-secure-store` 适配器把 Access/Refresh Token 作为一条 JSON 记录整体读写。存储键由规范化服务根地址和普通渠道确定，因此切换服务或渠道不会混用令牌。读写删除失败转成不含底层异常的 `CredentialStorageError`；不会回退到 MMKV、普通文件、Query Cache 或日志。

启动时没有记录则进入 `anonymous`。身份确认收到明确认证失效时按普通受控刷新规则处理；网络、超时或 5xx 使状态变成 `unavailable`，保留仍可能有效的安全凭据，不伪装成未登录。刷新凭据明确失效时删除本地令牌对。安全存储故障也发布 `unavailable`，受保护操作在状态恢复前被拒绝。

## 受保护请求与退出

应用 auth 模块识别 `401 / INVALID_TOKEN`，同一会话并发共享一次 Refresh Token 轮换；成功写入整对令牌后才更新内存 Access Token，并至多重发原业务请求一次。已使用新令牌的迟到 401 不再启动重复刷新。403、其他业务错误、网络失败和超时不触发通用刷新/重试；登录和刷新请求本身不进入受保护重发流程。

退出或重新登录会立即推进会话代次、移除内存 Access Token、中止旧代次受保护请求并清理相应查询和变更缓存。安全凭据写入与删除串行化，旧代次不能把晚到的令牌写回当前会话。退出会尽力用最新 Refresh Token 请求远端撤销；本地清理与远端确认分别返回结果。本地删除失败返回 `credentialDeletion: failed` 并将状态标为 `unavailable`，不伪装成本地退出成功。远端网络失败仍允许本地退出，但不会显示为已确认远端撤销；客户端丢弃旧 Access，不表示服务端立即撤销了已签发的 Access。

## React Query 数据边界

QueryClient 对查询和变更都关闭通用自动重试，不安装缓存持久化。本人账号、资料、模型目录、任务列表和详情等受保护资源按服务根地址、渠道和会话代次生成查询键；查询配置只在当前代次已确认认证时启用，并通过 auth 受保护请求入口传递取消信号。

注册、登录、刷新和登出直接消费 SDK 结果，不进入通用 `QueryCache` 或 `MutationCache`。资料 PATCH 只提交明确字段，成功后以服务端返回的完整资料替换当前代次资料缓存。退出/换账号仅清除匹配的受保护查询与变更，不删除其他服务、渠道、代次或非认证偏好。

当前 `App.tsx` 保留 Hello World 基线页面；此变更提供依赖组装与资源配置，不新增登录页、资料页、任务页、离线资料或任务轮询。

## 本地行为检查

在仓库根目录执行：

```sh
pnpm --filter @health-cv-app/native typecheck
pnpm --filter @health-cv-app/native test
```

行为测试覆盖安全凭据作用域、状态转换、共享刷新、取消与迟到响应、退出清理及资料缓存写回。它们不代替 Android 原生 SecureStore、React Native 文件 URI/Blob/进度/取消和实际服务端联调；实际运行记录见 [Android 开发与验证](./android-development.md) 与 [普通渠道云端请求接口](./cloud-client-api.md)。
