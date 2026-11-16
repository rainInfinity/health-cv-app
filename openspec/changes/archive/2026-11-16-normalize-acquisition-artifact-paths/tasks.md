# Tasks

本次仅调整新产物路径，不处理已有文件，不改变 sessionId、文件协议、采集或定稿行为。按用户要求，不新增或运行测试，不安排设备采集验收；以下完成判据为代码与文档静态核对。

## 1. 统一数据类型与会话目录

- [x] 1.1 修改 `AcquisitionPaths.kt`：PPG 使用 `acquisition/ppg/<sessionId>/`，四种传感器使用 `acquisition/<kind>/<sessionId>/`，移除失效的 `SENSOR_DIRECTORY` 常量；核对临时与完成路径均由新会话目录派生，RPPG、历史视频路径及会话标识规则不变。
- [x] 1.2 同步 `AcquisitionPathsTest.kt` 及已有 PPG、传感器测试中受影响的硬编码路径；静态核对正向路径期望与失败文件检查均指向新布局，不新增或运行测试。
- [x] 1.3 更新 `docs/acquisition/android-ppg.md`、`docs/acquisition/android-sensors.md`、`docs/development/android-development.md` 中的当前产物路径与 ADB 示例；核对 PPG 增加 `ppg/`、四种传感器去掉 `sensors/`，且文档不引入迁移、兼容或新验收要求。
