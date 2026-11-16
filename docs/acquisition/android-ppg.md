# Android 相机 PPG 采集协议

## 范围与数据边界

Android 后置相机 PPG 的 CameraX、像素处理、队列与 CSV 写入均在原生侧；JavaScript 只接收控制结果、低频状态、提示、结构化错误和完成产物引用，不接收 `ImageProxy`、像素、原始 PPG 行或逐帧相机元数据。原生预览通过 Nitro 视图呈现，不经 JavaScript 传递图像。有界展示标量是显式例外：`AcquisitionClient` 提供独立的指尖脉搏订阅，RPPG 使用其独立客户端，详见 [Android RPPG 采集说明](android-rppg.md)。两者不放开原始记录批次接口；血压只提供低频事实，不提供血压、心震波形或原始 IMU 订阅。

PPG 路径不提供 iOS、上传、云端处理、真实覆盖面积或医学质量判断。共享 `DataHub<T>` 已用于 PPG、RPPG 和传感器，各数据源与会话持有独立实例。

## 主动采集控制器

`PPGRuntime` 为 Nitro `Acquisition` 控制对象与 `CameraPreview` 视图提供同一个进程级 `PPGController`。控制器持有主动 PPG 相机、预览视图引用、相机会话和活动 `PPGCaptureSession`，并串行执行打开、开始、停止和关闭命令；挂载预览视图本身不会打开相机。每个 Nitro 控制实例持有独立调用方身份；共享控制器不等于任意实例都可停止当前所有者的相机。指尖与血压各有原生轮次控制器，准入、截止及文件屏障不依赖页面订阅；同一相机控制实例不能绕过手动 PPG、指尖和血压之间的活动方案互斥。

相机回调绑定其所属的会话引用并交给 `PPGFrameHandler`，关闭或切换会话后的旧帧不能写入新会话。控制器通过低频快照和状态监听发送运行状态、经验提示及既有结构化错误码与消息；图像、像素和逐帧记录不传给 JavaScript。

## 相机能力查询与冻结配置

调用方可先枚举并查询，不必先申请权限。`listCameras()` 不申请权限；能力与组合查询也不弹授权。受权限阻止读取的单项返回 `permission-required`，字段缺失或查询失败返回 `unknown`，二者都不等同于明确不支持。调用方可显式调用 `requestCameraPermission()` 后重新查询；授权不会打开相机。只有用户明确调用 `openCamera(config)` 才请求相机使用权并绑定预览。

启动前查询按所选逻辑相机执行，查询值仅是当时快照：

```ts
const cameras = await client.listCameras()
const cameraId = cameras.find((camera) => camera.facing === 'back')?.cameraId
if (cameraId == null) throw new Error('当前没有可用后摄')

let capabilities = await client.getCameraCapabilities(cameraId)
if (
  capabilities.exposureTimeNanos.status === 'permission-required'
  || capabilities.iso.status === 'permission-required'
) {
  await client.requestCameraPermission()
  capabilities = await client.getCameraCapabilities(cameraId)
}
const captureOptions = await client.getSupportedCaptureOptions(cameraId, {
  targetResolution: { width: 720, height: 720 },
  targetFps: 30,
})
```

`getSupportedCaptureOptions` 对输入尺寸构造一个未绑定的 Preview + YUV `SessionConfig`，以 CameraX 的组合支持性和该配置对应的帧率范围返回单项结果。明确不兼容为 `unsupported`；不能确认组合或没有可用帧率元数据为 `unknown`。支持范围是候选，不承诺实际交付尺寸或 FPS；目标帧率不在范围时，打开阶段仍须协商并报告调整原因。不得把单项尺寸和通用帧率做笛卡尔积。结果同时返回本地最大 64 块及按候选像素尺寸约束的行列上限。查询不绑定生命周期、不占用相机租约、不启用 torch、不启动分析、不创建会话文件；打开时重新检查权限、相机 ID、能力和组合状态。

完整配置采用一个对象，打开后至关闭期间冻结：

| 字段 | 语义与约束 |
| --- | --- |
| `cameraId` | 当前设备枚举得到的逻辑相机标识；显式选择失效或不兼容时失败，不替换成另一镜头。 |
| `targetResolution.width/height` | 目标分析尺寸偏好，单位像素，正整数；组合查询结果及打开结果分别说明兼容性和实际提交值。 |
| `targetFps` | 目标帧率偏好，单位帧／秒，有限正数；不代表 CameraX 实际交付 FPS。 |
| `torchEnabled` | 是否明确请求补光；请求开启但设备不支持时失败，不静默关闭。 |
| `exposure.mode` | `auto` 或 `manual`；自动模式使用补偿索引与可选 AE 锁，手动模式使用曝光时间和 ISO。 |
| `exposure.timeNanos` | 手动曝光时长，单位纳秒，正的 JavaScript 安全整数；自动模式必须为 `null`，不是启动等待时间。 |
| `exposure.iso` | 手动模式的正整数 ISO；自动模式必须为 `null`。 |
| `exposure.compensationIndex` | 自动曝光补偿的整数设备索引；手动模式必须为 `null`。实际 EV 为索引乘设备步长，例如步长 `1/3 EV` 时索引 `3` 对应 `1 EV`。 |
| `exposure.locked` | 仅自动曝光允许请求 `true`；每次正式开始前都须由当前相机周期的拍摄结果确认。 |
| `whiteBalance.mode` | `auto`、`off` 或当前设备明确支持的预设模式；`off` 不代表可设置增益或色温。 |
| `whiteBalance.locked` | 仅自动白平衡允许请求 `true`，并须在正式采集开始前确认。 |
| `focus.mode` | `auto`、`off` 或 `manual`，须由所选相机能力明确支持。 |
| `focus.distanceDiopters` | 手动对焦距离，单位屈光度；`0` 表示无穷远，其他模式必须为 `null`。 |
| `processing.blocks` | 两个正整数 `[rows, columns]`，默认 `[1, 1]`；`rows` 沿有效图像的纵轴、`columns` 沿横轴，块按行优先编号；网格大小不得超过查询返回的本地处理限制。 |

