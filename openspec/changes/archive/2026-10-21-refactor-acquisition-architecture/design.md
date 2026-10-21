# Design

## Context

动机见 `proposal.md`。当前事实与约束：

- `writers/PpgCsvWriter.kt` 与 `FrameCsvWriter.kt` 的目录创建、UTF-8 输出、表头异常收尾、批次遍历和幂等关闭重复，差异集中在表头与行编码。
- `runtime/AcquisitionService.kt` 是普通控制类，不是 Android Service；同时维护设备／会话状态、预览、像素适配、逐帧处理与 Nitro 结果。
- `session/CaptureSession.kt` 拥有正式帧边界、关联器、DataHub、双 writer、路径和发布回退。`CaptureRecord`、`FrameMetadataCorrelator` 位于 `camera/`，却依赖 PPG 记录语义。
- 同一个 DataHub 消费者顺序向两个 CSV 写入配对记录；停止成功包含关联、在途帧、尾批、关闭和两个路径提升。现有单测已覆盖这些行为，不得因拆类弱化。
- 被动录像有独立前台服务、取消／Finalize 竞争和视频检查，实际只与主动 PPG 共用 `CameraUseGuard`。当前视频可跨进程扫描，PPG 只查询本进程已完成引用。
- 行为基线是主规格 `native-acquisition` 与 `android-passive-capture`。本变更不改变它们，已设置 `skip_specs: true`，刻意不创建增量规格。

## Goals / Non-Goals

**Goals:**

- 让设备控制、逐帧数据路径、单源会话、格式编码及基础文件操作拥有可检查的资源边界。
- 使后续传感器直接复用现有批处理／文件能力，而不是依赖 PPG 或复制实现。
- 在一次干净切换中迁移所有调用方、测试和文档，不留下失效路径或旧名兼容壳。

**Non-Goals:**

- 不增加传感器、空模块、原生联合采集框架、跨源时间对齐、上传、后台保活或新配置系统。
- 不调整公开 Nitro／JS 名称、现有错误类别、时间含义、CSV 字段或默认采集参数。
- 不做已有文件迁移、PPG 重启扫描、保留策略或历史归档改写。
- 不为拆分建立逐类接口、依赖注入框架、反射序列化或抽象相机基类。

## Decisions

### 1. 能力模块内分职责，共通层保持窄边界

采用 `ppg/`、`passive/` 能力模块与共通 `pipeline/`、`storage/`、`camera/ownership/`。相比全局 `sources/processing/session` 横向分层，这使一次能力修改的代码集中，同时避免把只用于 PPG 的像素工具提前泛化。小型相关数据类型可以同文件，不机械追求一类一文件。

以下路径相对于 `packages/acquisition/android/src/main/java/com/healthcvapp/acquisition/`：

