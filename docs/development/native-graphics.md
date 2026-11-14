# 原生图形资源约定

## 归属与入口

可复用原生图形位于 `apps/native/src/shared/graphics/`，公开入口为 `@/shared/graphics`。页面、导航与共享组件不跨目录引用实现，也不直接导入 `lucide-react-native`。

| 入口 | 契约 |
| --- | --- |
| `illustrations/FeatureIllustration` | 五项功能插画：`fingertip`、`face`、`pressure`、`oxygen`、`risk`；默认画布 96×84 dp |
| `illustrations/HealthIndicatorArtwork` | 首页 `heartRate`、`respirationRate`、`oxygenSaturation`、`diabetesRisk`；血氧由 `value` 驱动，心率波纹遵循减少动态效果 |
| `brand/XinmuLogo` | 品牌标志，保持 `0 0 160 160` 比例，默认 40 dp |
| `icons/ProductTabIcon` | 四个产品 Tab 的同轮廓描边／实心图标，固定 24 dp；历史实心态时针用实例唯一蒙版镂空 |
| `icons/index.ts` | 仅具名导出实际使用的 Lucide 图标，不复制源码或全量导出 |

根入口同时导出各组件的 Props 和类别类型；完整清单以 `shared/graphics/index.ts` 为准。

```ts
import { FeatureIllustration, LoaderCircle, XinmuLogo } from '@/shared/graphics'
import type { FeatureIllustrationKind } from '@/shared/graphics'
```

## 来源、生成与维护边界

功能插画按 [设计 Demo](../design-demo/README.md) 原稿绘制为本地 TSX；首页心率、呼吸和圆形血滴路径来自旧项目 `src/assets/iconfont/` 的 `IconXinlv`、`IconFei`、`IconXueya`，不依赖旧组件或字体。品牌资源与 Demo 共用本地标志。复用路径不是授权证明：保留来源，第三方图标遵循依赖许可，新增或复用旧素材前先核实授权，不把未确认授权写成已获许可。

