# Proposal

## Why

当前主动 PPG 相机的 JS/Nitro 打开命令不接受配置，原生固定选择候选尺寸、帧率及补光策略，无法采用将来由机型参数库提供的采集参数。需要先在本地打通能力查询、JS 配置、原生应用及实际结果核对，同时支持明确的二维图像分块，而不接入云端。

## What Changes

- 在打开相机前提供无采集副作用的相机枚举、参数能力／范围查询，以及按预览与 YUV 分析组合执行的尺寸／帧率选项查询；区分不支持、权限不足与未知。
- 为主动 PPG 增加 `cameraId`、目标尺寸／帧率、torch、自动／手动曝光、曝光时间／ISO／补偿、白平衡、对焦、AE/AWB 锁定的 JS 配置，通过现有 Nitro → Kotlin → CameraX/Camera2 链路应用；不把原生视图属性作为另一套配置入口。
- 配置按相机打开周期冻结；预览先运行所选自动算法，正式采集前按需确认 AE/AWB 锁定。区分请求配置、实际提交／协商配置与真实拍摄结果，不提供采集中动态调参。
- 支持 `processing.blocks: [rows, columns]`，包括 `[N,1]`、`[1,N]`、`[N,N]` 及矩形网格；默认 `[1,1]`。分块覆盖原生有效区域，编号从左到右、从上到下。
- **BREAKING**：`openCamera()` 改为接收明确配置，迁移应用调用方与 Nitro 生成绑定，不保留旧无参入口或误导性的 `exposureDelay`／`fixedFocus` 别名。
- **BREAKING**：多块时 `ppg.csv` 每帧每块一行，`frame.csv` 仍每帧一行；两者按 `timestampFrame` 关联，不再要求逐行一一对应。两份 CSV 表头与时间单位保持不变。
- 扩展无需登录的主动采集验证页，呈现支持范围、配置编辑、请求／协商值、锁定状态、错误和完成产物的分块布局。
- 不接入云端机型数据库、不增加 iOS、不修改四种独立传感器的现有采样配置及被动前摄录像；不加入防频闪、预热时长、手动白平衡增益／颜色矩阵、防抖控制或分块以外的 ROI／质量门禁。

## Capabilities

### New Capabilities

无；复用现有主动原生采集能力边界，不建立重复的相机采集规格。

### Modified Capabilities

- `native-acquisition`：增加采集前相机能力查询、配置与应用结果、单相机选择、自动算法锁定和二维分块要求；更新预览／正式采集边界、双 CSV 对应关系、低频状态及真实硬件参数验收要求。

## Impact

- 公共接口：`packages/acquisition/src/native/Acquisition.nitro.ts`、`src/ppg/client.ts`、`src/index.ts` 及重新生成的 `nitrogen/generated/`。
- Android：`HybridAcquisition`、`PPGController`、`CameraSource`、逐帧元数据、像素统计、帧处理与关联、会话、双 CSV 编码／输出和产物模型；保留 CameraX 1.6.2、原生预览、相机互斥及有界批处理。
- 应用：`apps/native/src/app/acquisition.ts` 与 `features/acquisition/AcquisitionScreen.tsx`，沿用 Nano Stores 的低频状态模式。
- 行为测试与验收：沿用当前原生像素、关联及输出测试组织；运行实际页面和设备回调，验证参数变化、多块输出、权限／不支持路径及停止完成。不以请求值或 mock 证明硬件生效。
- 实施时更新 `docs/acquisition/android-ppg.md` 与 `docs/development/android-development.md`；本次提案阶段只创建本变更的规划产物，不修改代码或主规格。