配置校验区分 `INVALID_CAMERA_CONFIG`（形状、互斥或数值越界）、`CAMERA_PARAMETER_UNSUPPORTED`（设备明确不支持的显式控制）与 `CAMERA_CAPABILITY_UNAVAILABLE`（权限不足或能力未知）。校验失败必须发生在取得相机占用或创建输出文件之前。曝光、ISO、补光、白平衡、对焦及锁定不裁剪、不忽略、不切换自动模式；尺寸和帧率偏好只能按已查询的组合选项协商，并记录调整原因。

一次打开结果与低频快照分别保留 `requestedConfig`、`submittedConfig`、调整原因、实际图像尺寸／有效区域、观测 FPS 和实际分块布局。请求值或 CameraX 设置 Future 不代表硬件拍摄结果。需要更改相机或参数时先关闭再重新打开；不支持采集中动态调参。

### 配置冻结与自动算法锁

`openCamera(config)` 在申请相机租约前重新查询并验证所选 cameraId、Preview + YUV 组合及完整配置；绑定后冻结请求值、实际提交值和明确的尺寸／FPS 调整原因。查询结果是启动前快照，不替代打开阶段复核；打开后的参数变更必须先关闭，再提交新的配置。

`exposure.locked` 只适用于自动曝光，`whiteBalance.locked` 只适用于自动白平衡。开始正式采集时，原生侧提交锁请求，并在当前相机周期等待晚于最近预览结果、时间戳递增且 AE／AWB 状态匹配的真实 `TotalCaptureResult`；等待最多 2 秒。确认帧和更早的在途图像不会进入正式窗口；锁确认前不创建文件、不进入 `capturing`。超时、设备中断或结果状态不匹配会使开始失败、关闭该相机周期并释放对应租约。

正常停止先排空并完成文件，再解除本周期请求过的锁，等待新结果确认相应锁状态为 `false`。解除失败时完成文件仍作为产物保留，但相机会关闭、状态报告错误，不承诺预览可复用。关闭或后台中断直接收尾并解绑相机；迟到结果不得启动或恢复已关闭的周期。

## DataHub<T> 有界批处理

每个数据流／采集会话拥有独立 `DataHub<T>` 实例、容量、触发条件、消费者和终态；实例间不共享队列或批次元数据。当前 PPG 默认值如下：

| 参数 | 默认值 | 语义 |
| --- | ---: | --- |
| `capacity` | 256 条 | 已接收但尚未完成消费的记录上限；包含待消费记录及当前在途批次 |
| `batchSize` | 50 条 | 数量触发阈值，同时也是每批最大记录数，不是容量 |
| `intervalMillis` | 1000 ms | 从一个待消费批次的首条记录开始计时；超时后触发消费 |

`offer` 只执行短暂的有界入队，不等待消费者或文件 I/O，也不在生产线程调用消费者。返回值区分 `ACCEPTED`、`CAPACITY_EXCEEDED`、`CLOSED` 和 `FAILED`。队列使用固定容量环形存储和单个后台消费者；数量阈值、时间阈值与正常关闭统一唤醒该消费者，批次按接收顺序且至多交付一次。

消费者收到的 `List<T>` 是环形存储的临时视图，不复制批次。消费者必须在挂起函数返回前完成读取，不能保留列表或异步继续访问；只有消费者返回后才释放该批次的容量额度。正在消费期间再次达到数量阈值时，也不会并发启动第二个消费者。

`closeAndDrain` 停止接收、取消定时器、顺序消费尾批并等待当前消费者结束；重复关闭等待同一后台屏障。成功表示所有已接收记录均已消费完成。消费者异常会成为终态错误：停止接收、清除未交付记录、唤醒等待者，`closeAndDrain` 抛出该错误，不自动重试。容量不足同样不阻塞相机等待磁盘、不覆盖或静默丢弃后继续成功；当前 `PPGCaptureSession` 会终止并且不返回完成产物。

## 像素借用与处理器扩展

