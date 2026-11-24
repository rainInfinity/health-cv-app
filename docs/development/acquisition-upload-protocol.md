# 采集文件与云端任务对接

本文维护原生指尖与血压的产物映射、自动上传及结果读取合同。业务流程归 `apps/native/src/app/measurement`，普通请求归 `packages/cloud-client`；模型是否在目标渠道配置、真实输入是否通过算法校验仍以实际响应为准。

## 范围与合同来源

所有指尖部位及指标入口共用统一 PPG 场景，一轮只上传一份 PPG；所有血压入口共用统一 PPG＋ACC 场景，上传同轮 PPG 与 ACC。入口目标只影响报告重点，不切换独立算法。

后端依据为 `health-service/docs/frontend-integration.md` 第 6 节算法合同及第 7 节任务与文件合同。采集文件的字段、单位和发布条件仍由采集协议维护；HTTP、文件 URI、上传回执与取消语义由[云端请求接口](cloud-client-api.md)维护。

## 产物与输入映射

| 产物 | 已定义的输入关系 | 当前限制 |
| --- | --- | --- |
| `ppg.csv` | 原始 PPG 独立算法、统一 PPG 和统一 PPG＋ACC 场景均使用 `logicalName=ppg`，文件名须带 `.csv` 后缀。 | 原生 `[1,1]` 单块产物与必需列、单位在静态协议上匹配；不表示真实样本已通过采样和质量校验。 |
| 加速度计 CSV | 血压统一 PPG＋ACC 场景使用 `logicalName=acc`，文件名须带 `.csv` 后缀。 | 只使用本轮联合完成引用，不以历史 ACC 补齐当前任务；共同窗口不等于硬件同步。 |
| `frame.csv` | 上述合同均不要求此文件。 | 同会话生成不构成上传理由，不自动附带。 |
| 陀螺仪、磁力计、重力 CSV | 上述合同没有对应输入。 | 不因为属于传感器产物就映射为 `acc`。 |
| RPPG `session.json`、`pulse.csv`、`hr.csv`、`beat.csv` | 当前原始 PPG 合同不接收这些RPPG产物；旧v1三件套同样不适用。 | POS脉搏、频谱心率窗口及逐搏序列不含原始RGB／YUV通道，不能冒充 `ppg.csv`；面部本地RPPG不套用此上传流程。 |
| 旧 `video.mp4` | 当前无确认的上传用途。 | 不自动上传，也不作为上述算法输入。 |

### 原始 PPG

后端接收 UTF-8 CSV，可带 BOM。`timestampFrame` 必须为有限、严格递增的毫秒数值，通道列只能包含以下一组完整字段：

- RGB：`avgR,avgG,avgB`。
- YUV：`avgY,avgU,avgV`，与当前原生 PPG 产物一致。

表头不得重复，行列数须一致，通道值须有限。`blockIndex` 可省略；存在时只能为整数 `0`。多块产物不能直接用于当前合同：同帧时间戳重复且存在非零块编号，服务端不会自动选块、合并、重采样、插值或补帧。原生格式及同会话 `frame.csv` 的配对关系见 [PPG 协议](../acquisition/android-ppg.md)。

统一 PPG 场景各成员共同的显式采样下限为 `fs > 8 Hz` 且 `N >= max(450, ceil(15 * fs))`。这不是成功保证；滤波条件、信号质量和模型结果仍由各成员独立判定，不能仅按页面经过时间推断文件合格。

### 加速度

ACC 必需列为 `timestampEvent,accX,accY,accZ`，时间单位为毫秒，轴值单位为 `m/s²`；原生格式见[传感器协议](../acquisition/android-sensors.md)。时间戳和轴值须有限，时间严格递增。现有原生产物包含这些列，不需要为了上传在 JS 重写 CSV。

服务端按 PPG 和 ACC 各自时间戳计算采样率，不排序、重采样、归零时钟或自动对齐。两路时间字段来自设备单调时间体系，不是 Unix／UTC 时间；不能仅凭列名或同为毫秒就认定跨源已同步。采集窗口、时间关系和真实输入效果仍须联调确认。

`sessionId`、相机配置、网格和采样配置等元数据不会随单文件上传自动附带。血压使用提交时冻结的服务端资料快照；上述场景不要求额外客户端元数据，不为补充输入关系而随意添加请求字段。

## 方案与模型绑定

| 后端合同 | 算法标识 | 必需输入 | 结果组织 |
| --- | --- | --- | --- |
| 统一 PPG 场景 | `ppg.active.offline.all.v2` | 一份 `ppg` | 固定成员 `hr`、`br`、`spo2`、`diabetes`，可部分成功。 |
| 统一 PPG＋ACC 场景 | `ppg_acc.active.offline.all.v1` | `ppg`、`acc` | 当前只有 `bp` 成员，不同时产生其他指标。 |

