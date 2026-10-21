# Proposal

## Why

当前 acquisition 只有主动 PPG 与被动视频，尚无运动传感器的独立采集入口。需要参考旧 Android 项目的设备分类，提供由 JS 按需组合的独立传感器控制，同时避免旧实现向 JS 传高频批次、全量内存缓存后再生成文件的路径。

## What Changes

- 首批支持加速度计、陀螺仪、磁力计、重力传感器，对应 Android 的四种标准默认传感器；缺失类型明确报告不支持，不在应用内补造。
- 提供按类型创建的独立 JS 客户端、Nitro 控制入口、设备可用性、低频状态及完成 CSV 文件引用，不传递样本或批次。
- 在 `sensors/` 内拆分设备输入、数值模型、单源会话、CSV 编码与文件输出、运行控制；按类型拥有独立实例、队列、停止屏障和会话路径。
- 明确请求采样间隔、时间基准、单位与坐标系、正式接收窗口，以及注册失败、无样本、容量不足、文件失败和运行中断行为。
- CSV 保留旧项目各类型的轴列名称与顺序：加速度计 `accX,accY,accZ`、陀螺仪 `gyrX,gyrY,gyrZ`、磁力计 `magX,magY,magZ`、重力 `graX,graY,graZ`；前三个时间列及其语义、单位保持不变。
- 复用架构重构提供的路径管理、文件操作、泛型 CSV writer 与 DataHub，不复制其实现。
- 增加独立的传感器验证页面，允许逐类型启停及观察多源隔离，不自动组合采集。
- 保持前台采集；不新增后台传感器服务、高采样率特权、相机／通知／存储授权、上传或跨源重采样。

## Capabilities

### New Capabilities

- `android-sensor-acquisition`：四种 Android 运动／位置传感器的独立配置、采集、原生有界保存、停止完成和持久文件交付，以及 JS 编排边界。

### Modified Capabilities

无。PPG 与被动视频既有行为保持不变；新能力自身规定与其他采集源的隔离，不修改它们的现行要求。

## Impact

- 实施前置条件：`refactor-acquisition-architecture` 已完成并验收。两个规划可同时评审，实施必须先重构后新增传感器。
- 包侧：增加 `src/sensors/client.ts`、`src/native/SensorCapture.nitro.ts`、相应根导出和 Hybrid；通过 Nitrogen 生成绑定，不手工修改生成代码。
- Android：增加 `com.healthcvapp.acquisition.sensors`，使用现有 Android SensorManager、Kotlin 协程及共通存储／批处理；扩展集中路径规则，不改变 PPG 或视频路径。
- 应用侧：在现有 `apps/native/App.tsx` 验证入口增加传感器页，配套 `src/app/sensors.ts` 和 `src/features/sensors/`；不引入新路由框架或测量业务联合控制器。
- 文件与接口：定义独立传感器产物类型，CSV 保留旧项目各类型列名、顺序、时间语义和物理单位；列协议沿用不等于已验证旧云端模型或上传协议兼容。
- 实施文档：维护架构说明，新增 `docs/acquisition/android-sensors.md`，记录真实运行证据和设备缺失项；规划阶段只创建本变更材料。
