# Design

## Context

动机见 [proposal.md](proposal.md)，行为契约见 [native-acquisition delta](specs/native-acquisition/spec.md)。本变更横跨 JS/Nitro 接口、相机控制、像素处理、关联和文件协议，包含公开接口与数据模型变化，因此满足创建设计文档的条件。

当前实现已经核对：

- `Acquisition.nitro.ts`、`ppg/client.ts`、`HybridAcquisition.kt` 的打开命令均无参数；`PPGController` 串行处理命令并与被动录像共用 `CameraUseGuard`。
- `CameraSource.kt` 使用 CameraX 1.6.2，绑定默认后摄的 Preview + YUV ImageAnalysis；候选 720×720，优先包含 30 FPS 的范围，有 torch 就开启。实际尺寸／FPS 已与请求区分，逐帧曝光／ISO 等来自 CaptureResult。
- `FramePipeline` 在原生帧借用期计算全帧统计并更新覆盖提示；`PPGRecordProcessor` 每帧只生成一条 `blockIndex=0` 记录。
- `FrameMetadataCorrelator` 按传感器时间戳把一条 PPG 与一条元数据配对；`PPGCaptureSession` 用 256 帧容量、50 帧批次及停止屏障控制输出。
- `CsvRowEncoder`／`CsvBatchWriter` 当前一条输入对应一行；`PPGSessionOutput` 将同一配对批次依次交给两个 writer，保留失败回退和双文件关闭条件。
- 相机验证页与 `src/app/acquisition.ts` 使用 Nano Stores 订阅低频状态。四种传感器及被动录像是独立控制链路。

旧项目只借鉴参数映射意图：`exposureDelay` 实际是纳秒曝光时间，`fixedFocus` 只是关闭 AF；旧桥遗漏白平衡模式且分块参数未真正接通，不复制这些接口或缺陷。

## Goals / Non-Goals

**Goals:**

- 将纯查询、打开周期配置和正式记录窗口分开；JS 本地配置以后可以替换为其它来源，而原生不感知来源。
- 所有高频数据与参数生效确认留在原生；同一相机周期、正式会话和整帧负载具有清晰所有权。
- 默认单块保留既有 CSV 内容语义，多块只扩展帧内记录数，不复制相机元数据或整帧像素。

**Non-Goals:**

- 不为未来云端增加 profile 下载、缓存、版本管理、环境变量或鉴权前提。
- 不支持打开中或采集中修改配置；不扫描恢复历史配置、不引入额外持久配置文件。
- 不控制不可独立选择的物理子摄像头、不支持同时打开多个相机，不改变被动录像前摄与无补光策略。
- 不加入自动收敛质量门禁、固定预热等待、自动重试、滤波、防频闪、防抖或手动色彩校准。

## Decisions

### 1. 保持现有客户端与控制器，增加纯查询和明确的配置入口

拟议公共操作：

| 操作 | 输入 | 输出及副作用 |
| --- | --- | --- |
| `requestCameraPermission()` | 无 | 显式申请权限；不打开相机 |
| `listCameras()` | 无 | 当前主动链路可枚举的相机描述；不主动申请权限 |
| `getCameraCapabilities(cameraId)` | 枚举的相机 ID | 支持状态、范围、模式与本地处理限制；无采集副作用 |
| `getSupportedCaptureOptions(cameraId, options)` | 目标尺寸、目标 FPS 等候选 | 预览／YUV 组合结果、协商候选与未能确认项；不绑定生命周期 |
| `openCamera(config)` | 完整相机配置 | 应用结果写入低频快照；只有此操作才申请相机使用权并绑定预览 |
| `startCapture()` | 无 | 使用冻结配置，按需确认锁定后开始正式会话 |
| `stopCapture()`／`closeCamera()` | 无 | 沿用排空、完成产物与关闭语义，并处理锁定释放 |

`requestCameraPermission` 从现有 `openCamera` 权限申请职责中抽出；查询不自动弹授权，打开发现未授权时返回明确错误，不借查询偷偷申请。UI 的“授权并查询”与“打开相机”是分开的用户操作。复用当前结构化结果与 `AcquisitionError`，不再建立一套通用 Result 包装。

