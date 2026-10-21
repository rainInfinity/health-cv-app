# Proposal

## Why

当前主动 PPG 的两个 CSV writer 重复管理文件打开和关闭，采集运行类及会话同时承担逐帧处理、状态控制和文件发布，保存路径也分散在不同能力中。需要在接入独立运动传感器前明确职责边界，复用现有可靠的有界批处理和文件能力，而不改变已有采集行为。

## What Changes

- 以 `ppg/`、`passive/` 组织独立采集能力；保留共通 `pipeline/`、`storage/` 和 `camera/ownership/`，只规划未来 `sensors/` 的接入位置，不创建空实现。
- 将主动运行控制、逐帧处理、采集会话、帧元数据关联和双文件输出分离；控制器只有一套权威运行状态。
- 提取 `AcquisitionPaths`、`AcquisitionFileStore`、泛型 `BatchWriter<T>`、`CsvBatchWriter<T>` 和 `CsvRowEncoder<T>`；PPG 与视频分别保留自己的完成产物规则。
- 用 `PPGCsvEncoder` 和 `FrameCsvEncoder` 替代重复 writer 的格式职责，双 CSV 仍由同一配对数据流顺序消费。
- 将现有 `Ppg*` 类型和对应文件统一为 `PPG*`；合并重复接口和工厂，迁移所有调用方，不保留旧别名或转发壳。
- 按确认的职责迁移 TypeScript 客户端内部位置、原生模块与测试，并同步长期文档。
- 保持 JS／Nitro 公开接口、CSV 字段与时间语义、现有保存位置、PPG 进程内查询、视频磁盘查询和资源释放行为不变。

## Capabilities

### New Capabilities

无。本变更只重整现有实现，不引入新的用户行为。

### Modified Capabilities

无。`native-acquisition` 和 `android-passive-capture` 的全部现行要求继续适用，未改变规格级行为。元数据设置 `skip_specs: true`，明确跳过增量规格，不为纯重构虚构能力要求。

## Impact

- 代码范围：`packages/acquisition/src`、Android 手写实现及原生测试；移动被动前台服务时同步更新库 Manifest 和原生引用。
- 桥接范围：手写 Hybrid 适配器更新内部委派；保持 `com.margelo.nitro.acquisition`、Nitro 对象名称、现有 Spec 与包公开导出，不手改生成物。
- 文件范围：仍使用 `filesDir/acquisition/<sessionId>/` 和 `filesDir/passive-capture/<sessionId>/`，不迁移、删除或重新解释已有文件。
- 文档范围：实施时更新 `docs/architecture/code-organization.md`、`docs/architecture/technology-stack.md`、主动／被动采集说明及受影响的开发说明；本规划阶段不修改这些文件。
- 依赖与顺序：不新增运行依赖；可独立实施和验收。`add-independent-sensor-acquisition` 依赖本变更交付的共通层与模块边界，不能反向成为本变更的完成条件。
