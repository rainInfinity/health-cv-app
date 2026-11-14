# 参考项目 `nxhe-app-intl` 的血压估计流程

本文仅记录参考源码行为，不是 `health-cv-app` 的实现、算法合同或验收标准。路径与行号均相对于 `nxhe-app-intl/` 的参考快照，源码变化后需重新核对；新项目边界见[代码组织](code-organization.md)与[产品需求](../product/product-requirements.md)。

参考流程使用手机后摄与内置加速度计，不连接蓝牙血压计。上传信号及相机元数据，不上传原始视频；血压由服务端任务返回，客户端负责转换、质量判断、分级和展示。参考仓库没有服务端模型源码，不能据此确定特征提取、SCG 生成、模型结构或推理耗时。

## 用户路径与时序

| 阶段 | 源码行为 |
| --- | --- |
| 入口 | 血压卡片检查登录与 `bioInfo` 是否存在，不做逐字段资料完整性校验。 |
| 进入页面 | 挂载时请求相机权限；失败提示并返回。页面含操作、上次结果、质量分和参考提示。 |
| `idle` | 第一次点击打开后摄预览，第二次点击开始准备；有闪光灯时随预览 active 启用。 |
| `preparing` | 目标 10 秒，开始时调用 `bp-30s` 音频，不是正式采集开始时播放。 |
| `running` | 目标 30 秒，启动加速度计并接收批次；剩余 10 秒和 3 秒调用倒计时语音。 |
| `uploading` | 停止相机及加速度计，仍接收 PPG／frame 尾批，写文件、提交并等待结果；显示转圈而非百分比。 |
| `finished` | 显示结果，允许重新评估；是否能查看波形／详细分析由客户端质量判断决定。 |

10 秒准备和 30 秒采集不包含相机打开、传感器启停、文件生成、网络和云端处理。测量中再次点击被非 `idle` 守卫忽略；页面没有暂停、继续或取消按钮，离页才清定时器与传感器。

四步引导是轻按后摄、确认红亮、开始并稳定、贴胸稳定，使用同一示意图，不随状态推进。光线／覆盖提示为 3 秒 Toast，共用 5 秒节流，正式阶段才尝试播放对应语音，不阻止或延长采集；音频实际内容和长度不能由调用点确定。

依据：`src/pages/chs/index.tsx:35-40`、`src/components/VHealthCards/index.tsx:24-48`、`src/packages/chs/bp/index.tsx:21-63`、`src/hooks/steps.ts:17-21`、`locales/zh_CN.json:523-528`、`src/services/config.ts:167-180`、`src/packages/components/VChsMeasureComp/{index.tsx,actions.ts,PPGCamera/index.tsx}`、`src/packages/components/VStatusButton/index.tsx:52-129`。

## 采集、批次与文件

相机请求后置、720×720、30 FPS、`blockSize=1`；加速度计请求间隔 5 ms，即 5000 μs。这些是请求，不代表实采稳定达到 30 FPS／200 Hz；自动曝光下的 ISO 和曝光配置也不是实测锁定值。

| 文件 | 来源与传输 | CSV 列 |
| --- | --- | --- |
| `ppg.csv` | 原生 YUV 全帧均值，批量发送；JS 只在 `running`／`uploading` 接收。 | `timestamp,timestampFrame,timestampSystem,avgY,avgU,avgV,frameIndex,blockIndex` |
| `frame.csv` | 曝光、帧时长、ISO 等，和 PPG 分别缓存；Android 来自 Camera2，iOS 来自 sampleBuffer 回调时设备属性。 | `timestamp,timestampFrame,timestampSystem,exposureTime,durationTime,rollingShutterSkewTime,iso,whiteBalanceMode` |
| `acc.csv` | 原生累计 1000 条或约 5 秒发批次，停止时发尾批，初次批次可能更早。 | `timestamp,timestampEvent,timestampSystem,accX,accY,accZ` |

JS `DataCache` 以数组累计，结束后一次性拼 CSV，写入 `RNFS.TemporaryDirectoryPath` 下固定文件名；只写非空文件，上传前仅要求至少一路有记录。没有逐采样落盘、排序、时间对齐或三路完整性校验。正常上传不立即删除，后续清缓存／卸载的清理也没有等待完成。

依据：`src/services/config.ts:14-45,93-106,167-180`、`src/services/entities.ts:101-112,153-174`、`src/services/sensorFactory.ts:63-80`、`src/services/sensorManager.ts:10-39`、`src/services/dataCache.ts:13-49,80-118`、`src/services/fileManager.ts:21-35`；原生来源为 `android/app/src/main/java/com/nxhe/app/ppgcamera/FrameProcessor.kt`、`utils/DataHub.kt`（同级包路径）、`sensors/BaseSensor.kt`（同级包路径），以及 `ios/nxheapp/NativeModules/cpp/{FrameProcessor.cpp,DataHub.h}`、`Sensors/BaseSensor.m`。