`CameraX ImageProxy` 只在当前帧同步处理期间有效。`PixelFrameView` 保存完整帧尺寸、有效裁剪区域、方向、镜像语义、会话／帧标识、时间戳和 Y/U/V 平面布局；当前后摄不镜像，颜色空间不可用时为 `null`。每个 `PixelPlane` 用 `ByteBuffer`、`baseOffset`、`rowStrideBytes`、`pixelStrideBytes` 和平面样本尺寸寻址，读取使用绝对位置，不改变缓冲区 `position`，也不复制或旋转整帧。

`PixelReader` 只允许读取有效裁剪区域内的像素。Y 坐标使用原帧像素坐标；4:2:0 色度坐标映射为 `(x / 2, y / 2)`，U/V 可为不同偏移、不同视图或共享底层色度缓冲。填充字节和裁剪区外样本不会被当作有效像素。

`FramePipeline` 在同一借用作用域中先执行一次 `PixelStatisticsExtractor`，再同步执行处理器和帧完成回调；正常返回或任一处理失败时，都会先使 `PixelFrameView` 失效，再统一关闭 `ImageProxy`。处理器可以读取完整像素和共享统计，但不得保留帧引用、修改缓冲或将像素读取交给异步任务。新增空间算法时实现独立 `PixelProcessor`，按需读取 `PixelReader` 的完整有效像素；共享均值不是所有算法的强制输入。异步 DataHub 只接收脱离帧生命周期的数值记录。

## 二维分块坐标与色度边界

每帧按 `ImageProxy.cropRect` 的实际有效区域划分 `[rows, columns]` 网格；左上角为坐标起点，`x` 增加对应列、`y` 增加对应行。相机旋转和预览镜像不改变原始分析帧中的块身份。每个轴先将长度整除为基础尺寸，再把余数像素从首行／首列开始逐个分配；各块连续、非空，行优先编号为 `blockIndex = row * columns + column`。实际 crop 不能容纳请求行列数或块数超过 64 时，拒绝该帧配置，不生成部分统计。

Y 均值只使用该块中的有效亮度像素。U/V 来自 4:2:0 色度平面：一个色度样本代表相邻的 2×2 亮度单元；若此单元与块边界相交，该样本在每个相交块各计一次，不按面积拆分，也不在单块内重复。因而不同块的色度样本集合可重叠，块均值分母是该块实际相交的色度样本数；分块色度计数之和不必等于全帧色度样本数。全帧均值独立计算，不随网格改变，预览经验提示继续使用全帧结果。

用于说明边界的像素夹具为 7×5 帧、非零 crop `[1,1,6,4)`、行填充、交错 U/V 和 `[2,3]` 网格。该 5×3 有效区域按列宽 `2,2,1`、行高 `2,1` 分配，完整区域均值为 Y/U/V `23/35/135`；块均值按 `blockIndex` 顺序为 `16.5/30/130`、`18.5/40/140`、`20/45/145`、`31.5/45/145`、`33.5/55/155`、`35/60/160`。跨块共享色度样本按各块真实分母分别计算。

## PPG CSV 字段与时间语义

每个正式帧按冻结网格输出 `rows × columns` 条 PPG 记录；`[1,1]` 时仍只有一条全帧记录。行优先的 `blockIndex` 从 `0` 连续至 `rows × columns - 1`；同一帧的所有块共享 `timestamp`、`timestampFrame`、`timestampSystem` 和 `frameIndex`。Y/U/V 是各块原始通道均值，范围 0–255；U/V 按与该块相交的色度单元计数，详见前节边界规则。

UTF-8 CSV 表头保持不变：

```text
timestamp,timestampFrame,timestampSystem,avgY,avgU,avgV,frameIndex,blockIndex
```

| 字段 | 含义 | 单位／约束 |
| --- | --- | --- |
| `timestamp` | 开始处理该帧时读取的 `SystemClock.elapsedRealtimeNanos()` | 毫秒小数；单调启动后时间，不是帧曝光时间 |
| `timestampFrame` | CameraX `ImageInfo.timestamp` | 纳秒换算为毫秒小数；同帧所有块完全相同 |
| `timestampSystem` | 开始处理该帧时读取的 `System.nanoTime()` | 毫秒小数；不是 Unix 日期或墙上时间 |
| `avgY` | 当前块有效区域内 Y 平面均值 | 0–255 |
| `avgU` | 与当前块相交的 U 色度样本均值 | 0–255 |
| `avgV` | 与当前块相交的 V 色度样本均值 | 0–255 |
| `frameIndex` | 正式会话实际接收帧的序号 | 每个会话从 0 递增；同一帧的所有块相同 |
| `blockIndex` | 当前帧的行优先块编号 | 从 0 递增；`[1,1]` 固定为 0 |

时间保留毫秒小数，不截断为整数。帧率请求值与 CameraX 实际交付时间分开；递增帧号不代表采样完整。`PpgRecordProcessor` 只转换帧元数据与共享统计，不访问队列或文件；`PPGCsvEncoder` 与 `FrameCsvEncoder` 分别从同一配对记录编码既有八列协议，`CsvBatchWriter` 复用行缓冲并按收到的批次顺序写入，不另建队列或消费者。

