# Android 后置相机 PPG 采集协议

## 范围与数据边界

本变更只实现 Android 后置相机 PPG。CameraX、像素处理、队列与 CSV 写入均在原生侧；JavaScript 只接收控制结果、低频状态、经验提示、结构化错误和完成产物引用，不接收 `ImageProxy`、像素、PPG 记录或批次。原生预览通过 Nitro 视图呈现，不经 JavaScript 传递图像。

本次不实现 iOS、运动传感器、上传、云端处理、真实覆盖面积或医学质量判断。`DataHub<T>` 是可供不同原生数据流复用的通用实现，但当前只创建 PPG 会话实例，不添加其它数据流的占位实现。

## DataHub<T> 有界批处理

每个数据流／采集会话拥有独立 `DataHub<T>` 实例、容量、触发条件、消费者和终态；实例间不共享队列或批次元数据。当前 PPG 默认值如下：

| 参数 | 默认值 | 语义 |
| --- | ---: | --- |
| `capacity` | 256 条 | 已接收但尚未完成消费的记录上限；包含待消费记录及当前在途批次 |
| `batchSize` | 50 条 | 数量触发阈值，同时也是每批最大记录数，不是容量 |
| `intervalMillis` | 1000 ms | 从一个待消费批次的首条记录开始计时；超时后触发消费 |

`offer` 只执行短暂的有界入队，不等待消费者或文件 I/O，也不在生产线程调用消费者。返回值区分 `ACCEPTED`、`CAPACITY_EXCEEDED`、`CLOSED` 和 `FAILED`。队列使用固定容量环形存储和单个后台消费者；数量阈值、时间阈值与正常关闭统一唤醒该消费者，批次按接收顺序且至多交付一次。

消费者收到的 `List<T>` 是环形存储的临时视图，不复制批次。消费者必须在挂起函数返回前完成读取，不能保留列表或异步继续访问；只有消费者返回后才释放该批次的容量额度。正在消费期间再次达到数量阈值时，也不会并发启动第二个消费者。

`closeAndDrain` 停止接收、取消定时器、顺序消费尾批并等待当前消费者结束；重复关闭等待同一后台屏障。成功表示所有已接收记录均已消费完成。消费者异常会成为终态错误：停止接收、清除未交付记录、唤醒等待者，`closeAndDrain` 抛出该错误，不自动重试。容量不足同样不阻塞相机等待磁盘、不覆盖或静默丢弃后继续成功；当前 `CaptureSession` 会终止并且不返回完成产物。

对应行为测试：`DataHubTest` 覆盖 `offer` 不同步调用消费者、在途批次仍计入容量、基于虚拟时间的计时触发、批次视图在消费结束后失效、数量触发的顺序与无并发消费、重复关闭与尾批等待、不同数据流隔离和消费者失败终态。

## 像素借用与处理器扩展

`CameraX ImageProxy` 只在当前帧同步处理期间有效。`PixelFrameView` 保存完整帧尺寸、有效裁剪区域、方向、镜像语义、会话／帧标识、时间戳和 Y/U/V 平面布局；当前后摄不镜像，颜色空间不可用时为 `null`。每个 `PixelPlane` 用 `ByteBuffer`、`baseOffset`、`rowStrideBytes`、`pixelStrideBytes` 和平面样本尺寸寻址，读取使用绝对位置，不改变缓冲区 `position`，也不复制或旋转整帧。

`PixelReader` 只允许读取有效裁剪区域内的像素。Y 坐标使用原帧像素坐标；4:2:0 色度坐标映射为 `(x / 2, y / 2)`，U/V 可为不同偏移、不同视图或共享底层色度缓冲。填充字节和裁剪区外样本不会被当作有效像素。