公开接口同步迁移 `src/index.ts`、应用调用方与 Nitro 生成代码。`CameraPreview` 仍只挂接 Surface，不接受另一路配置。相比旧项目通过 View 属性不断更新参数，命令入口能够冻结同一版本并明确失败边界。

### 2. 查询对象区分硬件能力、组合选项与处理器限制

在 `ppg/camera` 按职责增加能力读取与配置值对象，不把枚举、解析、Camera2 映射、像素分块全部塞进 `PPGController`。

- 通过 CameraX 可用 CameraInfo 和 Camera2 characteristics 建立 `cameraId` 对应关系，枚举当前可直接选择且可用于主动链路的逻辑相机，包含朝向。不假设 ID 与主摄／广角的跨设备含义，不按厂商机型字符串推断能力。
- 每个可查询项使用 `supported | unsupported | permission-required | unknown` 状态，加可空值／范围与原因；布尔 false 与缺值不同。权限保护项不能因 null 被误判为不支持。
- 范围包含单位、上下界；曝光补偿同时返回索引范围和有理数 EV 步长。白平衡、AF 模式返回当前设备实际支持选项；不提供无法查询的示例范围。
- 构造未绑定的 Preview + YUV 分析 SessionConfig，使用当前依赖已有的 `getCameraInfo(selector, config)`、按 SessionConfig 查询帧率及支持性。不能确认的组合保留 unknown；不能把单流尺寸与设备通用 FPS 做笛卡尔积后声称都支持。
- 不设置 SurfaceProvider、analyzer，不调用 bind/open/torch，不申请 `CameraUseGuard`，不创建文件。查询允许初始化 provider 和读取静态信息，但不应影响已有主动／被动会话。
- 能力仅为当时快照；打开重新检查权限、ID、互斥、能力和组合，不信任 JS 缓存或云端来源。
- `processing` 限制属于本地处理器，不伪装成 CameraCharacteristics。初始 `maxBlockCount=64`，作为保证内存有界的本地设计值而非硬件承诺；同时返回目标尺寸允许的最大行列数。该上限是本提案的工程默认值，调用方以查询结果为准，不固化常量。

### 3. 一个完整配置形状，模式互斥校验，不保留旧别名

| 字段 | 约束与语义 |
| --- | --- |
| `cameraId` | 当前枚举的单个可选 ID |
| `targetResolution.width/height` | 有限正整数像素；为偏好值，协商必须回报 |
| `targetFps` | 有限正数 FPS；为偏好值，不是实测承诺 |
| `torchEnabled` | 布尔值；明确请求开启而无能力时失败 |
| `exposure.mode` | `auto` 或 `manual` |
| `exposure.compensationIndex` | 自动模式的整数补偿索引；手动模式为 null |
| `exposure.timeNanos`、`exposure.iso` | 手动模式的正整数，前者须为 JS 安全整数；自动模式为 null |
| `exposure.locked` | 仅自动模式允许 true；表示每次正式开始前锁定 |
| `whiteBalance.mode` | `auto`、`off` 或设备支持的预设语义枚举；off 不宣称具有指定增益／色温 |
| `whiteBalance.locked` | 仅 auto 允许 true |
| `focus.mode` | 自动、关闭 AF、手动；映射时只能使用查询确认的设备 AF 能力 |
| `focus.distanceDiopters` | 手动模式为设备范围内有限非负数，0 为无穷远；其他模式为 null |
| `processing.blocks` | 长度恰为二的正整数数组 `[rows, columns]`，安全乘积不大于查询的最大块数 |

JS 以同一个对象形状表达配置，无效分支必须为 null，不能由对象中哪个字段碰巧存在来猜测模式。Nitro 边界使用现有支持的对象、枚举、数字及数字数组，原生再次检查数组长度与数值；不依赖代码生成器支持定长 tuple，也不通过 JSON 字符串绕过类型桥接。