## Camera2 逐帧元数据与 `frame.csv`

CameraX `ImageAnalysis` 在构建时注册 `Camera2Interop.Extender(...).setSessionCaptureCallback(...)`。`onCaptureCompleted` 从对应 `TotalCaptureResult` 读取实际结果，不使用请求值代替测量值。预览期间由 `PPGController` 以固定 64 条有界环形缓冲保留最近的含 `SENSOR_TIMESTAMP` 数值结果；正式会话启用时转交缓存，以覆盖回调先于图像交付的在途帧。PPG 图像的 `ImageProxy.imageInfo.timestamp` 必须与结果中的 `CaptureResult.SENSOR_TIMESTAMP` 完全相等才配对；两侧只缓存独立数值，不保留 `ImageProxy` 或 Camera2 对象，并按 `frameIndex` 顺序提交。

UTF-8 `frame.csv` 表头严格为：

```text
timestamp,timestampFrame,timestampSystem,exposureTime,durationTime,rollingShutterSkewTime,iso,whiteBalanceMode
```

| 字段 | 来源与含义 | 单位／缺失语义 |
| --- | --- | --- |
| `timestamp` | 完成回调时读取的 `SystemClock.elapsedRealtimeNanos()` | 毫秒小数；单调时钟 |
| `timestampFrame` | `CaptureResult.SENSOR_TIMESTAMP`，与 PPG `timestampFrame` 精确对应 | 纳秒换算为毫秒小数 |
| `timestampSystem` | 完成回调时读取的 `System.nanoTime()` | 毫秒小数；不是 Unix 日期 |
| `exposureTime` | `SENSOR_EXPOSURE_TIME` 实际曝光时长 | 纳秒；结果缺失时为 `0` |
| `durationTime` | `SENSOR_FRAME_DURATION` 实际帧时长 | 纳秒；结果缺失时为 `0` |
| `rollingShutterSkewTime` | `SENSOR_ROLLING_SHUTTER_SKEW` 实际滚动快门时长 | 纳秒；结果缺失时为 `0` |
| `iso` | `SENSOR_SENSITIVITY` 实际 ISO | 整数；结果缺失时为 `0` |
| `whiteBalanceMode` | `CONTROL_AWB_MODE` 实际白平衡模式 | Camera2 整数枚举；结果缺失时为 `0` |

缺少 `SENSOR_TIMESTAMP`、正式帧未匹配、重复时间戳或有界关联缓存溢出都会显式失败。停止时最多等待 Camera2 结果 1 秒；仍未匹配的正式帧不写成成功记录。一个 `frameIndex` 对应一条 `frame.csv` 记录和同一 `timestampFrame` 下连续的多条 PPG 块记录；关联按精确传感器时间戳完成，不按 CSV 行号配对。

`PPGSessionOutput` 管理双 writer 的打开、顺序消费、关闭、两份路径提升与回退；只有两份已关闭文件均提升成功后，才生成 `files[]` 产物引用。任一侧失败都不返回完成会话。

## 经验提示

`CoverageHintProcessor` 独立于 DataHub 和文件写入，仅在最新提示状态变化时通知。有效统计到达前，`showSurroundingTip` 和 `showCoveringTip` 均为 `null`，表示未评估。

提示沿用旧 Android 经验公式：

```text
r = Y + 1.5748 × (V - 128)
g = Y - 0.1873 × (U - 128) - 0.4681 × (V - 128)
b = Y + 1.8556 × (U - 128)
```

`showSurroundingTip` 在 `avgY < 25` 时触发。若 `r + g + b > 0`，按该和归一化三个通道；否则三个比例均为 `0`。`showCoveringTip` 在 `redRatio <= 0.5`、`greenRatio >= 0.2` 或 `blueRatio >= 0.2` 任一条件成立时触发。

这些只是由全帧均值推导的经验操作提示，不是逐像素覆盖判定、面积比例、信号质量门禁或医学结论；不会自动阻止或延长独立手动采集。产品指尖使用下面独立的空间估计与稳定门控，不能把旧布尔值转换为覆盖百分比。

## 产品指尖的覆盖与正式窗口

产品指尖复用原始 PPG 保存链，但与手动 `startCapture()` 的开始规则不同。明确进入本轮指尖页后，应用申请权限，等待 `CameraPreview` 的 Nitro 引用及正尺寸布局，查询并选择真实后摄，组装单块 `[1,1]`、默认三十秒配置；尺寸／帧率偏好为 720×720、30 FPS，不代表真实交付。补光是可选辅助能力：仅在能力明确支持时请求开启，不支持或未知时以 `torchEnabled=false` 继续真实预览与覆盖观测，不单独阻断检测。缺少后摄仍如实失败，不换前摄，不增加打开／手动开始控制面板。通用采集的显式配置校验不变，已请求开启但实际应用补光失败仍按真实错误处理；无补光不放宽覆盖或信号规则。