`FramePipeline` 在同一借用作用域中先执行一次 `PixelStatisticsExtractor`，再同步执行处理器和帧完成回调；正常返回或任一处理失败时，都会先使 `PixelFrameView` 失效，再统一关闭 `ImageProxy`。处理器可以读取完整像素和共享统计，但不得保留帧引用、修改缓冲或将像素读取交给异步任务。新增空间算法时实现独立 `PixelProcessor`，按需读取 `PixelReader` 的完整有效像素；共享均值不是所有算法的强制输入。异步 DataHub 只接收脱离帧生命周期的数值记录。

像素行为测试覆盖带行填充、非零 ByteBuffer 起点、非零裁剪、交错共享色度缓冲和像素步长；统计测试另覆盖奇数帧尺寸的 4:2:0 色度采样数。`PixelProcessingTest` 覆盖处理器成功／失败后的借用失效和 exactly-once 帧释放。

## PPG CSV 字段与时间语义

每个被正式采集会话接受的实际帧生成一条完整有效区域记录，一个帧块的 `blockIndex` 固定为 `0`。Y 均值按有效 Y 像素计算；U/V 均值按裁剪区域实际相交的 4:2:0 色度样本计算，每个色度单元只计一次，故 Y 与 U/V 的样本数可以不同。均值为 0–255 范围内的原始通道值，不转换为 RGB 或质量分数。

UTF-8 CSV 表头严格为：

```text
timestamp,timestampFrame,timestampSystem,avgY,avgU,avgV,frameIndex,blockIndex
```

| 字段 | 含义 | 单位／约束 |
| --- | --- | --- |
| `timestamp` | 开始处理该帧时读取的 `SystemClock.elapsedRealtimeNanos()` | 毫秒小数；单调启动后时间，不是帧曝光时间 |
| `timestampFrame` | CameraX `ImageInfo.timestamp` | 纳秒换算为毫秒小数；保留原始帧时间语义 |
| `timestampSystem` | 开始处理该帧时读取的 `System.nanoTime()` | 毫秒小数；不是 Unix 日期或墙上时间 |
| `avgY` | 有效裁剪区 Y 平面均值 | 0–255 |
| `avgU` | 有效区域对应的 U 色度样本均值 | 0–255 |
| `avgV` | 有效区域对应的 V 色度样本均值 | 0–255 |
| `frameIndex` | 正式会话实际接收帧的序号 | 每个会话从 0 递增；不证明相机无跳帧 |
| `blockIndex` | 每帧一个全帧块 | 固定为 0 |

时间保留毫秒小数，不截断为整数。帧率请求值与 CameraX 实际交付时间分开；递增帧号不代表采样完整。`PpgRecordProcessor` 只转换帧元数据与共享统计，不访问队列或文件；`PpgCsvWriter` 只编码八列并按收到的批次顺序写入，不另建队列或消费者。

## Camera2 逐帧元数据与 `frame.csv`

CameraX `ImageAnalysis` 在构建时注册 `Camera2Interop.Extender(...).setSessionCaptureCallback(...)`。`onCaptureCompleted` 从对应 `TotalCaptureResult` 读取实际结果，不使用请求值代替测量值。预览期间在原生侧以固定 64 条有界环形缓冲保留最近的含 `SENSOR_TIMESTAMP` 数值结果；正式会话启用时转交缓存，以覆盖回调先于图像交付的在途帧。PPG 图像的 `ImageProxy.imageInfo.timestamp` 必须与结果中的 `CaptureResult.SENSOR_TIMESTAMP` 完全相等才配对；两侧只缓存独立数值，不保留 `ImageProxy` 或 Camera2 对象，并按 `frameIndex` 顺序提交。

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

旧版兼容字段以 `0` 表示可选 Camera2 字段缺失，因此无法区分“未提供”和实际零值。`SENSOR_TIMESTAMP` 不适用该兜底：时间戳缺失、正式帧未匹配、重复时间戳或有界关联缓存溢出都会显式失败。停止时最多等待 Camera2 结果 1 秒；仍未匹配的正式帧不写成成功记录。两份 CSV 由同一个有序 DataHub 消费者按配对记录同步追加，逐行顺序与时间戳对应。

