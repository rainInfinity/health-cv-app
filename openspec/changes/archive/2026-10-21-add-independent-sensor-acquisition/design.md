# Design

## Context

动机与授权范围见 `proposal.md`。当前 acquisition 没有 Android SensorManager 的采集实现；应用 `App.tsx` 通过本地页签提供主动 PPG／被动视频验证，不需要为新入口引入路由框架。

旧项目 `../nxhe-app-intl/android/app/src/main/java/com/nxhe/app/sensors/` 将四种传感器组织为 `BaseSensor` 与仅声明类型／名称的子类。该基类同时持有监听、数组批次、RN Promise 和逐批 JS 发送；旧 JS DataCache 收集全量后落盘。这里只参考类型分类与 Android 单位，不复用其缓存、桥接和完成语义。

平台依据：

- [Android Sensors Overview](https://developer.android.com/develop/sensors-and-location/sensors/sensors_overview)：设备可缺失传感器；采样间隔是请求而非实际速率保证；自然设备坐标不随屏幕旋转；Android 12+ 对部分传感器施加 200 Hz 限制；Android 9+ 后台连续传感器受限。
- [Android Motion Sensors](https://developer.android.com/develop/sensors-and-location/sensors/sensors_motion)：加速度计／重力单位为 m/s²，陀螺仪为 rad/s；磁力计单位为 μT，见上述总览。

**实施前置条件：** `refactor-acquisition-architecture` 已完成并通过其独立验收，提供共通 `AcquisitionPaths`、`AcquisitionFileStore`、`BatchWriter<T>`、`CsvBatchWriter<T>`、`CsvRowEncoder<T>` 与 DataHub。这里不复制这些实现，也不把传感器需求加回重构的完成门槛。

## Goals / Non-Goals

**Goals:**

- 四种类型采用同一设备适配与单源会话契约，实例、失败和文件按类型隔离。
- 让 JS 用独立命令组织联合采集；停止成功代表可直接读取的完整文件，而非仅收到停止请求。
- 保留旧项目各类型 CSV 轴列、顺序、时间语义和单位，明确前台生命周期，不据此推断后端兼容性或实际频率。

**Non-Goals:**

- 不新增原生跨源会话、联合启动／停止、时间对齐、重采样、校准、滤波、去重力或坐标旋转。
- 不新增后台传感器服务、高采样率权限、原始样本 JS 事件、波形 UI、上传、重启自动恢复或磁盘产物扫描。
- 不替代设备不存在的传感器；Android 自己提供的标准重力传感器允许使用，不在应用中另造一个重力算法。

## Decisions

### 1. 一个类型一个独立控制实例，JS 只编排

公开类型固定为 `accelerometer`、`gyroscope`、`magnetometer`、`gravity`。分别使用 `TYPE_ACCELEROMETER`、`TYPE_GYROSCOPE`、`TYPE_MAGNETIC_FIELD`、`TYPE_GRAVITY` 的默认设备。复用配置驱动的 `AndroidSensorSource`，不创建四个仅常量子类。

JS 新增 `SensorClient` 与 `createSensorClient(kind)`；创建客户端、读取能力和订阅不启动设备，也不创建会话文件。控制方法为：

| 方法 | 契约 |
| --- | --- |
| `getCapabilities()` | 异步返回本类型是否可用、可用时的设备名称与 `minSamplingPeriodMicros`；缺失时 available=false，设备字段为空 |
| `getSnapshot()` | 读取本类型低频状态，不返回样本 |
| `subscribe(listener)` | 订阅状态转换；返回的清理函数只解除订阅 |
| `startCapture(config)` | 显式开始本类型，成功返回 void，失败 reject `SensorCaptureError` |
| `stopCapture()` | 等待本次停止并返回 `SensorArtifact`；失败 reject，不返回伪造产物 |
| `listArtifacts()` | 返回本类型当前进程已完成引用，不触发目录扫描 |

不强迫 PPG 的相机打开／预览命令与传感器启动命令实现同一个大接口。Nitro Spec 固定每个方法的 kind 参数，JS 客户端绑定 kind，错误结果在 JS 边界转换成异常，沿用现有包的控制模式。

`SensorRuntime` 按类型保存唯一 `SensorController`。同类型多个客户端观察同一物理源，重复开始报 `SENSOR_BUSY`，不偷偷创建第二个监听；这不是联合控制器，没有跨类型开始／停止 API。各类型状态互不自动传播。JS 测量流程决定失败后是否主动停止其他源。

### 2. 保留各类型旧 CSV 列，内部共用数值模型

CSV 保留六列 UTF-8 格式，前三列依次为 `timestamp,timestampEvent,timestampSystem`，末三列保留各类型旧轴列名称与顺序，完整表头见下表。三个时间列为有小数的毫秒，分别对应回调接收时的 `elapsedRealtimeNanos`、原始 `SensorEvent.timestamp`、回调时的 `System.nanoTime()`；不是 Unix 时间，也不互相替代。原生模型保留纳秒 Long，到编码时转换。内部仍共用 x/y/z 数值结构，编码器根据 kind 将三个 Android Float 值依次写入对应的旧轴列，不做物理量转换，也不额外输出通用 x/y/z 列。

| kind | Android 类型 | 三轴单位 | 数值含义 |
| --- | --- | --- | --- |
| accelerometer | TYPE_ACCELEROMETER | m/s² | 包含重力的加速度 |
| gyroscope | TYPE_GYROSCOPE | rad/s | 绕设备三轴的角速度 |
| magnetometer | TYPE_MAGNETIC_FIELD | μT | 三轴磁场 |
| gravity | TYPE_GRAVITY | m/s² | 系统默认重力传感器三轴值 |

统一坐标系为设备自然方向：X 向右、Y 向上、Z 指向屏幕外，屏幕旋转不重映射轴；自然方向不假设总是竖屏。API 的单位标识使用 `m/s2`、`rad/s`、`uT`，坐标标识为 `android-device`。能力／产物描述单位与类型，不在每个样本中重复分配字符串。

| kind | 完整 CSV 表头 |
| --- | --- |
| accelerometer | `timestamp,timestampEvent,timestampSystem,accX,accY,accZ` |
| gyroscope | `timestamp,timestampEvent,timestampSystem,gyrX,gyrY,gyrZ` |
| magnetometer | `timestamp,timestampEvent,timestampSystem,magX,magY,magZ` |
| gravity | `timestamp,timestampEvent,timestampSystem,graX,graY,graZ` |

这些列名和顺序沿用旧项目 `src/services/config.ts`，使单份 CSV 自身包含传感器类型信息，不要求依靠目录或产物元数据区分。内部样本与共通 writer 无需按类型复制，只由编码器选择固定表头并保持三轴位置映射；不引入别名列或反射。沿用 CSV 列协议不等于已经验证旧云端模型或上传协议兼容，后端对接仍不属于本变更。

完成产物包含 kind、sessionId、path、sizeBytes、sampleCount、startedAtMillis、finishedAtMillis、requestedSamplingPeriodMicros、registeredSamplingPeriodMicros、unit 和 coordinateSystem。起止时间是本会话原生单调边界，不代表跨源同时开始。sampleCount 是实际接收且成功落盘的记录数，不等于请求频率乘时长。

### 3. 采样参数只有明确单位，不承诺实际 Hz

`SensorCaptureConfig` 要求显式 `samplingPeriodMicros`，合法值为 5,000 至 1,000,000 的整数微秒；验证页默认填写 20,000 微秒，客户端不隐式替调用者选择参数。NaN、无穷、非整数、超出范围和未知 kind 均拒绝，不按 Android 的延时常量解释 0/1/2/3。

注册间隔为 `max(requestedSamplingPeriodMicros, sensor.minDelay, 5000)`，忽略非正 minDelay 的限制意义；在状态／产物中保留请求值与实际传给注册接口的值。注册值不是实际采样周期。选择 5,000 微秒下限避免请求超过 200 Hz 的特权，不申请 `HIGH_SAMPLING_RATE_SENSORS`，不靠 permission 异常后重试兜底。

相比自动按业务方案选择频率，显式单位更适合独立入口；不同类型可用不同参数，修改参数需要在前次会话收尾完成后重新开始。

### 4. 回调线程只快照与有界入队

设备适配使用受控的串行回调线程接收 Android 事件，直接读取三个数值和时间后交给当前绑定会话，不保留 SensorEvent 或 values 数组，不逐样本创建协程。线程及监听的生命周期归该类型源所有，在停止／失败收尾中回收；不要使不同类型共用一个全局可变样本缓冲。

`SensorCaptureSession` 为每次采集创建独立 DataHub，沿用共通默认的有界容量与批处理策略；这不是固定公开参数，不为默认数字写测试。消费在后台顺序调用 `CsvBatchWriter<SensorSample>`，不重排、重采样或静默丢弃已接受记录。容量包含排队与正在写的批次；offer 拒绝导致当前会话失败，不能把溢出后的部分文件发布为成功。

设备缺失报 `SENSOR_UNAVAILABLE`；注册返回 false／抛错报 `SENSOR_REGISTRATION_FAILED`。不足三轴、非有限值或无效事件时间报 `SENSOR_DATA_INVALID`，不补 0。文件打开、写入、收尾分别使用 `FILE_OPEN_FAILED`、`FILE_WRITE_FAILED`、`FILE_FINALIZATION_FAILED`；排队容量不足使用 `DATAHUB_CAPACITY_EXCEEDED`，原始原因保留。未知类型／参数分别为 `INVALID_SENSOR_KIND`、`INVALID_SENSOR_CONFIG`。

### 5. 接收窗口与停止屏障绑定原生会话

启动先准备输出和队列，再确定 `startedAtElapsedNanos` 并注册监听。监听回调绑定本 session，不在异步运行时查询新的活动会话。事件时间早于开始边界的历史事件被排除；新样本只有在入口开放并登记在途后才算接受。

停止在原生记录截止边界，关闭该会话新入口并注销监听，通过同一回调线程屏障等待已进入处理的回调退出，随后排空 DataHub、关闭 writer、提升单文件路径，最后返回产物。仅保存入口开放时接受且事件时间位于正式窗口内的记录，不承诺收齐系统已经产生但尚未交付的全部硬件事件。注册与注销过程中的迟到回调不能进入后续会话。

同次停止的并发调用共享完成屏障；完成后且未启动下一次时，重复停止返回同一产物或同一失败。停止请求在调用时绑定目标会话，异步等待时不能重读活动指针误停下一次采集。没有当前或已完成会话时停止报 `SENSOR_NOT_CAPTURING`；正在开始或停止时再次开始报忙。失败先封闭成功路径，再回收监听、线程、队列和输出，其他类型不受影响。启动失败也必须撤销已经准备好的资源。

零样本正常停止报 `SENSOR_NO_SAMPLES`，不发布只有表头的完成文件；非零也只证明有实际交付数据，不证明频率／完整性／生理有效性。

### 6. 前台生命周期与页面订阅分开

首批为前台采集：只有宿主处于可用前台状态才能开始；宿主暂停／进入后台或运行上下文销毁时，原生封闭本类型入口并失败收尾，记录 `APP_NOT_FOREGROUND` 或 `RUNTIME_DESTROYED`，不伪装为正常手动完成，不自动恢复，也不新建后台服务。

页面卸载、页签切换和 unsubscribe 本身不停止传感器；客户端由应用级 `src/app/sensors.ts` 持有，独立的宿主生命周期回调才决定后台中断。这使用户能先启动传感器，再切换主动 PPG 页，在前台联合使用。已有 PPG 页面卸载即关闭相机的行为保持不变，不能为联合演示偷偷改变。

用户关闭某一源只影响它；因相同宿主暂停而多个源分别失败，是共同外部条件，不是新增原生联合停止策略。

### 7. 集中路径、单源持久文件、进程内查询

集中路径新增：`filesDir/acquisition/sensors/<kind>/<sessionId>/<kind>.csv.part`，成功后为 `<kind>.csv`。kind 来自受控枚举，sessionId 每次生成并校验，拒覆盖。保留已有 PPG 与视频目录，不能因为增加 sensors 子目录就改变其它能力的查询。

`SensorSessionOutput` 通过共通路径与文件操作打开新流，组合 `SensorCsvEncoder` 和 `CsvBatchWriter`。只有尾批完成、关闭成功、样本非零且单文件提升成功才交付。失败 `.part` 不加入成功列表；不在本次添加自动清理策略。已完成文件不随停止、取消、页面卸载、关闭相机或进程退出删除。

`listArtifacts()` 与 PPG 一样只查询本进程已完成引用，按 kind 隔离；进程重启后列表为空，但已有文件仍在。此限制须出现在 UI／文档，不增加扫描、索引或恢复机制。文件产物查询不同于被动视频原有磁盘扫描，不抽取共同产物目录服务。

### 8. 代码组织与公开边界

| 路径 | 职责 |
| --- | --- |
| `packages/acquisition/src/sensors/client.ts` | SensorClient、SensorCaptureError 与创建函数 |
| `packages/acquisition/src/native/SensorCapture.nitro.ts` | 四种 kind、配置、能力、低频快照、产物和控制结果的公开协议 |
| `packages/acquisition/src/index.ts` | 导出新接口，不改原有导出 |
| `android/.../sensors/model/SensorKind.kt` | Android 类型、单位等固定描述 |
| `android/.../sensors/model/SensorConfig.kt` | 已验证的请求及注册参数 |
| `android/.../sensors/model/SensorSample.kt` | 独立数值与纳秒时间，不引用系统事件 |
| `android/.../sensors/model/SensorArtifact.kt` | 内部完成文件与采集边界、计数 |
| `android/.../sensors/source/AndroidSensorSource.kt` | 设备查询、回调线程、注册和注销 |
| `android/.../sensors/session/SensorCaptureSession.kt` | 单源接收边界、DataHub、停止和失败；相关失败类型可同文件 |
| `android/.../sensors/output/SensorCsvEncoder.kt` | 按类型保留旧六列表头与三轴位置映射 |
| `android/.../sensors/output/SensorSessionOutput.kt` | 单文件生命周期与完成产物 |
| `android/.../sensors/runtime/SensorController.kt` | 本类型命令串行化、唯一活动会话和低频状态 |
| `android/.../sensors/runtime/SensorRuntime.kt` | 类型到控制器的应用级获取及宿主生命周期清理 |
| `android/.../com/margelo/nitro/acquisition/HybridSensorCapture.kt` | Nitro 委派；按 nitro.json 注册，不手改生成物 |
| `apps/native/src/app/sensors.ts` | 应用级独立客户端和低频 Store，不存样本 |
| `apps/native/src/features/sensors/SensorCaptureScreen.tsx` | 每类型能力、参数、启停、错误、产物展示 |
| `apps/native/App.tsx` | 增加单独验证入口，保留现有页签与被动 deep link |

原生快照的公开阶段为 idle、starting、capturing、stopping、failed；设备缺失由能力及错误表达，不伪造 capturing。快照仅含 kind、阶段、当前 sessionId、请求／注册参数、错误、最近产物等低频字段；只在状态变化时通知。当前控制器只有一套权威状态，不为 Nitro 结果另维护一套状态机。文件路径／方法名保持职责清楚，不按四种传感器复制四套代码。

### 9. 验证策略

永久测试覆盖输出数值／时间／单位语义、回调窗口与旧会话隔离、同类型忙、异类型独立、注册失败资源回收、停止等待在途／尾批／关闭、容量与文件失败不发布、无样本、后台中断和完成产物保留。采用可控制回调和虚拟时间验证竞态，不以 mock 回声、源码扫描或内部接线断言充数；已有 DataHub 测试不重复复制。

运行证据必须经过真实系统回调到实际 CSV：在 Android 实机或模拟器启动应用，从四种能力查询开始，分别操作可用类型、读取产物并核对表头、时间、轴值、行数与 sampleCount。设备缺失类型真实验证不可用路径，不能伪造成采样成功；四类型的正向采样最终需有支持相应类型的运行环境，缺失项保留为未完成验收，不用一次支持两种的设备代替全部通过。模拟器注入必须标注，实体性能不由此推定。

验证页提供逐类型控制、不提供原生联合按钮；以两种源同时运行后仅停止一源的方式验证另一路仍继续，并先启传感器再切换 PPG 页完成相机与传感器并行。读取文件证明两个独立会话窗口内有交付，不以同一时间发出 JS 命令宣称同步。后台中断后返回应用验证未自动恢复、错误可见、旧完成文件保留。

## Risks / Trade-offs

- [设备缺失或系统重力实现不同] → 查询真实默认设备，缺失明确失败；记录环境，不加入应用层模拟兜底。
- [请求 200 Hz 被误解为稳定采样] → 输出请求与注册参数，文件保留原始事件时间；仅基于实际间隔记录观测，不作稳定性承诺。
- [前台／后台边界影响联合采集] → 原生宿主暂停时显式失败，不依靠 JS 页面是否挂载；文档说明授权对话框等宿主暂停也可能中断，不自动恢复。
- [stop 与迟到回调／新 start 交错] → 会话绑定、入口关闭、串行回调屏障、消费者排空及目标会话快照共同保证隔离。
- [内部通用轴值与外部类型列映射错位] → 对四种类型验证完整旧表头，并用互不相同的三轴数值核对列位置；不输出通用 x/y/z 或别名列，不冒称已验证后端兼容。
- [四路并行提高 IO 与内存负载] → 每源有界、每批顺序、无逐样本 JS 事件；超限只失败本源，不用无限队列掩盖。
- [重启后无法从 UI 重新列出旧传感器文件] → 明确进程内查询范围和持久文件事实；扫描恢复不属于本次。

## Migration Plan

1. 先完成并验收架构重构；确认共通层和现有 PPG／被动行为可独立交付。若前置未完成，不绕开依赖复制实现。
2. 增加模型、按类型保留旧轴列的六列输出、设备源、单源会话及类型隔离控制，扩展集中路径规则，不改旧路径。
3. 增加 Nitro Spec 和手写 Hybrid 注册，运行 Nitrogen，再接 JS 客户端与验证入口，保持原有导出／入口行为。
4. 运行针对边界的行为测试和实际 UI／文件／并行／中断场景，记录四类型正反向证据；维护传感器文档与架构说明。

没有旧传感器数据需迁移。若回滚，移除这一组新入口／绑定／实现，保留已经完成的私有文件，不改变前置重构或其它能力；不在生产中保留新旧两套传感器路径。此处为设计策略，不授权自动回退或删除文件。