覆盖估计在原生同步读取与圆形中心裁剪预览对应的 ROI，用固定 16×16 空间网格按有效区域面积加权，不复制整帧，也不改变 CSV 分块。各单元用 YUV 派生颜色判断红色占优，排除纯黑／全通道过曝等无判别输入。`coveragePercent` 为 0–100 的估计值，`coverageState` 为 `unknown / uncovered / partial / complete`；无有效输入为 `null`，不能补成 0 或 100。仅完整通过才显示 100，有限采样比例不是精确物理面积、置信度或医学质量。

指尖算法独立使用 BT.601 全范围颜色假设：`r = Y + 1.402(V−128)`、`g = Y − 0.344136(U−128) − 0.714136(V−128)`、`b = Y + 1.772(U−128)`，覆盖分类时各通道限制在 0–255。每网格单元最多读取 2×2 个真实采样点，亮度须大于 8，排除 RGB 全部不小于 250 的输入；红色判定为 `r ≥ 40`、`r > 1.25g`、`r > 1.25b` 且 `r−g ≥ 20`。这些是待真实设备校准的固定工程基线，不沿用旧提示的颜色公式，也不针对某段录像动态调整阈值。无判别区域不能从分母移除后制造完整覆盖，整帧无判别则返回未知。

固定配置位于 `ppg/fingertip/FingertipSignalConfig.kt`：覆盖版本仍为 `fingertip-bt601-full-grid16-v1`，独立展示版本为 `fingertip-red-bt601-dt-bandpass-v3`，带通截止频率由 `BANDPASS_LOW_HZ / BANDPASS_HIGH_HZ` 固定为 0.75／3 Hz。正式展示采用未截断红色通道 `Y + 1.402(V−128)`，不逐帧切换通道或增加展示增益，不把覆盖分类的通道裁剪回写到信号或 CSV。

`coverageReady` 独立于百分比：完整覆盖连续三秒且输入新鲜后才就绪；超过二百毫秒帧缺口、时间回退或输入失效会清除准入稳定累计。一般覆盖通知最多每二百五十毫秒合并一次，关键阶段立即通知，不降低原始采样和原生计时频率。UI 的数字和环按最新真实值局部刷新，普通覆盖分类提示稳定三百毫秒后切换，正式开始、结束、错误及取消不受防抖延迟；不由动画结束触发采集，也不因提示或百分比更新重建相机子树。

原生阶段为 `observing / starting / capturing / stopping / completed / interrupted / failed`。稳定就绪后原生只发起一次准备，等待必要 AE／AWB 锁确认和双 writer 准备，再次检查覆盖和关闭意图后建立 `elapsedRealtimeNanos` 半开正式窗口；等待及准备帧不计入正式时长、不写为正式样本。准备期间覆盖失效退回同轮观测。原生同时检查帧处理入口上下界并调度截止，即使 JS 不消费进度也按时收尾；控制窗口与相机传感器时间不是同一事实。

正式期间以有效空间覆盖比例不低于 95% 作为维持及同帧展示输入条件，不改变实际百分比和部分覆盖分类，也不降低完整覆盖准入。低于维持门槛或未知的区间不生成脉搏；连续不满足维持条件或持续无新帧达到一点五秒才以覆盖丢失结束本轮，恢复有效覆盖可以清除尚未确认的丢失累计，不能恢复已结束轮次。短暂失效不暂停绝对三十秒窗口、不补时，真实信号超过二百毫秒的采样缺口仍断段并重新建立滤波。95% 与一点五秒是待真机核对的固定工程参数，不代表医学质量。后台、离页与宿主销毁仍立即取消自动开始并完整收尾，恢复前台不续采；独立手动 PPG 不增加这些门控。

### 公开指尖接口

```ts
// client 已完成用户授权、真实预览准备和 openCamera(config)。
const unsubscribeState = client.subscribeFingertip((snapshot) => {
  // snapshot 尚无本轮时为空；倒计时直接使用 remainingMillis。
})
const unsubscribePulse = client.subscribeFingertipPulse((batch) => {
  // 仅接收与当前 captureId 相同的本轮标量，按片段、序号及时间缺口断线。
})
const captureId = await client.startFingertipCapture({ durationMillis: 30_000 })
// 提前结束指定轮次；正常到时由原生自动结束。
await client.stopFingertipCapture(captureId)
await client.closeCamera()
unsubscribePulse()
unsubscribeState()
```

`getFingertipSnapshot()` 读取同一低频事实。快照保留 `captureId`、原始 `sessionId`、覆盖、原生 `elapsedMillis / remainingMillis`、目标时长、正式窗口、结束原因、错误、配对帧数及首末采样时间、冻结配置和本轮 `artifact`。绝对纳秒跨桥使用十进制字符串，JS 不相减推算倒计时。原始文件定稿与 `resourcesReleased` 是不同事实；正常完成必须有正式数据、双 CSV 定稿且相机释放，文件成功但关闭失败不能显示整体成功。

`windowStartElapsedNanos` 是正式入口开启的 `T0`；运行中的 `windowEndElapsedNanos` 表示计划截止，终态改为实际入口封闭时刻并限制在目标终点以内，不是文件关闭时间。`targetDurationMillis` 始终保留目标；提前结束时 `elapsedMillis / remainingMillis` 保留实际进度，不强制清零。