| 目标文件 | 职责与来源 |
| --- | --- |
| `pipeline/DataHub.kt` | 保留有界顺序消费及 `DataHubOfferResult`，不重新实现队列 |
| `camera/ownership/CameraUseGuard.kt` | 唯一相机租约仲裁；包含租约类型，主动／被动均引用它 |
| `storage/AcquisitionPaths.kt` | 注入基础目录，集中维护会话与文件路径 |
| `storage/AcquisitionFileStore.kt` | 共通目录创建、新建拒覆盖输出、单文件路径提升 |
| `storage/csv/BatchWriter.kt` | 泛型 `BatchWriter<T>`、需要保留的泛型工厂契约 |
| `storage/csv/CsvBatchWriter.kt` | 表头、缓冲、批量行输出与句柄关闭 |
| `storage/csv/CsvRowEncoder.kt` | 表头与向可复用行缓冲追加一条记录的契约 |
| `ppg/camera/CameraSource.kt` | 主动后摄 CameraX 绑定、预览／分析与设备事件；保留相关监听器、能力和异常 |
| `ppg/camera/CameraFrameMetadata.kt` | 相机拍摄结果数值、单位与可空字段语义 |
| `ppg/pixels/PixelFrameView.kt` | 像素借用、平面与裁剪结构及有效期 |
| `ppg/pixels/PixelReader.kt` | 实际平面布局下的有效像素读取 |
| `ppg/processing/FramePipeline.kt` | 同步处理链、共享统计、借用失效与帧释放 |
| `ppg/processing/PixelStatisticsExtractor.kt` | 共享像素统计，相关结果结构同文件 |
| `ppg/processing/PPGRecordProcessor.kt` | 帧时间与共享统计转换成 PPG 数值 |
| `ppg/processing/CoverageHintProcessor.kt` | 独立经验提示，相关结果结构同文件 |
| `ppg/processing/PPGFrameHandler.kt` | 从旧运行类拆出输入适配、同步处理及向本次会话交付数值 |
| `ppg/model/PPGRecord.kt` | 原八列 PPG 数值模型 |
| `ppg/model/PPGCaptureRecord.kt` | 一条精确配对的 PPG 与相机数值记录 |
| `ppg/model/PPGArtifact.kt` | 原 `SessionArtifact` 及相关文件产物结构 |
| `ppg/correlation/FrameMetadataCorrelator.kt` | 时间戳精确配对、按帧序释放；关联失败／结果结构同文件 |
| `ppg/session/PPGCaptureSession.kt` | 正式边界、在途计数、关联器、DataHub、停止与失败收尾 |
| `ppg/session/PPGCaptureFailure.kt` | 原 `CaptureFailure` 的错误类别和根因，不改变公开错误码 |
| `ppg/output/PPGCsvEncoder.kt` | PPG 八列编码 |
| `ppg/output/FrameCsvEncoder.kt` | frame 八列编码及现有毫秒／纳秒转换 |
| `ppg/output/PPGSessionOutput.kt` | 双输出打开、顺序写入、关闭、完成发布和产物形成 |
| `ppg/runtime/PPGController.kt` | 原 `AcquisitionService` 的设备控制、预览、活动会话和低频状态 |
| `ppg/runtime/PPGRuntime.kt` | Nitro 控制对象与预览视图取得同一个控制实例 |
| `passive/runtime/PassiveCaptureRuntime.kt` | 现有被动配置、服务控制、低频状态及运行时获取 |
| `passive/service/PassiveCaptureService.kt` | 真正的 Android 前台服务、解锁事件与运行条件 |
| `passive/service/PassiveCaptureNotifications.kt` | 现有通知与关闭动作 |
| `passive/trigger/PassiveCycleGate.kt` | 解锁机会周期判断 |
| `passive/capture/PassiveCaptureAttemptLifecycle.kt` | 单次尝试完成／取消竞争 |
| `passive/capture/PassiveVideoRecordingSession.kt` | CameraX 录像、Start／Finalize 屏障 |
| `passive/output/PassiveVideoArtifactStore.kt` | 现有媒体检查、发布、扫描与未完成片段处理 |

未来 `sensors/` 采用 `model/source/session/output/runtime` 分区，但属于第二个变更，本变更不创建空文件。

### 2. 路径策略与基础文件执行分开

`AcquisitionPaths` 从运行时取得同一应用私有 `filesDir`，测试传入临时目录。路径策略不可变，不使用可随时修改的静态根目录；各能力不能再自行读取 Context 并拼根路径。保留已支持的会话标识规则，不因为统一工具把 PPG 安全路径标识收紧成仅 UUID。

| 能力 | 保持的目录与文件 |
| --- | --- |
| PPG | `filesDir/acquisition/<sessionId>/ppg.csv.part`、`frame.csv.part`；完成后去掉 `.part` |
| 被动视频 | `filesDir/passive-capture/<sessionId>/video.mp4.part`；完成后为 `video.mp4` |