统一 PPG 的四个成员读取同一份原始文件，不上传四份副本，也不上传其他成员的处理后文件。固定算法依次为 `ppg.active.offline.hr.v1`、`ppg.active.offline.br.v1`、`ppg.active.offline.spo2.v1`、`ppg.active.offline.diabetes.v1`。场景固定成员及实现修订，不通过请求参数选择子集，也不自动包含未来算法。

独立 HR、BR、血氧、血压及糖尿病风险算法按各自结果合同读取，不把独立结果强制包装为场景，也不回退为独立模型启动新产品检测。独立 HR 的模型编码为 `ppg.active.offline.hr`，成功载荷只含 `hr`、`quality` 及服务端追加的 `output_files.processed_ppg`（CSV 表头 `timestamp,ppg`）；独立 BR 的模型编码为 `ppg.active.offline.br`，成功载荷只含 `br`、`quality` 及 `output_files.processed_rsp`（`timestamp,rsp`）。两者分别判断任务状态和质量，不读取另一指标。

普通渠道模型目录不公开 `algorithmKey`。指尖显式绑定 `modelCode=ppg.active.offline.all`，血压绑定 `ppg_acc.active.offline.all`，必要时继续读取目录分页，核对非示例标记及准确的必需输入。缺失或不符在设备启动前反馈不可用，不按名称、输入或截断算法标识猜测模型。

创建任务使用目录实际返回的 `modelId`，不硬编码示例 ID。统一 PPG 新发布版本为 `2.0.0`，但客户端不硬编码或用此版本门控；创建响应中的固定模型版本是本次任务依据，不能继续以目录缓存版本代替。合同已定义不表示目标渠道已经配置相应场景或制品。

## 自动对接顺序

1. 检查当前已确认认证；不增加独立上传用途确认弹窗或专属确认偏好，系统权限及原有操作指导保持。
2. 从当前渠道目录确认统一方案和实际模型 ID，再开始真实设备流程。
3. 只有本轮 `completed`、`duration_reached`、无错误、必需文件完整定稿且资源全部释放后，才取得自动推进资格。
4. 创建草稿并保留返回的 `taskId` 和固定版本；同一 `captureId` 的重复完成通知不建立第二条链。
5. 按 URI 顺序上传本轮 `ppg`，血压再上传本轮 `acc`；不把原始 CSV 完整读入 JS。全部上传确认后自动提交，无手动提交步骤。
6. 提交 `measurement.captureMethod=fingertip/fingertip_chest`、`captureMode=active` 和原生正式窗口实际整数 `elapsedMillis` 作为 `durationMs`，不以三十秒常量替代，不发送 `capturedAt`。不添加算法不需要的 `clientMetadata`。
7. 前台可见且当前代次有效时查询详情；仅对 `SUBMITTED/RUNNING` 在前次完成后约两秒再查，终态或查询失败停止。场景必须继续检查 outcome 和各成员状态。

采集结束、文件定稿、上传确认、任务提交、云端处理完成和指标可用是不同事实。上传进度到 100% 不代表请求成功；列表摘要的 `SUCCEEDED` 也不足以判断测量有效。

## 场景结果解释

统一场景使用两层业务结论：

| 层级 | 含义 |
| --- | --- |
| 任务 `status=FAILED` | 场景自身失败，`result=null`；不展示中间结果或部分指标。 |
| 任务 `status=SUCCEEDED` | 场景执行及合法汇总完成，仍须读取 `result.outcome`。 |
| `result.outcome` | 统一 PPG 四成员成功数为 4／1–3／0 时分别为 `ALL_SUCCEEDED`／`PARTIALLY_SUCCEEDED`／`ALL_FAILED`；统一 PPG＋ACC 当前只有一个成员，不产生部分成功。 |
| `result.results.<成员>.status` | 决定该成员是否可读取数值；失败信息和质量拒绝留在对应成员内。 |

`SUCCEEDED / ALL_FAILED` 是合法汇总：顶层失败字段为空，但没有可展示指标或输出文件。各成员有独立质量结论，不存在通用的场景总质量分数。

读取前先确认对应成员 `status=SUCCEEDED`：