停止绑定调用方和确切 `captureId`，旧停止或迟到截止不能影响新轮。`closeCamera()` 先阻断尚未执行的自动开始，再等待已发命令、在途帧、元数据、队列、文件和相机；并发关闭复用屏障，真实关闭失败可再关闭。未取得相机的客户端关闭不能释放占用者；独立传感器和被动服务不由本轮指尖关闭控制。

## 指尖展示脉搏与文件保留

脉搏在原生由同轮正式接收且精确配对的 `[1,1]` YUV 统计形成：派生未截断红色通道，经去直流与 0.75–3 Hz 因果带通输出任意单位幅值。后摄补光条件下绿色通道可能接近颜色处理地板，不能固定将它视为有效脉搏输入。滤波按真实相邻采样时间计算系数，不假设请求的 30 FPS 为实际等间隔；每段以首个有效输入建立初值，首个连续一秒只建立状态。覆盖低于正式维持门槛或未知、非有限输入、时间不递增或超过二百毫秒缺口时切段并重新启动，不补帧、不填零，不由常量生成周期，也不调用面部 POS、频谱或健康指标算法。真实输入的运动、压力或曝光变化仍可产生滤波过渡；不以未经校准的峰谷对称性规则删除波形，也不改写原始幅值或任意放大以掩盖问题。颜色判定和红色通道的实际适用性仍需真实后摄及补光验证，录制素材不是生理真值。

全帧 RGB＋POS 仅作录制素材离线候选对照，不是产品备用算法。RGB 输入应从同帧像素按明确颜色假设转换后统计，不能把截断后的 YUV 均值转换结果冒充逐像素 RGB 均值；复用既有 POS 数学处理时保留原呈现时间、窗口启动与无效段。三通道归一化可能放大近颜色地板的量化误差，任意单位幅值大小或输出非空不能证明算法更准确，不因此提供切换开关或输出健康指标。

原始 PPG 同源分流：一条保存原始双 CSV，另一条形成展示脉搏；不是读取 `ppg.csv` 计算实时图，也不回写原始均值或时间。批次包含 `captureId / sessionId / segmentId / sequence / timesMillis / values`，各点时间相对正式首帧，使用显式数组而非等间隔字段。每批最多六十四点，正常每五十毫秒提交，终止前提交真实尾批。每订阅最多四批，慢消费者丢弃旧展示批且序号缺口可见，不反压或放宽原始记录容量不足的显式失败规则。

本轮展示历史仅保留在页面局部内存，图表只消费六秒窗口及有限边缘点；说明页隐藏绘图不停止接收、采集或保存。丢批、断段与采集缺口断线，不读取文件补造历史。结束可回看本轮，重测清空、离页释放；不生成 `pulse.csv`、跨进程波形回放或健康记录。原始 `ppg.csv / frame.csv` 持久保留，不因清空展示、返回或重测删除。原始文件存在但无可用脉搏时，曲线保持真实空态。

## 血压双阶段工程准入与联合窗口

血压入口仍显式准备真实后摄、授权和原生预览，复用单块 `[1,1]`、720×720／30 FPS 偏好及按能力选择的可选补光；没有支持补光不单独阻断。`BloodPressureController` 负责独立轮次，不通过指尖单源自动开始接口模拟等待贴胸。公开阶段为 `observing_finger / awaiting_chest / starting / capturing / stopping / completed / interrupted / failed`：完整覆盖连续三秒且输入新鲜后才进入贴胸准备，准备期倒计时仍为目标时长，且不保存正式记录。

### 公开血压接口与低频事实

```ts
// 已显式授权并完成预览宿主等待、能力查询与 openCamera(config)。
const unsubscribe = client.subscribeBloodPressure((snapshot) => {
  // 无本轮时为空；使用原生 phase、elapsedMillis / remainingMillis。
})
const captureId = await client.startBloodPressureCapture({ durationMillis: 30_000 })
const snapshot = client.getBloodPressureSnapshot()
// 正常截止由原生执行；提前停止只作用于本所有者的确切轮次。
await client.stopBloodPressureCapture(captureId)
await client.closeCamera()
unsubscribe()
```

`BloodPressureCaptureConfig.durationMillis` 必须为 1–86,400,000 的整数毫秒，产品使用 30,000；非法值返回 `BLOOD_PRESSURE_CONFIG_INVALID`。`startBloodPressureCapture` 只确认观测轮次及身份，不等待准入或采满。创建客户端、读取、订阅及解除订阅均不打开相机、不注册 IMU、不创建正式文件；解除订阅不停止轮次。低频普通变化由原生最多每 250 ms 合并，关键阶段立即通知，Nitro 在主线程交付；解除订阅使已排队通知失效，不依赖 JS 定时器执行截止。