UI 的初始草稿按已查询能力构造：默认后摄，720×720／30 FPS 作为尺寸／帧率偏好；自动曝光、补偿 0、AE/AWB 不锁定、自动白平衡、单块。仅在明确支持时默认启用 torch，AF 选择查询支持的自动模式，固定焦距设备使用关闭 AF；未知能力不假定为可用。手动曝光／ISO 不设置跨机型通用固定值，切换模式时由用户在返回范围内填写。

校验顺序为形状／数值 → 模式关系 → 已知能力／范围 → 组合选项 → 打开时复核。明确不支持的控制不裁剪、不换自动模式；必须显式控制但能力未知时失败。尺寸／FPS 允许沿用协商语义：尺寸由当前用例的受支持候选协商；帧率优先包含目标值且范围最窄，否则选择最高上限候选，并记录调整，不制造固定 FPS 保证。

新增错误码以规格中的三类配置错误为主，另区分 `CAMERA_UNAVAILABLE`、`CAMERA_CONFIGURATION_UNAVAILABLE`、`CAMERA_LOCK_FAILED` 和既有权限／忙／设备错误。查询失败不能把正在运行的相机会话标成 failed；命令错误不污染其它源状态。

### 4. CameraX 管理生命周期，Camera2 互操作集中提交参数

保留 CameraX 1.6.2，不升级依赖，不重写裸 Camera2 会话。`CameraSource` 根据精确 cameraId 的 selector 绑定，避免只按 FRONT/BACK 再让系统选择另一个镜头。

打开配置完整提交后才能报告 preview：自动曝光提交 AE_ON 和补偿；手动曝光提交 AE_OFF、曝光时间和 ISO；白平衡与 AF 使用正确的各自枚举；torch 仅通过 CameraControl 控制，不再同时用另一条 FLASH_MODE 写入路径争抢。等待设置 Future 完成，但不把 Future 完成说成真实曝光已精确等于请求值。

能力查询、提交配置和 CaptureResult 的职责分开：合法曝光／ISO 可能被硬件量化，真实值继续进入 frame.csv。实际帧尺寸由 ImageProxy 得到，观测 FPS 使用已有窗口。首帧有效尺寸到达后复核网格，不能用候选 720×720 代替实际尺寸；复核失败终止打开／采集成功路径。

`PPGController` 在非 closed 状态拒绝 `openCamera(config)`，即使参数相同也不作为隐式 no-op；改参数必须关闭重开。打开周期拥有不可变请求配置、协商提交结果和唯一 token，迟到结果不能更新下一周期。

相机周期同时拥有 CameraSource 与 `CameraUseLease`。当前 `closeCameraSourceAsync` 仅关闭相机源，没有释放租约；本次迁移的关闭、后台中断、设备失败及锁定失败路径必须在确认设备解绑后统一幂等释放该周期租约，不能等页面卸载才释放。清理必须匹配周期 token，旧任务不得释放后来持有者；未确认设备释放时不能提前宣称相机可用。验收包含中断收尾后被动采集可重新取得占用权，不新增抢占或自动恢复行为。

### 5. AE/AWB 锁定属于正式开始屏障，不是新的预热功能

打开预览时自动算法先保持解锁。`startCapture` 在既有命令互斥内执行：

1. 核对 preview 与冻结配置，低频锁状态更新为 applying；不建立正式窗口或输出文件。
2. 对所需 AE/AWB 提交 lock=true，等待当前周期的请求／拍摄结果确认。只依据设置 Future 或历史 LOCKED 状态均不算确认。
3. 原生匹配当前周期 token、当前锁操作及请求／结果中的锁定字段；使用 frameNumber 和最近一次已确认解锁结果形成新操作屏障，旧请求、旧会话及乱序迟到结果不得确认新操作。
4. 最长等待 3 秒；这是内部失败收尾时限，不是可配置预热时长，也不等待或承诺算法已收敛。中断、取消或超时返回 `CAMERA_LOCK_FAILED` 或原设备错误，关闭并释放失败周期，没有成功产物。
5. 只在确认后创建正式会话并建立原生边界，同时排除锁定确认帧及更早的在途图像。锁定开始屏障须保留传感器帧标识下限，不能只依赖图像处理回调的接收时刻。