| 成员 | 数值路径 | 解释 |
| --- | --- | --- |
| `hr` | `result.results.hr.result.hr` | 心率，只读取该成功成员的数值与 `quality`。 |
| `br` | `result.results.br.result.br` | 呼吸率，只读取该成功成员的数值与 `quality`，合法范围 `[8,20]`。 |
| `spo2` | `result.results.spo2.result.spo2` | 血氧百分数。 |
| `diabetes` | `result.results.diabetes.result.prob`、`.risk_level` | 概率及后端编码；不重算档位，不解释为血糖浓度或医学诊断。 |
| `bp` | `result.results.bp.result.sbp`、`.dbp` | 收缩压与舒张压，单位 `mmHg`。 |

HR 与 BR 分别判断 `status`、`result.quality` 或公开 `qualityFailure`，不共享质量或成败；任一失败不抹去另一成功读数。BR 在独立任务和场景中的合法结果均须为有限数且在 `[8,20]` 内，前端只校验，不补默认值、不限幅修正。失败成员不补零、不沿用上次测量值，也不使其他成功成员失效。质量拒绝使用其公开的 `qualityFailure`，区分 `LOW_SCORE` 与 `NO_VALID_SIGNAL`；不自行重算分数或把技术失败解释成低质量。

场景输出只登记在顶层 `result.output_files`，逻辑名带成员前缀：`hr_processed_ppg`、`br_processed_rsp`、`spo2_processed_ppg`、`diabetes_processed_ppg`，血压仍为 `bp_processed_ppg/bp_processed_scg`。下载使用对象键，不使用不透明引用值作为 URL 或路径；不把场景逻辑名套用于独立算法输出。

## 上传回执与恢复边界

回执包含 `fileId`、`logicalName`、`sizeBytes`、`uploadedAt` 和 `isSelected`，调用方须保留当前业务会话需要的回执。同逻辑名再次上传会选择新记录，旧记录仍保留；超时重传不是覆盖或幂等重放。

创建没有客户端幂等键，任务详情不返回输入集合。创建或上传失败／确认未知时停止自动推进，产品统一显示“任务创建失败”并只提供重新检测，数据层仍保留已知任务与回执，不声称服务端没有草稿或文件。已知任务的提交超时先查原 `taskId`，已接受或终态不再提交，仍为草稿同样显示任务创建失败；查询失败或结果载荷不受支持显示“结果获取失败”，重新获取只查询原任务，不重建、重传或重采。任务 `FAILED` 或合法 `ALL_FAILED` 为检测失败，不形成详细报告。

本轮绑定开始时的认证代次，同账号重新登录也不接管旧采集。后台暂停后续写操作和查询，恢复先查已知任务，不自动重放写入；退出、换号、重测和真正离页撤销本地请求与迟到展示。检测与同轮详情受控往返保留关联，不持有相机或 IMU。

SDK 每次只执行一个请求，不内置业务轮询或重试。取消本地传输不等于取消服务端任务或删除文件；已提交任务可以继续执行，之后通过健康查询取得有效记录。不提供跨进程上传恢复、离线队列或后台上传保证。

## 报告与健康记录

报告通过关联 `taskId` 鉴权读取，不要求历史报告仍存在原生采集轮次。只使用顶层 `result.output_files` 的逻辑名键：指尖只取成功 `hr` 的 `hr_processed_ppg`，血压取成功 `bp` 的 `bp_processed_ppg/bp_processed_scg`。独立 HR 使用 `processed_ppg`（`timestamp,ppg`）；独立 BR 的 `processed_rsp`（`timestamp,rsp`）不作为 PPG，不新增呼吸波形展示。HR 失败或文件缺失时不借用 BR、血氧、风险等其他成员文件。

处理后文件每个最多 5 MiB、20,000 行样本；使用真实毫秒时标建立相对轴，报告 PPG 已由后端翻转方向，前端曲线及纵轴直接使用后端幅值，不再次取负；SCG 保留处理后 Z 方向。短文件不补点，两图独立六秒回看；读取失败只影响对应波形，不隐藏有效读数或重新推理。

首页及历史只读取服务端健康记录，归档日期使用北京时间 `submittedAt`。有效成员终态使该认证代次的最新结果和健康区间失效后重查，不手工追加读数；失败或 ALL_FAILED 不抹去此前有效记录。完整区间加载、分组统计与缓存边界见[前端开发约定](frontend-development.md)。

## 隐私与本地文件

文件保存在应用私有目录。只上传已授权方案要求的完整产物，不因文件存在就全部上传。采集完成、上传完成、云端成功和允许删除是不同事实；正在写入或上传的文件不能清理，上传成功不隐式删除本地文件。

旧视频包含前摄原始画面，不自动上传；RPPG本地产物（新v2四份文件、旧v1三件套）也是敏感健康相关数据，不能因其不是视频就省略用途与授权。独立本地面部采集不因引入云端指尖流程就自动转为上传。
