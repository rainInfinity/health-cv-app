# 原生图形资源约定

## 归属与入口

原生 React Native 图形组件统一归属 `apps/native/src/shared/graphics/`，公开入口为 `@/shared/graphics`。页面、导航和共享组件从该入口导入，不跨目录引用图形实现，也不直接导入 `lucide-react-native`。

| 分类 | 组件 | 契约 |
| --- | --- | --- |
| `illustrations/FeatureIllustration` | 五项功能插画 | `fingertip`、`face`、`pressure`、`oxygen`、`risk`；默认画布 96×84 dp |
| `illustrations/HealthIndicatorArtwork` | 首页指标图形 | `heartRate`、`respirationRate`、`oxygenSaturation`、`diabetesRisk`；血氧数值由 `value` 驱动，心率波纹遵循减少动态效果设置 |
| `brand/XinmuLogo` | 心沐品牌标志 | 原始 `0 0 160 160` 比例；默认尺寸 40 dp |
| `icons/HistoryIcon` | 历史导航自绘图标 | 24 dp 视图盒，颜色和尺寸由调用方提供 |
| `icons/index.ts` | 实际使用的 Lucide 图标 | 仅具名导出，不复制源码、不全量导出 |

根 `index.ts` 还导出 `FeatureIllustrationKind`、`FeatureIllustrationProps`、`HealthIndicatorArtworkKind`、`HealthIndicatorArtworkProps`、`XinmuLogoProps` 和 `HistoryIconProps`。当前 Lucide 具名项：

```ts
ArrowLeft, ArrowRight, Bell, Camera, ChevronRight, CircleAlert, CircleCheck,
CircleQuestionMark, Code2, Eye, EyeOff, FileText, House, Info, LayoutGrid,
LoaderCircle, ShieldCheck, SlidersHorizontal, UserRound, X
```

导入示例：

```ts
import { FeatureIllustration, LoaderCircle, XinmuLogo } from '@/shared/graphics'
import type { FeatureIllustrationKind } from '@/shared/graphics'
```

## 新增与维护规则

- 每个 React 图形组件使用同名目录；对外入口为 `index.ts`，实现与样式分别放在同级组件文件和 `styles.ts`（无需样式模块时不新增空文件）。
- 第三方图标只在 `icons/index.ts` 维护具名导出；新增前先确认原生调用方实际需要该图标。
- 图形目录内部使用同目录或内部模块路径，不能从聚合入口反向导入，以免形成循环依赖。
- 保留主题 token、尺寸、`viewBox`、渐变实例标识、无障碍语义和数据驱动行为；动态插画不得替换成静态图片。
- 按原有业务含义选择图形；不可只因外观相近就合并不同含义的组件。

## 独立 `.svg` 资源边界

独立 `.svg` 文件不属于原生 TSX 图形入口，继续保留原路径，不增加运行时导出：

- `apps/native/assets/xinmu-logo.svg` 由设计 Demo 的 `docs/design-demo/server.mjs` 映射到 `/brand-assets/xinmu-logo.svg`，并由 Demo 的页面引用。
- `apps/native/assets/brand-splash-preview.svg` 保留在原处；本次源码与文档范围内未发现消费者。
- Expo 开屏仍使用 `apps/native/app.json` 中的 `./assets/splash-bridge.png`，不改 PNG 链路。

## 原生视觉回归

2026-11-04 在 Pixel 5 AVD（Android API 37）检查首页指标图形、五项功能插画、我的、登录／注册、操作反馈预览和底部导航；资源迁移后没有缺图或页面布局漂移。血氧空值与有效值、心率波纹及减少动态效果也已检查。

登录、注册和退出按钮的 Loading 外观与设计 Demo 对齐：保留完整主题渐变和白色前景，显示旋转 `LoaderCircle`，但仍禁止重复触发；普通禁用态继续使用灰色外观。加载图标周期复用 `theme.motion.loadingCycle`（900 ms），开启减少动态效果时保持静止。Pixel 5 上通过 `transition_animation_scale=0` 检查静止状态，并已恢复原设置 `1.0`。

调试客户端左上角的 Expo 开发菜单浮层会遮挡顶部 Toast 图标的一部分；Toast 文案、安全区和同一共享 Loading 图标的按钮呈现均已检查。该遮挡仅存在于开发客户端，不属于产品页面资源。