正式停止先沿用整帧排空和文件关闭，再对所需自动算法解锁，并等待当前结果确认后返回 preview；下一次 start 重新锁定当时结果。文件完成但解锁失败时，不撤销已完成文件：保留完成产物、关闭相机并在快照中报告设备失败，不声称仍有可复用的 preview。打开／关闭、后台中断都受有限等待约束，不引入无限等锁或自动重试。

锁状态提供 `not-requested | applying | locked | released | failed` 等低频阶段及可空实际确认值，不持续向 JS 推送 CaptureResult。当前状态机可继续使用 preview/capturing 等既有阶段，以锁状态表达开始准备；不能在准备期间提前发布 capturing。

### 6. 用二维几何与共享统计扩展原生像素处理

布局由实际 crop 决定，设有效区域起点 `(left, top)`、宽 W、高 H。第 r 行边界为 `top + floor(r*H/rows)` 至 `top + floor((r+1)*H/rows)`；列同理。中间乘法用足够宽的整数避免溢出；row-major 编号 `r*columns+c`。在尺寸稳定时复用边界与累加缓冲，任何实际尺寸变化都必须复核布局，不沿用旧边界。

- 亮度像素只属于一个块，全部有效像素被覆盖；不旋转、不镜像、不复制像素、不读取填充区域。
- 每块 U/V 对所有与其区域相交的 4:2:0 单元各计一次。边界共享单元可进入多个块，但全帧统计仍只计一次；不得用逐亮度像素重复累计 U/V。
- 复用 PixelReader／PixelFrameView 的步长、起点和有效期契约。按平面遍历共享计算全帧与各块统计，不为每块完整重扫整帧，也不建立每块协程。
- 全帧覆盖提示继续使用完整有效区域的真实总和／计数，不平均块均值；默认 `[1,1]` 必须与现有统计一致。
- 块几何、样本数和均值在帧释放前计算；异步链路只保留必要的独立数值。块值使用紧凑原生数组表达，不为每个像素、每个块额外复制帧或建立独立缓存。

### 7. 关联和批处理单位改为整帧，而不是逐块复用旧关联器

用包含公共帧字段、全部块数值和一份元数据的帧记录替代只持有单个 PPG 的 `PPGCaptureRecord` 路径。`PPGFrameHandler` 每帧只登记／结束一次，在同步作用域内获得完整块值后按一个 timestamp 交给关联器。

`FrameMetadataCorrelator` 仍按单个传感器时间戳精确匹配和 frameIndex 顺序释放，不能把每个块分别提交给它，否则会被误判为重复图像或导致多次 in-flight 递减。旧单记录方法随调用方迁移删除，不保留兼容分支。

DataHub 保持以帧为容量和批次单位，不修改其通用契约。256 个待消费／在途帧与每帧不超过 64 块共同约束内存；关联缓存同样受帧容量限制。整个帧只有一次接收结果，不能将部分块成功入队。延续任何处理、关联、容量或 I/O 失败都不返回成功双文件的行为。

### 8. 扩展现有 CSV 编码能力，不在编码器中偷偷嵌入换行

`CsvRowEncoder` 改为显式支持每条输入的 `rowCount(record)` 和按 `rowIndex` 追加一行。`CsvBatchWriter` 继续复用一份行缓冲，按记录顺序再按行序写入，不建立展平列表或每块临时对象。

- PPG encoder 对一帧返回 rows×columns 行；frame encoder 始终一行。
- 传感器 encoder 迁移为一条输入一行，CSV 内容与注册行为不变；这是共享 writer 必需的内部签名迁移，不扩展传感器功能。
- 同一消费者依次写两侧文件，保留任一 writer 失败、关闭失败及路径提升失败时的现有整体失败语义；不承诺异常时两个临时文件具有原子磁盘事务。
- 不改 CSV 表头或单位。正常完成时 frame 数据行数等于已保存帧数，PPG 数据行数等于帧数乘块数；用原始传感器时间戳关联，不能浮点近邻配对。