`AcquisitionFileStore` 只承接确实共用的目录／新文件输出／单文件移动规则，不包装每个 `File` 方法。使用现有目录内的临时文件完成提升，不引入跨卷复制。PPG 和视频创建文件的时机不同：CSV 打开时新建输出，CameraX 需要预先分配临时视频文件；抽取时不能把视频已创建的路径误当成 CSV writer 的覆盖冲突。

相较单个大型 `FileUtils`，分开后可以调整基础路径而不修改编码器，也不会把媒体校验、批处理和删除策略集中在一个工具类。只有单文件提升能复用；双文件组合发布与视频可用性不下沉。

### 3. writer 通过组合复用，不保留薄壳类

`CsvBatchWriter<T>` 接管已打开输出流，以 `CsvRowEncoder<T>` 的表头和行编码完成写入。两个编码器都可以直接消费 `PPGCaptureRecord`，分别读取 PPG 或 metadata，不为适配接口复制批次、创建字段数组或 `map` 新列表。

- 保留顺序 `suspend writeBatch` 与关闭契约，不能保存 DataHub 批次视图。
- 输出被 writer 接管后，正常关闭和表头初始化失败均由 writer 关闭流；先报告原始写入错误，关闭异常不能覆盖它。
- 每个 writer 复用自己的行缓冲，不按记录重新创建 StringBuilder。只处理目前固定数值列，不引入反射／注解序列化。
- writer 不创建队列、计时器、协程或文件命名规则；文件打开发生在原有 IO 调度边界，不能移到相机回调。
- 删除两套 `PpgBatchWriter`／`FrameBatchWriter` 及专用工厂、旧 writer 和旧导入，不增加 `PPGCsvWriter` 转发壳。

相比抽象父类，组合让通用 IO 不依赖具体采集记录，也避免构造期间调用可覆盖编码方法。

### 4. 会话控制与双文件输出的责任

`PPGCaptureSession` 保留现有命令串行化、正式帧接收边界、关联器、有界容量、在途屏障、首个失败和失败清理。它通过 `PPGSessionOutput` 输出，不再直接拼路径、打开两个流或执行 rename。

`PPGSessionOutput` 的生命周期为：创建两个 writer；同一有序消费者先写 PPG 再写 frame；排空完成后关闭两侧；协调两个路径提升与回退；成功时形成内部产物。第二侧打开／写入／关闭／提升失败都不能交付正常完成会话，并且仍要尝试关闭其它已打开句柄。

正常停止次序保持为：关闭正式入口 → 等待已登记帧及精确关联 → 排空同一个 DataHub → 关闭两个 writer → 双文件完成发布 → 返回产物。失败先封闭入口和成功发布，再等待已有消费者退出及回收资源；停止后迟到错误不能推翻已经完成的产物。

双路径发布不是文件系统级原子事务。保留当前第二次提升失败时回退第一侧的行为、根因和未完成文件不交付语义，不借重构增加 manifest、恢复机制或文件清理。

### 5. 控制路径与逐帧路径分开，不复制状态

`PPGController` 仍唯一拥有相机标识、预览引用、活动会话、命令串行化、预览期有界 metadata 缓存和低频状态。它将本次回调绑定的会话引用交给 `PPGFrameHandler`；后者不另存一套权威活动会话，不按异步执行时的最新会话重新归属记录。

`PPGFrameHandler` 负责 ImageProxy 适配与处理路径。进入 `FramePipeline` 后继续由该管线的 finally 使像素失效并释放原生帧；适配失败、尚未交给管线的帧由 handler 收尾。每条路径恰好释放一次，不因拆分延长像素借用期或异步读取帧。

提示继续在逐帧处理期间独立更新，不等待 CSV 批次。PPG 记录与相机结果的时间戳精确配对规则不变。

### 6. 被动录像只迁移职责归属与存储依赖

保留服务生命周期、通知关闭、解锁门控、周期起点、取消／发布竞争、媒体轨检查与磁盘扫描。`PassiveVideoArtifactStore` 注入集中路径和文件工具，不能因共用 IO 改变其视频检查或将取消片段发布为成功。