`BloodPressureSnapshot` 关联本轮 `captureId`、PPG `sessionId` 与 `accSessionId`，并提供覆盖百分比／分类／就绪、可空 `tiltDegrees / stable / scgCandidate`、原生进度、原因、错误、冻结 `cameraConfigSummary`、PPG `artifact`、`accArtifact`、各源真实计数和首末原始采样时间、`resourcesReleased`。未知 IMU 项为 `null`，不是默认 0 或 `false`；没有 IMU 样本数组、滤波序列、逐事件状态或波形接口。启动保留控制器可判别错误，例如 `CAMERA_NOT_READY / CAPTURE_STATE_INVALID / SENSOR_BUSY`，客户端转为保留原码和说明的 `AcquisitionError`，不把真实设备根因改写为成功或缺失轮次身份。

`stopBloodPressureCapture(captureId)` 先同步封闭本轮入口并撤销待开窗，再等待组内完成屏障。`closeCamera()` 沿用 `PPGController` 的所有权与关闭入口，等待在途命令、PPG 精确配对、PPG／ACC 尾批及文件、相机／补光和本轮 ACC／gyro 监听释放；并发关闭共用屏障，真实释放失败保留对象供再次关闭。旧身份不能停止新轮，不拥有相机的客户端不能释放占用者，也不能停止组外独立传感器或被动服务。

### 姿态、稳定性与持续心震候选

原生准入为 `coverageReady && stable && (tiltDegrees >= 30 || scgCandidate == true)`。倾角指屏幕平面相对水平面的无向夹角：平放朝上或朝下为 0°、竖直为 90°，以重力估计 `acos(clamp(abs(g.z) / norm(g), 0, 1))` 计算；30°包含边界，不是偏离竖直30°，不依赖屏幕旋转或先观察竖起动作。稳定且倾角达标不必等待心震窗口；不足30°时可由稳定及真实心震候选放行。该工程准入不能证明胸口位置、有效心搏或医学质量，姿态合理而未贴胸的稳定持机仍可能通过。

本轮请求 ACC 5,000 µs、gyro 20,000 µs，分别约200／50 Hz，仅为请求间隔，不是实采承诺；两个真实设备均必须可用且成功注册。稳定在最近一秒窗口每100 ms评估，ACC 经约3 Hz低通、减窗口三轴均值后取向量 RMS，初值门槛0.15 m/s²；原始角速度向量 RMS 初值0.05 rad/s。两个条件连续通过两秒才稳定，低通、积分和计时均使用真实事件间隔，完整窗口建立后最快约三秒确认。任一路事件或接收时间回退、相邻间隔超过200 ms会清除历史、稳定累计及候选；接收时间落后事件时间超过200 ms的延迟输入也被拒绝。未获得完整、新鲜输入时相应事实未知。

两路 IMU 可在独立回调线程上处理，跨源新鲜度使用本次及已接收样本中的最新接收时刻作为评估参考；不能因较早收到的回调较晚获得算法锁，就把另一来源已收到的新样本当成未来输入并清空累计。每个来源自身的事件／接收时间仍必须单调，真实缺口、陈旧输入和正式窗口检查保持不变。

心震在 `awaiting_chest / starting / capturing` 持续处理，与倾角及哪条路径已通过无关。原始 `-accZ` 的推理分支使用8–24 Hz因果 Butterworth 带通：二阶低通原型经带通变换成为两节 biquad、总四极点；真实32个事件间隔估计采样率，变化超过10%重建，实际间隔的 Nyquist 无法支持24 Hz时保持候选未知，不缩窄频带。排除建立段后，最近四秒每250 ms评估；绝对值经3 Hz低通形成包络，在仅用于推理的50 Hz有限网格上计算去均值归一化自相关，检查40–180次／分钟的重复峰和二倍周期相关。能量保留滤后原始量纲，至少四个一秒分段中的三个满足门槛，且连续两次完整评估满足能量、包络变化及重复性才形成候选；常量、低幅噪声或单次冲击不能仅因非零波动被判为存在。

固定参数的可追溯来源为 `packages/acquisition/android/src/main/java/com/healthcvapp/acquisition/ppg/bloodpressure/imu/BloodPressureImuConfig.kt`，配置注释中的参数版本为 `scg-local-engineering-v1`，不是新增的运行时桥接字段。以下参数作为**本机工程准入的固定基线**，不构成通用人体阈值或医学质量承诺：

| 配置项 | 当前工程基线 |
| --- | --- |
| `scgNoiseReferenceRms` | 0.005 m/s² |
| `scgEnergyAboveNoiseFactor` | 16；均方能量门槛0.0004 m²/s⁴，等效 RMS 0.02 m/s² |
| `scgEnvelopeCorrelationThreshold` | 0.65 |
| `scgSecondRepetitionThreshold` | 0.45 |
| `scgMinimumEnvelopeVariation` | 0.15，包络标准差／均值，用于排除恒幅载波残纹 |
| `scgFilterSettlingNanos` | 1,000,000,000 ns |

上述参数不承诺其他设备、人群或医学效果；确定性输入和模拟器不能代替真实人体对照。端侧不先逐窗z-score放大低幅噪声，不迁移后端二阶1–25 Hz、离线 `filtfilt`、z-score与VMD的AO重建；实时因果候选不与后端离线结果数值等价。原始ACC和PPG同源分流，推理、重力估计、有限包络网格及滤波不改变CSV轴值、三种时间或量纲。