完成产物与低频快照增加配置应用摘要和实际布局：cameraId、requestedConfig、submittedConfig、调整列表、实际有效尺寸／crop、原生方向／镜像语义、网格及编号规则。它们是本进程返回的值快照，不增加 sidecar 文件或历史扫描恢复；frame.csv 继续保留可选缺值为零的兼容规则。

### 9. 验证 UI 与证据边界

在现有 AcquisitionScreen 内按授权／查询、草稿配置、运行状态、产物分区，沿用 Nano Stores 而不另起全局状态方案。选择相机或尺寸后重查相关选项，旧查询结果用相机 ID 与查询条件标记，不能覆盖新的选择。运行中冻结编辑或明确显示草稿尚未应用；只在 closed 时允许打开配置。

页面提供基本参数、模式相关字段、AE/AWB 锁定和 rows/columns 输入；展示 unsupported／unknown 原因和请求／协商／实际值。不得把本次不可用选项强行替换成“已支持”，也不得用示例范围填补设备信息。

永久行为测试重点是非法／越界配置无副作用、模式冲突、精确镜头选择、锁确认迟到与取消、奇数裁剪／色度边界、整帧接收、多行 CSV 顺序与失败不发布。沿用现有测试组织，更新真实协议断言，不保留“永远只有一个块”等实现默认值断言，不写纯转发或配置回显测试。

实际验收通过无登录页面执行：查询无占用、选择相机、两组不同手动曝光／ISO、torch 开关、自动锁定、重复启停、单块／条带／矩形网格及文件读取。模拟器证明其支持路径；缺少的手动、锁定或镜头能力在支持环境补充正向证据。验收记录写入 `docs/development/android-development.md`，API 与 CSV 规则更新 `docs/acquisition/android-ppg.md`。规划阶段不运行或声称已通过这些实现验收。

## Risks / Trade-offs

- Camera2 互操作覆盖 CameraX 的 3A 配置 → 集中单一路径提交，torch 不重复写，按设备查询并用真实结果核对，不把参数提交等同硬件精确采纳。
- 静态能力无法穷举所有相机组合与运行时资源 → 查询按用例条件区分 supported／unknown，打开再次验证；失败不切换镜头或自动模式。
- AE/AWB 锁定结果可能缺失、迟到或设备声称支持但无法确认 → 当前操作／帧屏障、有限等待及明确失败；不以历史元数据确认新会话。
- 大网格增加记录量和内存 → 查询公开 64 块上限、按实际 crop 复核、紧凑数值、按帧有界；超限明确失败，而不是静默缩网格。
- 多块破坏按行号配对的旧消费者 → 明确 BREAKING，迁移本仓库文档与文件检查，保留表头并按 timestampFrame 分组；默认单块仍具有旧内容语义。
- 共享 encoder 签名影响非相机 CSV → 只迁移单行编码契约，保留传感器协议行为回归，不触及传感器配置或被动控制。
- 当前无设备证据可证明所有参数在具体机型生效 → 实施验收保留缺项，不用 mock、请求回显或模拟器不支持路径冒充完成。

## Migration Plan

1. 先落地配置／查询类型和原生值校验，再添加无副作用查询及精确 cameraId 映射；此阶段不启用任何新自动采集入口。
2. 一批迁移 JS client、Nitro 契约与生成绑定、Kotlin 控制器、相机应用／锁定屏障和 UI 调用方；删除无参打开路径，不保留旧别名。
3. 一批迁移像素统计、整帧记录、关联／停止、共享多行 writer 及全部现有 encoder；不允许只改 PPG 行数而保留旧一对一关联。
4. 运行项目类型检查、原生行为回归及真实 UI／设备闭环，更新协议与验收文档；不足的硬件证据保持未完成。
5. 回退以整个接口／整帧文件链路所在版本为单位，不混用旧 JS、新原生或旧编码器；不删除或重写已完成历史 CSV，不恢复未实际存在的配置快照。
