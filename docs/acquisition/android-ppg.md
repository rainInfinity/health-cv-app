# Android 相机 PPG 采集协议

## 范围与数据边界

Android 后置相机 PPG 的 CameraX、像素处理、队列与 CSV 写入均在原生侧；JavaScript 只接收控制结果、低频状态、经验提示、结构化错误和完成产物引用，不接收 `ImageProxy`、像素、PPG 记录或批次。原生预览通过 Nitro 视图呈现，不经 JavaScript 传递图像。`AcquisitionClient` 不提供逐帧记录或高速批次订阅；RPPG 的有界标量展示是独立客户端的窄例外，详见 [Android RPPG 采集说明](android-rppg.md)。

PPG 路径不提供 iOS、上传、云端处理、真实覆盖面积或医学质量判断。共享 `DataHub<T>` 已用于 PPG、RPPG 和传感器，各数据源与会话持有独立实例。

## 主动采集控制器

`PPGRuntime` 为 Nitro `Acquisition` 控制对象与 `CameraPreview` 视图提供同一个进程级 `PPGController`。控制器持有主动 PPG 相机、预览视图引用、相机会话和活动 `PPGCaptureSession`，并串行执行打开、开始、停止和关闭命令；挂载预览视图本身不会打开相机。

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

这些只是由全帧均值推导的经验操作提示，不是逐像素覆盖判定、面积比例、信号质量门禁或医学结论；不会自动阻止或延长采集。

## 会话、文件与停止完成

每次正式采集使用独立会话标识和持久目录：`filesDir/acquisition/<sessionId>/`。`AcquisitionPaths` 集中维护 `ppg.csv.part`、`frame.csv.part` 与对应完成路径；`AcquisitionFileStore` 负责拒覆盖新输出及单文件提升。正常停止等待在途帧及关联完成、排空队列后，由 `PPGSessionOutput` 关闭两个 writer 并协调完成路径；停止收尾期间不允许开始下一次采集。

像素处理、容量不足、消费者或文件写入失败会关闭该会话的记录入口并释放资源，不返回成功产物；未完成的 `.part` 不会伪装成 `ppg.csv`，也不承诺自动删除。关闭相机或卸载页面会正常停止当前会话；已完成文件不会因此删除。相机中断或后台切换终止当前会话并显示结构化错误。

`listArtifacts()` 返回当前进程中已完成的会话引用；每个引用含 `ppg.csv`、`frame.csv` 两个文件的类型、绝对路径和字节数，以及停止时冻结的请求／提交配置、调整原因、实际图像几何、观测 FPS 和分块布局摘要。文件位于应用私有持久目录，但当前没有实现进程重启后的目录扫描、恢复或清理策略。

## CameraX 协商与资源释放

目标 FPS 落入多个组合支持范围时选择最窄范围，否则选上限最高的有效范围；目标不在所选范围时，提交范围上限并记录调整。绑定前重新调用 `isSessionConfigSupported`。`setTargetResolution` 提交请求尺寸，实际几何以 `ImageProxy` 的宽、高和 crop 为准，观测 FPS 使用一秒窗口。

分析运行在单线程原生执行器，使用 `STRATEGY_BLOCK_PRODUCER` 和 CameraX 有界图像队列。相机关闭时用绑定时保留的同一 `SessionConfig` 实例解绑，清空 analyzer 并等待已排入的旧帧处理结束；旧相机监听器不能把帧或提示送入下一会话。

产品 Tab 离页守卫等待在途命令、关闭相机并完成文件收尾，相机释放后才允许导航。回页重新查询当前进程完成引用；已完成文件不因切页删除。

操作与私有文件核查见 [Android 开发手册](../development/android-development.md)。模拟器输入不代表真实 PPG；实体设备兼容、目标 FPS、覆盖提示准确性、温控与持续性能仍需真机验证。