- 新组件使用同名目录、`index.ts` 入口和独立 TSX，实现样式放同级 `styles.ts`，无样式不建空文件。
- 图形内部仅使用局部或内部模块导入，不反向导入聚合入口，避免循环依赖。
- 保留主题 token、尺寸、`viewBox`、实例唯一渐变／蒙版 ID、无障碍语义和数据驱动行为；动态插画不能替换为静态图片。
- 人工维护的图形组件与生成源、生成脚本、生成产物分开管理，不把 SVG Path 下标作为长期业务接口，不运行时下载图标。主题总览图的生成流程归 [前端主题约定](./frontend-development.md#主题总览图维护)，不手工维护另一套参数。
- 按业务含义选图，不因外观相似合并不同语义；装饰颜色不表示医学状态。功能插画根 SVG 使用 `fill="none"`，避免仅描边路径继承默认黑填充。

## 独立 SVG 与开屏资源

独立 `.svg` 不属于 TSX 聚合入口，保留原路径且不增加运行时导出：

- `apps/native/assets/xinmu-logo.svg` 由 `docs/design-demo/server.mjs` 映射到 `/brand-assets/xinmu-logo.svg` 供 Demo 使用。
- `apps/native/assets/brand-splash-preview.svg` 当前没有消费者。
- Expo 开屏使用 `apps/native/app.json` 的 `./assets/splash-bridge.png`；独立 SVG 不替代该 PNG 链路。

## 产品检测页图形

### 操作照片与页面专用插画

功能卡和准备页通过 `app/measurement/operationPhotos.ts` 选择页面专用尺寸：`card` 为 480×480，`guide` 为 828×828，均由原图等比 Lanczos 缩小，不裁切、不改色。面部源图为 `op3.png`、指尖为 `op1.png`、贴胸为 `op2.png`；原图保留，运行时分别引用 `opN-card.png` 和 `opN-guide.png`，避免小卡片解码原始大图。`CapturePhoto` 在右侧 44% 图片区域使用原生 multiply，并以横纵 alpha 蒙版软化边缘，不用白色遮罩掩盖原图白底。

检测部位卡片的柔和阴影由外层圆角容器绘制，内层关闭自身阴影，仅负责圆角裁剪、渐变与照片乘色；阴影节点不与隔离混合层共用，避免 Android 合成时露出矩形硬边。

更新源图后，在仓库根目录重新生成两档 PNG：

```sh
uv run --no-project --with pillow python - <<'PY'
from pathlib import Path
from PIL import Image
root = Path('apps/native/assets')
for name in ('op1', 'op2', 'op3'):
    with Image.open(root / f'{name}.png') as image:
        for kind, size in (('card', 480), ('guide', 828)):
            image.resize((size, size), Image.Resampling.LANCZOS).save(
                root / f'{name}-{kind}.png', optimize=True)
PY
```

准备页 `OperationPhoto` 复用 Demo 的 360 坐标系、138 半径圆裁、双水纹及端点渐隐几何。照片使用原生 Image 与圆形容器裁剪，固定画布只作整体缩放；水纹使用预计算路径与端点分段透明度，避免 SVG 图片裁剪和离屏蒙版参与入页转场。私有 `FingertipInstructionArtwork` 移植 Demo 正面／背面 SVG；`FingertipPreview` 的覆盖环、红色渐入和说明图局部节点共享线性 Animated 值，百分比独立读取实际动画进度，不以每个覆盖快照重绘整页。静态黑色底图、红色渐变和动态覆盖环分层，红色层缓存后只调整透明度，避免圆环每帧重绘径向渐变；中央产品提示用原生白色浮层叠放，不参与 SVG 栅格化，不再显示相机占位图标或圆形下方的提示行。后台／失焦暂停或清理，减少动态效果时直接更新。上述页面专用组合不扩充通用图形接口，照片和模拟覆盖不属于采集数据。

### Android SVG 陷阱

- `react-native-svg` 的停靠点字符串必须带前导零：使用 `offset="0.32"`，不能照搬 Web 的 `offset=".32"`；Android 会将后者当作零位置，造成照片消失或渐变过早变白。
- 渐变停靠点的透明度显式使用 `stopOpacity`，不能只把零透明度写在 `stopColor` 的 RGBA 中；当前库解析渐变时会用 `stopOpacity` 重写 alpha。脉搏波固定渐隐层两端使用同一表面色，透明度分别为 1 和 0，避免退化成硬遮挡。
- 用户空间蒙版使用数值裁切边界，避免 Android 百分比边界得到空画面。功能卡片的蒙版边界覆盖窗口，实际渐隐矩形与照片按 SVG 画布百分比铺满；不设 `viewBox`，由原生画布尺寸保持裁剪比例，无需等待 `onLayout` 回传。
- 每个实例使用独立渐变／蒙版 ID，保留 alpha 语义，不依赖未实现的 SVG `FeImage`。
- SVG 的 Animated 变换使用数值变换数组，不传插值后的 `translate(...)` 字符串；Fabric 的原生 View 变换属性接收数组，字符串可能触发类型转换崩溃。

### 预览与波形分层

面部取景四角位于 `FaceMeasurementScreen`：24×2 dp 实色线段向画面内侧填充，不使用边界上被裁半的描边；同一径向渐变经四次方向变换还原 24 dp 色块内 22→22.5 dp 过渡与 35% 青色弧形衬底。图形和真实预览分层，构图圆不代表算法 ROI。

产品面部与指尖共用 `shared/components/PulseWaveHistory` 管理固定六秒回看、窗口范围和回到最新浮层，图表只接收窗口、边缘邻点及最多 200 ms 预绘区，由 `PulseWaveChart` 使用 ECharts 原生 SVG 绘制。`ScrollingSvgChart` 在 SVG 提交后用原生合成层平移，不逐帧改写路径；坐标区域固定裁切，基线和渐隐不随图层移动。Dev 真实 RPPG 沿用 `RPPGWaveform` 的有限样本适配。产品绘图区随剩余空间实测伸展，保留左 4／右 12／上下 8 dp 留白，最小高度不限制实际画布；回到最新浮层相对实际绘图区居中，不包含标题。其他预览、覆盖环和操作插画仍使用原有 SVG。历史保留、固定窗口、幅度映射、断线、样本不改写及有效心率边界统一见 [图表与波形](./frontend-development.md#24-图表与波形)。

检测状态圈使用 `shared/components/LoadingIndicator`，面部进行中、指尖覆盖／检测中旋转，待开始和结束静止；通用周期与减少动态效果见 [前端主题约定](./frontend-development.md#21-样式组织与主题)，不额外添加加载说明文案。
