# Proposal

## Why

当前 PPG 会话直接位于 `acquisition/` 下，而四种传感器多套一层 `sensors/`，与 `rppg/` 的层级不一致。将新产物统一为按数据类型、再按会话组织，便于定位文件，不改变采集流程。

## What Changes

- **BREAKING**：新 PPG 产物从 `acquisition/<sessionId>/` 改为 `acquisition/ppg/<sessionId>/`，包含手动 PPG、指尖和血压使用的双 CSV 及其 `.part` 文件。
- **BREAKING**：取消新传感器产物路径中的 `sensors/`，从 `acquisition/sensors/<kind>/<sessionId>/` 改为 `acquisition/<kind>/<sessionId>/`；适用于四种独立传感器及血压 ACC。
- 保持 `acquisition/rppg/<sessionId>/`、历史视频路径、文件名、文件格式、定稿与查询行为不变。
- 保持各采集源的 sessionId 生成和隔离规则，不引入业务检测目录、共享 sessionId 或关联清单。
- 不处理已有文件，不新增迁移、旧路径兼容、扫描恢复或清理逻辑。
- 同步路径文档及已有测试中的旧路径期望；按用户要求，不新增或运行测试，不安排设备采集验收。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `native-acquisition`：明确 PPG 双 CSV 在 `acquisition/ppg/<sessionId>/` 下隔离保存。
- `android-sensor-acquisition`：明确四种传感器直接按 `acquisition/<kind>/<sessionId>/` 保存，不再经过 `sensors/`。

## Impact

- 实现集中修改 `packages/acquisition/android/src/main/java/com/healthcvapp/acquisition/storage/AcquisitionPaths.kt` 的路径构造和失效常量；现有输出器继续复用该入口。
- 完成产物中的绝对路径随之变化，不修改 TypeScript／Nitro 接口及调用方式，不引入依赖或权限。
- 同步受影响的已有路径断言，以及 `docs/acquisition/android-ppg.md`、`docs/acquisition/android-sensors.md` 和 `docs/development/android-development.md` 中的路径说明与命令示例。