开窗前覆盖失效退回指尖观测并清除旧IMU累计；仅稳定或两条替代条件失效则继续贴胸等待，撤销未开窗writer，不发布只有表头的产物。正式采集中IMU持续观测，但稳定、倾角或候选变化不暂停、不补时、不重开；覆盖维持仍按95%与1.5秒丢失宽限处理，确认覆盖丢失结束整个本轮。后台、离页或销毁也收尾整组，恢复不续采。

### 共同接收窗口与组合完成

PPG锁定和两个writer准备完毕、当前准入再次复核通过后，从原生 `elapsedRealtimeNanos` 建立同一半开窗口 `[T0,T1)`。PPG检查帧处理入口时间，ACC检查回调接收时间，并排除原始事件时间早于T0或不早于T1的历史／越界事件；共享组内激活标记避免顺序安装期间单源提前写入。准备数据不回填，截止先撤销激活并封闭两路入口，再完成已接受的在途配对与尾批，不依赖JS是否消费进度。

血压 `windowStartElapsedNanos / windowEndElapsedNanos` 始终分别为共同控制T0和**计划T1**，实际封闭由独立 `stoppedAtElapsedNanos` 表达，未正式开窗时为空；与指尖终态上界的既有语义不同。绝对纳秒跨桥保持十进制字符串，倒计时直接使用原生毫秒进度。各源首末采样时间取各自原始相机／事件时钟，不用控制边界替代；CSV继续保留毫秒小数、原始时间与含重力ACC自然设备坐标。共同窗口只是接收控制，不是硬件同步、精确曝光同步或逐帧／事件对齐，实际时钟关系需设备核查，不能补造边界样本。

只有达到目标、PPG配对帧及ACC均非空、同轮 `ppg.csv / frame.csv / ACC CSV` 均正常定稿，且相机、补光和两个IMU监听全部释放，才能正常 `completed`；gyro只观测，不要求第四文件。文件成功与释放成功分别表达；单源错误封闭本轮整体成功路径并收尾组内资源，保留已经定稿的分源文件和真实错误，不删除成功文件，不用历史列表末项补全。各源仍有独立DataHub与writer，不引入跨源共享文件事务。独立传感器的公开控制、CSV与组外隔离见[传感器协议](android-sensors.md)。


## 会话、文件与停止完成

每次正式采集使用独立会话标识和应用专属外部持久目录：`getExternalFilesDir(null)/acquisition/<sessionId>/`，当前包名对应 `Android/data/com.healthcvapp.mobile/files/acquisition/<sessionId>/`。`AcquisitionPaths` 集中维护 `ppg.csv.part`、`frame.csv.part` 与对应完成路径；`AcquisitionFileStore` 负责拒覆盖新输出及单文件提升。正常停止等待在途帧及关联完成、排空队列后，由 `PPGSessionOutput` 关闭两个 writer 并协调完成路径；停止收尾期间不允许开始下一次采集。

像素处理、容量不足、消费者或文件写入失败会关闭该会话的记录入口并释放资源，不返回成功产物；未完成的 `.part` 不会伪装成 `ppg.csv`，也不承诺自动删除。关闭相机正常停止当前会话，已完成文件不会因此删除。产品指尖的覆盖丢失、用户停止及后台中断保留真实原因，可保留已正常定稿的原始文件，但不冒充采满目标；技术失败与资源释放失败分别反馈。

`listArtifacts()` 返回当前进程中已完成的会话引用；每个引用含 `ppg.csv`、`frame.csv` 两个文件的类型、绝对路径和字节数，以及停止时冻结的请求／提交配置、调整原因、实际图像几何、观测 FPS 和分块布局摘要。新文件位于应用专属外部持久目录，不新增存储权限；外部根目录不可用时明确失败，不回退内部目录。该目录适合通过 ADB 取文件，不等于普通应用可自由访问的公共目录，卸载应用仍会删除。已有内部文件不迁移、不删除；当前没有实现进程重启后的目录扫描、恢复或清理策略。

## CameraX 协商与资源释放

目标 FPS 落入多个组合支持范围时选择最窄范围，否则选上限最高的有效范围；目标不在所选范围时，提交范围上限并记录调整。绑定前重新调用 `isSessionConfigSupported`。`setTargetResolution` 提交请求尺寸，实际几何以 `ImageProxy` 的宽、高和 crop 为准，观测 FPS 使用一秒窗口。

分析运行在单线程原生执行器，使用 `STRATEGY_BLOCK_PRODUCER` 和 CameraX 有界图像队列。相机关闭时用绑定时保留的同一 `SessionConfig` 实例解绑，清空 analyzer 并等待已排入的旧帧处理结束；旧相机监听器不能把帧或提示送入下一会话。

产品 Tab 离页守卫等待在途命令、关闭相机并完成文件收尾，相机释放后才允许导航。回页重新查询当前进程完成引用；已完成文件不因切页删除。

操作与外部／已有内部文件核查见 [Android 开发手册](../development/android-development.md)。模拟器输入不代表真实 PPG；实体设备兼容、目标 FPS、覆盖提示准确性、温控与持续性能仍需真机验证。
