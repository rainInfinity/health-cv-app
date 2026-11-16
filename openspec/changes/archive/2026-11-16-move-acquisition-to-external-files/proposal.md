# Proposal

## Why

采集文件目前写入应用内部 `filesDir`，通过 ADB 提取依赖可调试构建的 `run-as`。将新产物改存应用专属外部目录 `Android/data/com.healthcvapp.mobile/files/`，便于使用 ADB 读取和拉取，不引入公共共享存储。

## What Changes

- 新 PPG、指尖、血压 PPG＋ACC、独立传感器及主动／被动 RPPG 产物统一使用 `getExternalFilesDir(null)`，保持现有子目录、文件格式、绝对路径字段和完成条件。
- 外部目录不可用时明确失败，不回退到内部目录，不新增存储权限、MediaStore、SAF 或文件分享入口。
- 不搬移、不删除内部已有文件；RPPG 继续查询内部已发布三件套，历史视频继续沿用内部目录。
- 同步采集协议、架构、ADB 操作说明、接口注释和开发页目录／隐私文案，明确卸载仍删除文件及普通应用访问受限。
- 按用户要求不新增或运行测试，不构建、不安装；仅核对改动与变更工件格式。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `native-acquisition`：新产物的应用专属外部根目录及保留语义。
- `android-rppg`：三件套的新存储目录，保留已有内部结果的查询。
- `android-sensor-acquisition`：独立和血压所用传感器产物的新存储位置。
- `android-passive-capture`：新被动 RPPG 使用外部目录，已有结果和历史视频不迁移。

## Impact

影响 `packages/acquisition` 的 Android 存储根注入与 RPPG 查询，以及 `apps/native` 的目录相关文案和 `docs` 中现行说明。无新增依赖、权限或公开接口形状变化；不修改算法、采集流程、文件 schema、归档规格或其它进行中的变更。
