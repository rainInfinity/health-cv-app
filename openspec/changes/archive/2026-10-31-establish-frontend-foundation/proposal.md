# Proposal

## Why

当前应用已有独立原生采集、认证和服务端查询能力，但入口仍以局部状态切页，页面各自维护样式、中文文案和系统栏，已选的导航、主题与偏好依赖尚未形成可复用的应用基础。现在按已确认的前端开发约定改造现有页面，可以为后续产品开发建立统一入口，同时避免基础建设演变为终版 UI 或测量流程重写。

## What Changes

- 建立统一应用组装，接入 React Navigation native-stack、浅色 ThemeProvider、已有 QueryClient 及应用级生命周期监听。
- 提供验证入口列表、主动 PPG、被动录像、传感器与语言设置路由；保留无需登录和云端配置的本地采集入口、被动采集深链及显式授权启停。
- 在 `shared/theme` 类型化实现文档已确认的 token；将现有验证页、相机查询与配置面板迁移至 styled-components/native 和实际复用的基础组件。`apps/native` 的 TypeScript 以 `@/*` 指向 `src/*`，跨模块引用使用别名；原生 UI 组件按组件名目录组织，入口为 `index.tsx`，styled-components 放在 `styles.ts`。不重新设计色板、字体或产品信息架构。
- 接入 MMKV 与 persistent，支持默认中文、英文和跟随系统的语言偏好；用户界面译文使用随应用打包的 locale JSON，按 `app/navigation`、`settings/language`、`acquisition/active`、`acquisition/passive`、`sensors/capture` 分类，并在各 locale 间保持相同键集；TypeScript 仅保留文案注册及状态／错误码映射。迁移导航、页面、提示、错误展示和格式化，保证重启保留与语言实时切换。
- 沿用现有认证、资源查询和会话隔离，落实查询新鲜期、缓存回收及 AppState／NetInfo 接入，不新增业务轮询或写操作重放。
- 显式适配导航失焦与卸载差异：离开主动页关闭相机并等待资源收尾；被动服务和传感器不因页面切换停止。
- 通过 Android development build 验证真实页面、语言、导航、采集和缓存行为，并在 `docs/development` 记录范围与证据。

非目标：终版首页、报告和产品底部导航；登录与历史页面；measurement 包、自动上传和云端处理编排；图表、历史或实时波形；深色主题、外部字体、Reanimated／Skia；恢复队列、文件自动清理和 iOS 采集实现。不为这些能力建立占位组件或接口。

## Capabilities

### New Capabilities

- `native-app-shell`：应用级组装、验证导航、统一浅色视觉与基础交互，以及导航切换中的原生资源生命周期。
- `app-localization`：语言偏好初始化、系统语言解析、功能文案切换与本地化格式化。
- `server-query-lifecycle`：服务端查询的新鲜期、回收、焦点／网络驱动刷新与刷新失败的数据保留。

### Modified Capabilities

无。既有 `android-app-foundation`、`app-auth-session`、`native-acquisition`、`android-passive-capture` 和 `android-sensor-acquisition` 的行为契约保持不变；本变更新增应用展示与生命周期接入要求，不重定义原生采集和认证协议。

## Impact

- 应用：`apps/native/index.ts`、`App.tsx`、`tsconfig.json`、`src/app/bootstrap.ts`、`src/app/query/*`，新增 app 的 providers、navigation、storage、preferences、i18n 模块与 locale JSON 资源，以及 shared/theme、shared/components；迁移现有 features 页面与组件。
- 依赖：复用现有 React Navigation、styled-components v6、Nano Stores、MMKV、React Query；新增并锁定与 Expo 57／RN 0.86.3 兼容的 expo-localization、NetInfo、lucide-react-native、react-native-svg，更新 pnpm 锁文件及必要的声明式 Expo 配置。
- 原生边界：不改采样热路径、CSV／视频协议、权限范围或后台运行策略；必要的 JS 错误展示适配保留原始错误码和参数。
- 文档和验证：实施时同步维护 `docs/development/frontend-development.md` 的实施状态及必要的架构说明，记录当前构建组合和实际验收，不将模拟器结果宣称为真机后台可行性或医学有效性。
- 不修改后端接口，不新增环境变量，不提交或推送代码。
