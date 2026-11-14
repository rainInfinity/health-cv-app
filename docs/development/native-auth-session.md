# Native 认证会话与服务端缓存

## 显式运行配置

应用只在同时提供 `EXPO_PUBLIC_API_BASE_URL` 和 `EXPO_PUBLIC_CHANNEL` 时组装云端服务。服务地址为不含 `/api/v1` 的 HTTP(S) 根地址；渠道为普通渠道，不能是 `manager`，不从系统语言、时区或机型推断。模板为 `apps/native/.env.template`，本机可用已忽略的 `apps/native/.env` 覆盖；账号、密码和令牌不得放入 Expo 公开环境变量。

缺少任一配置时仍可浏览产品页，但不创建默认 API 客户端、不猜测恢复作用域，登录／注册提交禁用且不额外显示配置错误。配置存在时，`apps/native/index.ts` 在注册根组件前导入 `src/app/bootstrap.ts`，创建唯一云端客户端、SecureStore 适配器、认证管理器和 QueryClient，并启动一次恢复，不依赖 React 页面挂载。

## 认证状态与凭据

认证 Nano Store 仅公开 `restoring`、`anonymous`、`authenticated`、`unavailable`；身份已确认时仅含 `userId`、`username`，不保存令牌、密码或完整资料。注册返回账号但不建立会话；登录先保存完整令牌对，再调用本人账号接口确认身份。

`expo-secure-store` 将 Access/Refresh Token 作为一条 JSON 记录整体读写。键由规范化服务根地址和普通渠道确定，切换服务或渠道不混用令牌。读、写、删除失败均转为不含底层异常的 `CredentialStorageError`，不回退到 MMKV、普通文件、Query Cache 或日志。

启动无记录时进入 `anonymous`。身份确认明确认证失效时进入受控刷新；网络、超时或 5xx 转为 `unavailable`，保留可能有效的安全凭据，不冒充未登录。刷新凭据明确失效时删除本地令牌对；安全存储故障同样进入 `unavailable`，恢复前拒绝受保护操作。

## 刷新、退出与迟到结果

应用 auth 模块识别 `401 / INVALID_TOKEN`，同一会话的并发请求共享一次 Refresh Token 轮换；整对令牌写入成功后才更新内存 Access Token，原业务请求至多重发一次。已使用新令牌的迟到 401 不再触发重复刷新。403、其他业务错误、网络失败和超时不触发通用刷新／重试；登录与刷新本身不进入受保护重发流程。

退出或重新登录立即推进会话代次、移除内存 Access Token、中止旧代次受保护请求，并清理对应查询与变更缓存。安全凭据写入和删除串行化，旧代次不能用晚到令牌覆盖当前会话；迟到业务响应也不能写回新会话缓存。

退出尽力使用最新 Refresh Token 请求远端撤销，本地清理与远端确认分别返回结果：

- 本地删除失败返回 `credentialDeletion: failed`，状态为 `unavailable`，不得呈现为本地退出成功。
- 远端网络失败不阻止本地退出，但不得呈现为已确认撤销。
- 丢弃旧 Access Token 不代表服务端立即撤销已签发的 Access Token。

## 受保护缓存与产品展示

受保护查询仅在当前代次身份已确认时启用，按服务根地址、渠道和会话代次隔离，并经 auth 入口传递取消信号。退出／换号只清理匹配的受保护查询和变更，不删除其他服务、渠道、代次或设备偏好。通用缓存时效、联网行为及文件保留归 [前端开发约定](./frontend-development.md#4-查询缓存与文件保留)。

注册、登录、刷新、登出直接消费 SDK 结果，不进入通用 QueryCache 或 MutationCache。资料 PATCH 仅提交明确字段，成功后用服务端完整资料替换当前代次缓存。

仅 `authenticated` 展示产品固定本地 mock；`anonymous`、`restoring`、`unavailable` 不显示 mock 健康读数。认证切换时已打开详情同步清空。mock 不是真实健康资料，不进入 Query Cache 或持久化；认证操作仍使用真实 auth 模块与服务端请求。

## 登录、注册与退出反馈

本地表单校验使用内联字段提示；请求错误使用不可关闭结果 Toast，不写入字段错误。登录、注册分别显示过程文案，提交锁同时阻止按钮与键盘重复提交。登录成功进入“我的”，注册成功返回登录页并预填用户名。

认证过程与结果 Toast 均不显示关闭控件，触摸、横向滑动和系统返回不能关闭。过程提示不自动过期，替换为结果后从替换时开始计时 3.5 秒；跨导航保留。普通可关闭反馈与通用加载外观遵循 [前端开发约定](./frontend-development.md#26-组件与统一反馈)，不为认证维护第二套加载动画或主题参数。

退出只在确认后开始。本地会话可先变为游客，但延迟中的退出命令仍占用操作区并显示“退出中…”，不允许从账号入口开始新登录；结果分别说明凭据删除失败、远端撤销未确认、成功或意外失败，不将远端未确认改写为成功撤销。

## 当前限制与维护检查

认证过程的根级 Toast 会遮住 `AuthToolbar` 的页面返回与顶部模式切换控件；Android 系统返回仍可用，且不会关闭 Toast。Expo 开发菜单浮层也可能遮挡顶部 Toast 图标，该浮层不属于产品资源。完整软键盘弹起布局、实体设备表现及生产服务覆盖仍不完整。

在仓库根目录执行本地检查：

```sh
pnpm --filter @health-cv-app/native typecheck
pnpm --filter @health-cv-app/native test
```

维护时关注凭据作用域与删除失败、恢复状态、共享刷新、退出竞态、取消与迟到响应隔离、资料缓存写回及重复提交。上述检查不代替 Android 原生 SecureStore、React Native 文件 URI／Blob／进度／取消或实际服务联调；操作说明见 [Android 开发与验证](./android-development.md)，请求合同见 [普通渠道云端请求接口](./cloud-client-api.md)。