### 时钟与窗口边界

- Android 的 `ppg.timestampSystem`／`acc.timestampSystem` 是 `System.nanoTime()`；iOS 同名字段是 `NSDate` Unix 时间，不能按同名直接对齐。
- Android 曝光和帧时长来自逐次 Camera2 结果；iOS `durationTime` 按请求帧率推算，`rollingShutterSkewTime` 固定为 0。
- JS 重命名加速度向量而不换算单位，跨平台量纲不能从字段名推定。
- 整批按收到时的 JS 状态入缓存，不按样本时间裁切；`onSendFinished` 表示原生触发 flush，没有 JS 尾批处理完成的确认屏障。

[INFERENCE] 跨界批次可能混入准备期样本，停止时各源范围也可能不一致；发生频率与影响需按设备时间戳核对，不能从静态流程量化。

依据：`android/app/src/main/java/com/nxhe/app/ppgcamera/FrameProcessor.kt:78-85,182-207`、`sensors/BaseSensor.kt:72-85`（同级包路径）、`ios/nxheapp/NativeModules/PPGCamera/PPGCamera.mm:404-468`、`src/services/entities.ts:101-112`、`src/packages/components/VChsMeasureComp/actions.ts:87-147`、`PPGCamera/index.tsx:86-112`（同组件目录）、`android/app/src/main/java/com/nxhe/app/ppgcamera/PPGCamera.kt:261-272`。

## 上传、查询与结果

`POST` multipart 将各非空 CSV 放入同名 `datas` 字段，附 `hmodelId=2` 和 `addition=DeviceInfo.toJSON()`。参考配置固定 `prefix=ios_cn`，路由为 `ios-cn/api/htask/schedule`，携带 `X-Client-Key` 与可用 Cookie；这些不是新项目的渠道、认证或上传合同。默认请求超时 30 秒与采集时长独立。

只有 `SUBMITTED` 才按 ID 查询；间隔 2000 ms、最多计数 5 次，首次不是额外等 2 秒。无有效响应、到终态或达到上限后停轮询，不能简化为固定 10 秒云端超时。`SUCCESS` 才走正常成功结果分支，异常分支还受下表的客户端判断影响。

结果 DTO 有 `sbp`、`dbp`、`qualityScore`、`qualityThreshold`、`qualityPassed`，处理后 PPG／SCG URL 在 `extend`。结果页显示数值、质量和较上次升降；详细分析使用固定建议，分级与颜色由客户端计算，不是本地血压模型推理；波形页另取任务及处理后文件。

依据：`src/api/common.ts:8-28`、`src/api/services/taskServices.ts:5-25`、`src/api/apiClient.ts:8-35,204-254`、`src/services/config.ts:150-157`、`src/hooks/htask.ts:87-140`、`src/types/dto/result.ts:1-17,55-63`、`src/common/hresultMap/index.ts:53-101`、`src/packages/components/VChsMeasureComp/{actions.ts:149-190,ChsNowResult/index.tsx:21-76,146-240}`、`src/packages/chs/pages/{analysis/index.tsx:80-105,waveform/index.tsx:70-105}`。

## 不应继承的行为与待核对风险

| 源码行为 | 风险与边界 |
| --- | --- |
| `SBP < 100`／缺失、`DBP < 60`／缺失时分别随机替换为约 130–140／80–90，再分级。 | 确定会改写结果，可能掩盖真实低值；新项目不得用随机值补缺。见 `src/hooks/hresult.ts:82-87`。 |
| `FAILED` 仅在有 `result.error` 且质量分为假值时弹错；质量分为 0 或缺失时默认通过，不直接用 `qualityPassed`。 | [INFERENCE] 失败／缺字段可能进入可查看结果，需依据正式成功和质量合同，不复制该门禁。见 `actions.ts:156-171`、`ChsNowResult/index.tsx:205-240`（上述组件目录）。 |
| 非 `SUBMITTED` 不轮询，无 `onSendFinished` 超时，CSV 写入在上传 `try/catch` 外。 | [INFERENCE] 可能持续等待或缺少恢复入口，不能将停止查询理解为后端处理超时。见 `actions.ts:132-193`、`src/hooks/htask.ts:114-137`。 |
| 挂载和打开时重复初始化，异步传感器未就绪即进 `idle`，启停错误主要写日志。 | [INFERENCE] 可能有就绪竞态或监听残留；应检查真实状态与必需源，而非只检查至少一路数据。见 `index.tsx:56-79,98-100`、`src/services/sensorManager.ts:18-68`。 |
| 固定临时文件名、按到达状态收整批、异步清理。 | [INFERENCE] 窗口混入和覆盖／清理交叠需用实际事件核对；新项目按独立会话、原生有界写入与明确收尾设计。 |

本文不提供实采 FPS／Hz、音频、模型精度或异常频率结论。新项目状态转换、文件与云端合同须独立定义，不能直接继承参考参数。
