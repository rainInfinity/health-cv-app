# Proposal

## Why

登录与注册的请求错误目前会形成表单中的通用错误块，且只有按钮有过程 Loading；退出登录只有结果 Toast，没有同步的按钮和 Toast 过程反馈。统一认证操作反馈，让用户清楚操作是否仍在进行，并避免用户关闭 Loading 后误以为操作已结束。

原生 App 的 SVG 插画、品牌资源和图标分散在页面、导航及共享组件中；同步集中归属和导出入口，减少重复定义与跨页面引用，不改变现有视觉或业务行为。

## What Changes

- 登录、注册、确认退出登录后，同步展示按钮 Loading 和过程 Toast；Loading 按钮保留 Demo 的主题渐变，禁止重复提交，普通禁用态仍为灰色。
- 认证请求成功或失败时，以实际结果替换同一条 Loading Toast；结果提示在 3.5 秒后消失，不伪造成功。
- 认证过程和结果 Toast 不提供用户关闭入口，只允许代码替换、移除或按结果计时自动消失；非认证 Toast 保持现有交互。
- 移除认证表单中的通用请求错误块，包括“操作未完成，请稍后重试”；请求错误改为安全、具体的 Toast，本地必填、长度、确认密码校验仍保留在对应字段旁。
- 退出按钮的过程态持续到退出命令完成，不因认证状态提前变为游客而过早显示登录按钮；保留退出前确认和真实的本地清理、远端撤销结果。
- 同步反馈预览、相关行为验证和开发文档，区分可关闭的普通 Toast 与不可关闭的认证操作 Toast。
- 将原生 App 的 TSX 自绘 SVG 插画、业务图标、品牌组件和第三方图标引用集中到 `apps/native/src/shared/graphics/`，按 `illustrations`、`icons`、`brand` 分类，通过统一入口具名导出；独立 `.svg` 文件保留原路径，不纳入本次迁移。
- 完整迁移所有使用方，移除旧定义和旧路径转发；第三方图标复用现有依赖，不复制库源码。保留 token、尺寸、动画、数值驱动和无障碍语义，不迁移按钮、卡片和背景内部的 SVG 渐变实现。
- 在 `docs` 下记录资源分类、导出和新增方式，并对迁移影响的页面进行实际视觉回归；这部分仅调整代码组织，不新增规格能力。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `app-feedback`：允许调用方明确限制 Toast 的用户关闭能力，认证请求结果可以仅由 Toast 表达，本地字段校验、会话和权限等持续错误仍保留页面说明。
- `app-auth-session`：补充登录、注册、退出登录的双位置过程反馈、请求结果 Toast、重复提交防护和退出期间的页面状态要求；不改变认证协议与成功条件。

## Impact

- 原生页面：`apps/native/src/pages/user/AuthScreen/`、`UserScreen/` 及认证错误映射、简体中文认证文案。
- 共享反馈：`apps/native/src/shared/components/FeedbackHost/`、开发区 `FeedbackPreviewScreen/`；复用 `ActionButton` 已有 Loading 能力。
- 验证与说明：现有 Toast 生命周期及认证行为测试、Android 实际交互验证，更新 `docs/development/native-auth-session.md`。
- 图形资源：功能插画、首页指标图形、品牌 Logo、导航内联图标及各页面、共享组件的第三方图标引用；统一入口为 `@/shared/graphics`，实施时补充 `docs/development/native-graphics.md`。
- 无后端 API、依赖、凭据格式或认证状态枚举变更；不改设计 Demo、非认证业务错误呈现或其他页面布局。
