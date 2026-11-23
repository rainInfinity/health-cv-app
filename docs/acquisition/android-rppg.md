# Android RPPG 采集说明

## 范围

主动面部测量与无预览被动采集共用 `RPPGSession`、信号算法和文件格式，各自持有独立生命周期、配置、算法实例和相机租约。主动正式目标仍为30秒，无扰默认12秒；两者共用3秒频谱窗口。本文统一维护 RPPG 结果 schema；被动触发与服务规则见 [Android 无扰式被动采集协议](android-passive-capture.md)。

## 人脸定位模型

| 项目 | 固定值 |
| --- | --- |
| Android 运行库 | `com.google.mediapipe:tasks-vision:1.2.2` |
| 模型资产 | `face_landmarker.task`，Face Landmarker 官方 `float16/1` bundle |
| SHA-256 | `64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff` |
| 文件大小 | 3,758,596 字节 |
| 加载路径 | `packages/acquisition/android/src/main/assets/face_landmarker.task` |

模型来自 [Google AI Edge Face Landmarker 模型目录](https://developers.google.com/edge/mediapipe/solutions/vision/face_landmarker#models)所链接的[官方 `float16/1` 模型 bundle](https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task)。目录说明 bundle 含人脸检测、478 点面部网格及表情预测模型。Tasks Vision 固定版本及其 Apache License 2.0 见[官方 Google Maven POM](https://dl.google.com/dl/android/maven2/com/google/mediapipe/tasks-vision/1.2.2/tasks-vision-1.2.2.pom)；模型组成部分分别见官方 [BlazeFace](https://storage.googleapis.com/mediapipe-assets/MediaPipe%20BlazeFace%20Model%20Card%20(Short%20Range).pdf)、[Face Mesh V2](https://storage.googleapis.com/mediapipe-assets/Model%20Card%20MediaPipe%20Face%20Mesh%20V2.pdf) 和 [Blendshape V2](https://storage.googleapis.com/mediapipe-assets/Model%20Card%20Blendshape%20V2.pdf) 模型卡，均标注 Apache License 2.0。该许可和归属适用于模型／运行库，不代表模型对健康测量的医学有效性。

原生封装使用 `VIDEO` 模式、CPU delegate、单人脸，关闭表情系数输出；同一序列的调用须串行，并传入从采集时间换算的严格递增毫秒时间戳。模型只用于人脸定位，不做身份识别。模型卡限定用途不包括生命攸关决策，因此检测成功不能解释为有效脉搏、心率或临床结论。

## 帧转换与 ROI 读取边界

CameraX 帧通过共享的 `CameraXPixelFrameAdapter` 映射为借用 `PixelFrameView`，保留 crop、旋转、镜像元数据及各 plane 的真实 stride；该适配器不接管 `ImageProxy` 的释放。Face Landmarker 路径只同步处理当前帧：按 crop／旋转／镜像生成模型输入，模型检测结果在同一回调内读取 RGB ROI；回调结束后 ROI 视图失效，调用方仍负责关闭相机图像。

相机帧未提供颜色空间描述时，输入转换采用显式假设 `BT601_LIMITED_V1`。每帧将 Y/U/V 有效寻址区间批量读入三个按需扩容的复用缓冲，模型转换和同帧原始 ROI 共用这些字节，避免逐像素重复访问相机 `ByteBuffer`；读取仍遵守原始 offset、stride、crop、旋转和镜像，借用结束后不可继续读取。模型输入最长边限制为 640 px：YUV 被转换到复用的 ARGB 数组，再由 `Bitmap.setPixels` 写入复用 Bitmap；ROI 仍按同帧原始分辨率取色，不使用缩小模型输入代替。多边形先计算裁剪覆盖率，再逐扫描行计算交点并按相同偶奇规则读取像素中心；不逐像素重复遍历多边形边，采样像素集合、均值及覆盖率不变。此路径以有限缓冲和批量复制换取较少的逐像素读取开销，包含像素转换和数组到 Bitmap 的复制，不宣称零拷贝或已完成颜色校准。`FaceLandmarkerModel` 在同一 Bitmap 连续推理时复用 `MPImage` 包装；输入 Bitmap 更换或模型关闭时才释放包装，避免提前回收仍需复用的 Bitmap。

请求 FPS 不表示实际连续采样能力。相邻有效采样超过配置的 `maximumInterpolationGapNanos` 时原生切段，不能为显示波形而放宽缺口门槛；页面正在计时或文件已经完成也不表示已经积累了足够连续信号。局部取色耗时检查不能替代完整设备测量的实际帧率与波形检查。

## 版本化试验配置

`RPPGConfig.EXPERIMENTAL_V2` 当前使用3秒试验配置 `rppg-experiment-v2-3s`，评审状态为 `pending-review`。只缩短频谱窗口，SNR门槛仍为3 dB，质量规则不变；旧6秒会话保留 `rppg-experiment-v2` 及其冻结配置，不按新参数重算。这些工程参数不是医学标准、临床阈值或诊断结论。

| 配置项 | 试验值 |
| --- | --- |
| 相机请求 | 前置镜头，640 × 480，偏好 30 FPS；AE／AWB 自动；AF 优先自动，当前摄仅支持固定焦点时使用 `OFF`；不锁定曝光／白平衡，不启用补光 |
| 观察／测量 | 找脸最长5 s；主动正式目标30 s，无扰默认12 s，不因无效帧延长 |
| 人脸大小／姿态 | 面宽至少占画面 25%；绝对 yaw／pitch ≤ 20°、roll ≤ 25° |
| ROI 覆盖 | 额头及双颊各至少 95% 有效像素 |
| 连续就绪／目标关联 | 连续 1 s；有效帧最大间隔 200 ms；中心移动 ≤ 0.5 个面宽；面部尺度比 0.65–1.55；宽高比变化 ≤ 40% |
| 重采样 | 20 Hz；线性插值最大间隔 100 ms |
| POS／滤波 | POS 窗口 1.6 s；因果滤波启动排除 2 s；带通 0.75–3 Hz |
| 心率搜索／质量 | 45–180 bpm；频谱窗3 s、步长1 s；最低SNR 3 dB，按Hann主瓣宽度统计信号能量 |
| 实时输出／缓存 | 批次 200 ms；波形缓存 15 s |
| 颜色假设 | `BT601_LIMITED_V1` |

`sessionSnapshot()` 序列化配置版本、评审状态、颜色假设、相机请求和完整处理参数。会话元数据应同时保存该快照与运行时 `CameraConfigSummary`；`preferredFps` 等请求值不能代替实际协商配置或实测帧率。

`openPreview()` 在绑定相机前检查所选前摄的对焦能力：支持 `auto` 时使用自动对焦；只有设备明确报告支持 `off`、且没有 `auto` 时才回退到固定焦点。能力未知或没有可用模式时不猜测，继续由既有参数校验返回错误。固定焦点镜头可能需要用户保持合适的拍摄距离；人脸定位就绪不保证画面已对焦清晰。

## 在线信号算法、时间与质量

ROI 按额头及双颊有效像素数加权得到 RGB 均值；POS 脉搏是**任意单位**，不是校准后的生理量。每个窗口先用各通道窗口均值归一化，再计算 `S1 = G' - B'`、`S2 = -2R' + G' + B'`、`alpha = std(S1) / std(S2)`，得到 `H = S1 + alpha × S2` 并减去窗口均值。通道均值或任一标准差退化时拒绝该窗口，不产生 NaN。每个有效窗口对其覆盖点贡献权重 1；最终值为有效窗口贡献和除以该点实际贡献数。

窗口每个规则样本推进一次。样本只有在其最后一个可影响窗口结束后才定稿；32 点 POS 窗口、20 Hz 采样时，定稿前视约为 `(32 - 1) / 20 = 1.55 s`，缺少未来窗口支持的末尾点不补值。因果滤波采用双线性变换的一阶高通／低通级联：令 `K = tan(pi × cutoff / fs)`，高通 `y[n] = (x[n] - x[n-1]) / (1 + K) + ((1 - K) / (1 + K)) × y[n-1]`；低通 `y[n] = K × (x[n] + x[n-1]) / (1 + K) + ((1 - K) / (1 + K)) × y[n-1]`。滤波不看未来样本，前视等待为零；其频率相关相位响应不压成一个固定延迟。每段启动前 2 s 的信号时间不作为有效波形，首个有效点另记录配置排除时长和实际等待时长。

心率使用同片段3 s窗口（20 Hz下60点）、每1 s推进一次。每窗去均值并乘对称Hann窗 `w[n] = 0.5 × (1 - cos(2pi n / (N - 1)))`，在45–180 bpm（0.75–3 Hz）范围搜索功率谱局部主峰。候选覆盖范围边界所在bin，并额外计算两侧邻bin供峰形检查和对数功率三点抛物线插值；插值偏移超过半bin、非局部峰或估计频率越界均拒绝，不把越界结果限幅冒充有效值。

质量规则版本仍为 `hann-main-lobe-log-parabolic-v1`。`SNR(dB) = 10 × log10(Ppeak / Prest)`，仅统计中心频率位于搜索带内的bin；距插值主峰不超过 `2 × fs / (N−1)` 的功率作为信号，其余作为噪声。3秒窗按既有公式得到半宽约0.677966 Hz，不固定沿用6秒窗带宽。低于3 dB、零能量或分母不可计算时，bpm留空并保存原因，不产生置信度百分比；快照 `heartRateQuality` 记录规则与带宽。不同窗长的SNR不直接横向比较；短窗和宽主瓣仍可能接受运动或混杂信号，出数不证明准确性。

### 逐搏瞬时心率

`RppgBeatHeartRateEstimator` 直接读取与 `pulse.csv` 和实时波形同源的有效滤波点，不从临时 POS、前端绘图或观察帧取样；POS、滤波启动排除和频谱估计参数不因逐搏路径改变。

| 逐搏配置 | 当前工程试验值 |
| --- | --- |
| 独立规则版本 | `rppg-beat-experiment-v1` |
| 幅值回看 | 2 s 固定容量环 |
| 峰突出度 | 至少 `max(1e-6, 近期峰谷差 × 0.35)`，并确认峰后下降 |
| 重复峰不应期 | 250 ms |
| RR 范围 | 由 45–180 bpm 搜索范围换算 |
| 相邻 RR 变化 | 相对于前一间隔不超过 20% |
| 无可信心搏过期 | 2.5 s；完全无相机帧时由会话单调时钟补充清空 |
| 采样周期偏差 | 不超过规则周期的 10%，否则重新确认 |

至少三个可信峰形成两个一致间隔后才首次输出，`heartRateBpm = 60_000_000_000 / intervalNanos` 对应最新一个 RR，不是间隔或窗口平均。局部三点抛物线只细化采集峰时间，不将绝对纳秒转成浮点数，也不使用回调发布时间计算 RR。

无效 ROI、片段／有效区间变化、时间或序号不连续、异常 RR、过期及停止会清空当前值或重新确认；过近重复峰不替换上一个可信峰。滤波和频谱路径不因逐搏结果而重置或放宽门槛。所有逐搏阈值是待真实输入评估的工程值，不能可靠排除所有运动、光照和谐波伪影，也不是医学标准。

主动及被动低频快照的独立可空字段 `latestInstantHeartRate` 包含 `segmentIndex`、`previousPeakTimestampNanos`、`peakTimestampNanos`、`intervalNanos`、`heartRateBpm`；纳秒跨JS使用十进制字符串。测量中的当前值失效或停止即清空；每个新合格RR另外经原生有序队列写入 `beat.csv`，不依赖页面或低频快照采样，不重复写入仍有效的旧值。逐搏历史仍是初步估计，不进入频谱有效窗口平均，不改变最终 `signalStatus`；`hr.csv` 仅包含频谱窗口。

从点击开始／真实解锁起算的6–10 s仅为首个逐搏结果体验目标，不是保证。频谱首窗的数据条件包含POS定稿等待：20 Hz下为 `31 + 40 + 59 = 130` 个间隔，即理想连续片段起点后6.5 s；这不包含相机、找脸、调度或质量拒绝。12秒完整连续采集中约有6.5至11.5秒六次频谱评估机会，窗口高度重叠，不是六次独立测量。`minimumHeartRateMeasurementSeconds` 对应完整频谱窗，不是逐搏输出的统一最低时长。

## 文件 schema 与完整发布

新文件位于应用专属外部 `getExternalFilesDir(null)/acquisition/rppg/`，当前为 `Android/data/com.healthcvapp.mobile/files/acquisition/rppg/`。不新增存储权限，外部根目录不可用时明确失败，不回退内部目录；普通应用访问仍受限制，卸载应用会删除文件。已有内部 `filesDir/acquisition/rppg/` 不迁移、不删除，主动／被动查询分别合并两处已发布结果并按会话开始时间升序排列，同时间按会话标识排序。会话先写入隐藏临时目录 `.<sessionId>.tmp/`，成功发布后目录改为 `<sessionId>/`；文件名如下。

| 文件 | 内容 |
| --- | --- |
| `pulse.csv` | 已定稿的 POS 脉搏样本；表头为 `segmentIndex,sampleIndex,timeMs,value`。`timeMs` 是相对 `sensorTimeOriginNs` 的毫秒时间，最多六位小数；`value` 是有限的任意单位幅值。 |
| `hr.csv` | 已评估的心率窗口；表头为 `segmentIndex,windowStartNs,windowEndNs,heartRateBpm,valid,reason,spectralSnrDb`。窗口时间是绝对传感器纳秒整数；拒绝窗口的心率留空，`reason` 写拒绝原因；SNR可计算时仍保留，无法计算时才留空。 |
| `session.json` | 会话配置、相机协商摘要、结束原因、信号状态、样本计数和各片段范围；顶层 `complete` 为 `true` 才表示元信息已定稿。 |
| `beat.csv` | v2新增的合格逐搏序列；表头为 `segmentIndex,previousPeakTimestampNs,peakTimestampNs,intervalNs,heartRateBpm`。峰与间隔均为传感器纳秒整数，每个新合格RR一行；无合格逐搏时只有表头。 |

`session.json` 的主要字段为 `schemaVersion`（新会话 `rppg-session-v2`，旧 `rppg-session-v1` 仍可查询）、`algorithmVersion`、`sessionId`、`source`、`sensorTimeOriginNs`、`startedAt`、`finishedAt`、`config`、`cameraSummary`、`termination`、`signalStatus`、`sampleCounts`、`segmentRanges` 和 `complete`。绝对纳秒原点及片段首末时间以十进制字符串保存，避免JSON消费者转成浮点数而损失精度；CSV中的绝对纳秒为十进制整数。`sampleCounts` 仍只记录脉搏样本、频谱窗口、有效窗口和拒绝窗口数量，不因逐搏出现改变信号结论。`segmentRanges` 记录脉搏片段范围；`cameraSummary` 保留实际相机信息，`config` 是冻结配置，`source` 区分 `active` 与 `passive`。

`startedAt`／`finishedAt` 是 UTC 墙上时钟，覆盖打开、观察和收尾，不等于正式测量时长；元数据不单独记录就绪时刻。周期与截止使用单调 `elapsedRealtimeNanos`，CSV 使用传感器时间轴，系统相机日志还可能使用本地墙上时钟；这些时钟域不能直接相减。

正常关闭先排空已接受的完整记录、关闭全部CSV，最后创建带 `complete:true` 的 `session.json`。`RPPGArtifactStore.publish()` 仅在当前schema要求的文件均存在且非空、元信息schema／会话标识／来源匹配且带完整标记时，原子提升整个目录；目标已存在时拒绝覆盖。v2要求四份文件均完成，v1仍按原三件套查询，不补造逐搏文件。查询只扫描最终目录，临时文件和不完整结果不可见。

合法结束原因 `termination` 为 `target_duration`、`user_stop`、`page_left`、`app_background`、`observation_timeout` 或 `interrupted`；被动合法生命周期中断使用 `interrupted`。它与信号结论分开：`valid_heart_rate` 要求至少一个有效频谱 HR 窗口；`no_valid_heart_rate` 表示已有波形或已评估窗口但没有有效 HR；`no_waveform` 表示没有脉搏样本和 HR 窗口。提前停止或合法中断仍可形成完整产物，信号结论按实际数据记录。写入、关闭或处理发生技术失败时，不写完整元信息，不将其伪装成正常无信号或合法停止。

## 实时展示批次

原生实时记录 `RPPGRealtimeBatch` 与持久化样本来自同一条已定稿脉搏记录流；只有完整记录队列接受样本后才进行展示分发。批次字段如下：

| 字段 | 含义 |
| --- | --- |
| `sessionId` | 会话标识。 |
| `segmentIndex` | 所属信号片段；单个批次不跨片段。 |
| `sequence` | 会话内递增的批次序号；从上一批起出现缺号，表示该订阅没有观察到中间批次。慢订阅者缓冲满时只丢弃自己的旧批次。 |
| `startTimeMs` | 批次首个样本相对传感器时间原点的毫秒时间。 |
| `sampleIntervalMs` | 批内规则重采样间隔，单位毫秒。 |
| `values` | 按采集时间排列的 POS 任意单位幅值。 |

批次达到配置时长对应的样本数时发出；片段、样本序号或时间间隔不连续时先结束当前批次。会话可定时调用 `flushPending()` 发出未满批次，停止时 `close()` 发出尾批并关闭通道。每个订阅有独立有限缓冲（默认 8 批），慢消费者采用丢弃最旧批次策略，不会阻塞算法或完整文件写入；取消订阅会释放该订阅。没有订阅者时不保留展示样本，但持久化记录仍照常写入。展示方应以 `segmentIndex` 和 `sequence` 缺口断开曲线，不把批次缓存当成完整历史结果。

## 主动会话生命周期

`RPPGActiveRuntime` 为一次页面运行串行管理 `RPPGSession` 命令。显式 `openPreview()` 取得本次相机租约并打开前摄预览；预览期间不加载 Face Landmarker、不写正式结果。只有显式 `start()` 才创建模型处理器，并调用 `CameraSource.replaceFrameGeneration()` 排空预览分析帧后进入新观察代次；旧代次回调不进入正式处理。

首个被接受的正式帧建立传感器纳秒原点，随后异步打开会话文件。人脸必须连续满足版本化就绪条件；只有就绪帧才开始重置后的信号算法和正式计时，不回填此前观察帧。目标时长从就绪边界起算，缺脸或缺帧不会顺延。观察超时前收到过正式帧但始终未就绪时，可发布完整v2四份文件，三份CSV只有表头，并标记 `no_waveform`；观察期没有任何正式帧则返回相机错误，不发布空成功结果。

测量到时、用户停止、宿主后台和页面离开都经过同一个关闭屏障：先拒绝新帧并使代次失效，再关闭相机、等待借用帧退出、收尾算法、排空记录队列并定稿／发布结果。页面离开通过 runtime 的 `close()` 使用 `page_left`；关闭未能释放相机或模型时保留失败状态，不假报关闭成功。技术失败不创建完整元信息或已完成产物；完成会话不会自动重新打开相机，下一次测量需要再次显式打开预览。

`RPPGActiveRuntime` 只管理主动页面；被动前台服务独立管理同一 `RPPGSession` 内核，不依赖 React 页面或主动 runtime。

## Nitro 客户端与 JS 数据边界

采集包公开 `createRPPGClient()`、`RPPGClient` 和 `RPPGPreview`。客户端仅支持 Android；创建客户端、读取快照、挂载预览和订阅都不会申请权限或打开相机。调用方必须先显式执行 `requestCameraPermission()`，挂载 `RPPGPreview`，再按需调用 `openPreview()` 和 `start()`；`stop()`、`close()` 等待原生收尾屏障。状态订阅返回独立清理函数，页面离开前应等待 `close()` 并解除订阅。

`subscribeRealtime()` 只暴露有限展示队列中的 POS 任意单位标量、相对传感器原点的样本时间和批次／片段序号；样本与完整 `pulse.csv` 同源，订阅慢时只丢弃该订阅自己的旧批次。`sequence` 或 `segmentIndex` 不连续时展示曲线必须断开。状态中的纳秒绝对时间以十进制字符串跨桥，避免 JS 浮点数精度损失；就绪进度最多每 250 ms 更新一次，状态转换和新心率结果即时通知。

该窄例外不传输 `ImageProxy`、原始帧／RGB／ROI／面部关键点、逐帧相机元数据或完整历史样本；实时队列不替代文件记录，也不因 JS 未订阅而停止持久化。`listArtifacts()` 仅返回已发布本地产物的会话标识、文件类型、真实绝对路径和大小，不读取或复制文件内容。新结果引用外部路径，已有内部结果保留原路径。客户端没有认证、HTTP、上传或被动采集启停依赖；原始 PPG 仍没有逐帧记录或高速批次的 JS 接口，见 [Android 相机 PPG 采集协议](android-ppg.md)。

### 产品面部页的接入边界

产品入口为“功能”→“面部检测”或“面部心率”→准备／声音确认→面部心率检测；已勾选“以后不再提示”时跳过准备和声音提醒，直接进入检测页。进入页面保持 `--`、00:00 和空曲线，不申请权限或创建 runtime。用户明确开始后才授权、挂载原生 `RPPGPreview`，包装层同时确认真实 Nitro `hybridRef` 与正尺寸 `onLayout` 后才报告就绪，然后串行等待 `openPreview()` 与 `start()`。原生 host 在构造时同步注册到预览 registry，Fabric 布局计算可以早于实际挂载，不能单靠布局事件放行；双信号门槛也不表示相机已经 STREAMING 或收到首帧。

产品平均仍是唯一有效频谱窗口的算术平均，按会话、片段和窗口起止纳秒身份去重；`latestInstantHeartRate` 不填入该槽位，也不参与累计。波形可先到达而平均继续为空。结束后的均值只属于当前页面会话，不发布到首页、最近检测时间或健康历史。

产品正式计时从原生 `measuring` 通知启动页面的单调经过时间，不包含授权、打开和找脸；当前没有跨 JS／原生时钟同步协议，不能直接相减绝对纳秒。原生负责截止、终止原因和本轮完整产物收尾。展示计时不超过原生目标时长；原生以 `target_duration` 结束时显示完整目标时长（当前为 `00:30`），不受开始通知延迟影响；提前停止或中断仍显示冻结的已用时间，不补足目标时长。正常页面只用 Demo 的待开始／检测中／已结束及原提示，不追加原因或信号解释；技术错误通过统一反馈保留恢复能力，进行中状态圈使用旋转 spin。

共用频谱摘要与波形模型在 `apps/native/src/app/rppg/`，图形在 `src/shared/components/RPPGWaveform/`。产品保留本轮展示历史，每屏固定六秒，可拖动回看并回到最新；Dev 保留十五秒／300 点有界缓存。片段、漏批或时间缺口断线，不跨缺口补造波形。退出产品或 Dev 主动页都等待在途命令、`close()` 及资源屏障；已关闭客户端不复用，Dev 重新聚焦时创建新 runtime。真实指尖也注册自己的主动相机离页所有者，只关闭其本轮 PPG 资源，不调用面部 RPPG 的停止。

`RPPGWaveform` 使用共享 `PulseWaveChart` 的 ECharts 原生 SVG 渲染器，不再手绘 SVG path。图表坐标保留原始时间和幅值，连续性检查在丢批／切段／时间缺口处插入空值，关闭跨空值连线。产品关闭 ECharts 入场和更新插值，以绝对显示时间驱动原生连续位移衔接采样批次，不让历史波峰在更新时反向跳动；拖动回看时继续采样但保持所选时间段，回到最新后恢复跟随。单基线和左侧渐隐固定在视窗上，不随曲线移动；开发诊断图保持直接更新。显示位移及纵轴缩放均不回写采集记录。指尖真实展示脉搏复用绘图组件，但会话、批次协议和数据源与 RPPG 隔离；显示流畅不代表信号有效。

命令错误与历史会话错误分开：`RPPGSessionOperationResult.commandError` 优先保留当前显式错误，仅在命令被拒绝时回退到快照错误。成功命令不带入旧 `CAMERA_BUSY`；真实关闭失败仍阻止产品页离开。已关闭快照保留诊断历史，但不作为新的正常页面提示反复弹出。

指尖产品页通过独立 `AcquisitionClient` 使用真实后摄、覆盖门控及有界脉搏，协议见 [Android 相机 PPG](android-ppg.md)，不调用面部算法；Dev 的手动 PPG 页面仍保持独立控制。模拟器素材、模型推理和工程波形均不能证明人体心率有效性。真机颜色校准、性能、有效读数布局与参考仪器对照仍需实际测量，操作见 [Android 开发手册](../development/android-development.md)。