正常停止等待两份 CSV 排空、关闭并完成路径提升后，产物引用以 `files[]` 分别提供 `ppg`／`frame` 的路径和字节数；任一侧失败都不返回完成会话。

## 经验提示

`CoverageHintProcessor` 独立于 DataHub 和文件写入，仅在最新提示状态变化时通知。有效统计到达前，`showSurroundingTip` 和 `showCoveringTip` 均为 `null`，表示未评估。

提示沿用旧 Android 经验公式：

```text
r = Y + 1.5748 × (V - 128)
g = Y - 0.1873 × (U - 128) - 0.4681 × (V - 128)
b = Y + 1.8556 × (U - 128)
```

`showSurroundingTip` 在 `avgY < 25` 时触发。若 `r + g + b > 0`，按该和归一化三个通道；否则三个比例均为 `0`。`showCoveringTip` 在 `redRatio <= 0.5`、`greenRatio >= 0.2` 或 `blueRatio >= 0.2` 任一条件成立时触发。测试覆盖亮度阈值两侧、颜色比例边界／边界下方、RGB 和非正、输入未评估及相同状态不重复通知。

这些只是由全帧均值推导的经验操作提示，不是逐像素覆盖判定、面积比例、信号质量门禁或医学结论；不会自动阻止或延长采集。

## 会话、文件与停止完成

每次正式采集使用独立会话标识和持久目录：`filesDir/acquisition/<sessionId>/`。写入期间文件名为 `ppg.csv.part` 与 `frame.csv.part`；只有在正常停止、等待在途帧及关联完成、排空队列、刷新并关闭两个写入器、提升两份完成路径且确认文件存在后，才返回包含 `files[]` 的产物引用。停止收尾期间不允许开始下一次采集。

像素处理、容量不足、消费者或文件写入失败会关闭该会话的记录入口并释放资源，不返回成功产物；未完成的 `.part` 不会伪装成 `ppg.csv`，也不承诺自动删除。关闭相机或卸载页面会正常停止当前会话；已完成文件不会因此删除。相机中断或后台切换终止当前会话并显示结构化错误。

`listArtifacts()` 返回当前进程中已完成的会话引用；每个引用含 `ppg.csv`、`frame.csv` 两个文件的类型、绝对路径和字节数。文件位于应用私有持久目录，但当前没有实现进程重启后的目录扫描、恢复或清理策略。

会话测试覆盖精确与乱序关联、错配防护、缺失传感器时间戳和缓存溢出；双 CSV 测试覆盖旧版表头与单位、两文件行序及时间戳对应、停止排空和任一写入失败不发布完成产物。行为测试不以 CSV 数值证明模拟器产生真实 PPG。

## 当前 CameraX 行为

CameraX 绑定默认后摄，预览和 `YUV_420_888` 分析使用候选 `720×720`，并查询预览／分析用例组合支持的 FPS 范围；优先选择包含 30 FPS 且范围最窄的组合，否则选择上限最高的范围。候选参数不是实测值；状态中尺寸来自实际分析帧，FPS 来自原生一秒窗口的交付计数。

分析运行在单线程原生执行器，使用 `STRATEGY_BLOCK_PRODUCER` 和 CameraX 有界图像队列。设备支持补光灯时，相机打开流程会等待启用 torch；不支持时明确报告 `torchAvailable=false` 并继续打开。关闭相机时以绑定时保留的同一 `SessionConfig` 实例解绑 CameraX，清空 analyzer 并等待已排入的旧帧处理结束；旧相机监听器不能把帧或提示送入下一会话。

此处记录实现配置，不代表目标 FPS、真实 PPG、覆盖准确率、实体设备兼容或持续运行性能已验证。端到端验收以 Android 模拟器的实际界面操作和停止后文件存在为界，具体命令与结果记在 [Android 开发与验证](../development/android-development.md)。