共享的仍只是 `CameraUseGuard` 与基础文件能力。主动相机与被动录像的 CameraX 用例、资源持有周期和控制状态保持独立，不抽取统一相机会话。服务 package 改变时同时迁移 Manifest、显式 Intent、运行时引用及受影响的测试／开发命令。

### 7. 桥接与公开接口保持稳定

TypeScript 将 `src/client.ts` 移入 `src/ppg/client.ts`，将 `src/passive-client.ts` 移入 `src/passive/client.ts`；更新相对导入和 `src/index.ts`。现有根导出与 `/react` 入口保持，不留旧文件转发导出。

`src/native` 三个现有 Nitro Spec、`src/react/CameraPreview.tsx`、Nitro 对象名称及 `nitro.json` 注册名不因内部重构改名。手写 Hybrid 适配器保留 `com.margelo.nitro.acquisition` 的生成配置边界，仅修改内部引用，不手改生成物。

只统一类型／文件中的 `Ppg` 为 `PPG`；lowerCamelCase 的 `ppgRecordProcessor`、`offerPpgRecord` 等不全局替换，`ppg.csv`、artifact kind `'ppg'` 和既有协议字段不改。

### 8. 测试与证据围绕行为，不围绕目录

现有测试跟随生产职责迁移，泛型 writer 的替身仍用于验证真实失败和停止等待。保留或补齐文件拒覆盖、表头失败收尾、关闭后不可写、双文件逐行对应、停止等待、单侧失败不交付、回调隔离与恰好一次释放等有消费者影响的边界，不写扫描源码／断言类名的测试。

实施后必须运行真实 UI：主动打开预览、开始、停止并读取两 CSV；被动检查真实服务启动、独立启停、相机忙状态、完成视频校验和旧目录查询。自动测试与编译不能替代运行证据。重构回归不要求从头重做产品规格中的 7200 秒长待机试验，也不能修改或声称替代既有产品验收记录。

## Risks / Trade-offs

- [拆分改变锁与停止顺序] → 先迁移既有屏障和错误规则，再转移输出职责；以阻塞消费、关联迟到、取消与失败场景覆盖，不凭编译通过认定等价。
- [两个 writer 关闭责任混淆或重复关闭] → 明确流接管点，统一幂等关闭；第二侧失败时仍收尾第一侧并保留首个错误。
- [集中路径导致旧产物消失] → 不迁移物理目录，PPG 进程内引用和视频磁盘查询策略分别原样保持；复查已有视频引用。
- [新文件工具引入覆盖或跨会话操作] → 仅向已校验的能力／会话路径创建新输出，拒绝覆盖；测试隔离和已有文件内容保持。
- [移动服务破坏后台入口] → Manifest、Intent 与通知动作同步迁移，并真实运行服务验证。
- [过度细分增加导航成本] → 只有独立职责拆文件，相关小类型同文件；无公共业务模型目录、无空传感器实现。

## Migration Plan

1. 保留当前行为规格和回归场景作为基线，先加入共通路径、文件和 CSV 组合实现；切换同一变更内的全部消费者。
2. 拆出 PPG 模型、关联、输出与帧处理，迁移控制器和运行时；保持公开协议稳定，移除被取代的 writer／接口和旧文件。
3. 迁移被动模块及唯一相机租约，改其存储依赖并同步 Manifest／调用方；不改变已完成目录。
4. 迁移 TypeScript 内部路径、测试与当前文档，完成类型检查、Android 构建／相关行为测试及实际 UI／文件回归。
5. 架构变更独立验收完成后，才实施传感器变更。后者可新增自己的路径规则，但不能反向要求本变更创建传感器占位。

本变更不修改落盘协议或目录，没有数据迁移。若实施后需回滚，回退整组内部代码／注册修改，保留既有产物；不要同时保留两套生产路径来切换。这里描述回滚策略，不授权自动执行 Git 回退或删除用户文件。
