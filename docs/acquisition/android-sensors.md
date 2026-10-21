# Android 传感器采集

## CSV 协议与文件路径

每种传感器独立生成一份 CSV，保持既有六列协议：前三列为时间，后三列按 Android 自然设备坐标系的 X、Y、Z 顺序输出。列名依传感器类型固定如下：

| 类型 | 完整表头 | 单位 |
| --- | --- | --- |
| `accelerometer` | `timestamp,timestampEvent,timestampSystem,accX,accY,accZ` | `m/s2` |
| `gyroscope` | `timestamp,timestampEvent,timestampSystem,gyrX,gyrY,gyrZ` | `rad/s` |
| `magnetometer` | `timestamp,timestampEvent,timestampSystem,magX,magY,magZ` | `uT` |
| `gravity` | `timestamp,timestampEvent,timestampSystem,graX,graY,graZ` | `m/s2` |

原生队列使用共同的三轴样本模型；编码时将 `x`、`y`、`z` 分别映射到表中对应类型的三列，不写入通用轴名或别名列。`android-device` 表示 Android 自然设备坐标系，轴值不随屏幕旋转重映射。

时间列均以毫秒写出，保留纳秒源值可表达的最多六位小数，不先转换为浮点数：

- `timestamp`：回调接受样本时读取的 `elapsedRealtimeNanos`。
- `timestampEvent`：Android `SensorEvent.timestamp` 提供的事件时间。
- `timestampSystem`：回调中读取的 `System.nanoTime()`。

三种时间用于保留回调接收、系统事件和进程单调时钟的区别；它们不是 Unix 时间戳。请求的采样间隔与注册到 Android 的间隔均以整数微秒表示，注册值会考虑设备报告的正 `minDelay`；该参数不代表稳定的实际采样频率。

文件使用应用私有目录并按类型和会话隔离：

```text
<filesDir>/acquisition/sensors/<kind>/<sessionId>/<kind>.csv.part
<filesDir>/acquisition/sensors/<kind>/<sessionId>/<kind>.csv
```

`.part` 是未完成文件；只有正常停止、writer 关闭成功且至少写入一条样本后，文件才提升为 `.csv` 并返回产物引用。会话失败不会作为完成文件返回。产物记录类型、会话标识、路径、文件字节数、样本行数、起止单调毫秒、请求／注册微秒间隔、物理单位和坐标系。

完成文件保存在应用私有目录中。`listArtifacts()` 只返回当前进程记录的完成引用，不扫描磁盘；进程重启后查询列表重置，已完成文件仍保留。

表头与字段顺序沿用历史约定，不代表这些 CSV 已通过旧后端兼容性验证。

## 设备能力、会话与错误边界

Android 以 `SensorManager.getDefaultSensor` 查询每种类型的默认设备；能力查询、快照读取和订阅都不会注册采样监听。开始时才在原生受控线程注册 `SensorEventListener`，注册返回 `false`、抛错或设备缺失都会失败并回收已取得的资源。JavaScript 只收到低频快照、错误和文件引用，不接收 `SensorEvent`、样本或批次。

每种 `SensorKind` 有独立的 `SensorController`、活动会话、`DataHub` 和 writer。同类型只允许一个活动会话，重复启动返回 `SENSOR_BUSY`；其它类型可并行采集，单源失败不会级联到兄弟源。宿主暂停或销毁是共同生命周期边界，会以 `APP_NOT_FOREGROUND` 或 `RUNTIME_DESTROYED` 中断所有活动源；回到前台不会自动恢复。页面切换和解除状态订阅不停止原生采集。

正常停止等待监听注销、在途回调退出、队列尾批写入和文件关闭；至少有一条有效样本时才把 `.part` 提升为 `.csv` 并返回 `SensorArtifact`。无样本、数据队列溢出、注册和文件读写／收尾失败均 reject，不返回成功产物。生命周期中断留下的 `.part` 不是完成文件；当前实现不扫描或恢复它。

`SensorClient` 将原生结构化错误转换为带 `code` 和可读 `message` 的 `SensorCaptureError`。无效微秒配置会在进入 Nitro 前以 `INVALID_SENSOR_CONFIG` 拒绝；设备缺失、注册失败、同类型忙碌、后台中断和文件失败使用对应稳定码。实际调试中至少会遇到 `SENSOR_UNAVAILABLE`、`SENSOR_REGISTRATION_FAILED`、`SENSOR_BUSY`、`APP_NOT_FOREGROUND`、`SENSOR_NO_SAMPLES`、`DATAHUB_CAPACITY_EXCEEDED`、`FILE_WRITE_FAILED` 与 `FILE_FINALIZATION_FAILED`。

传感器采集本身不新增运行时权限：不需要传感器、相机、通知或外部存储权限，也不申请高采样率权限。应用现有的相机／通知／前台服务权限仍供 PPG 与被动录像使用。

## JavaScript 客户端与页面操作

采集包根入口导出 `createSensorClient`、`SensorClient`、`SensorCaptureError` 及传感器类型。每个客户端固定一种类型；能力查询和订阅是低频控制操作，样本留在 Android：

```ts
import { createSensorClient, SensorCaptureError } from '@health-cv-app/acquisition'

const accelerometer = createSensorClient('accelerometer')
const capability = await accelerometer.getCapabilities()

if (capability.available) {
  const unsubscribe = accelerometer.subscribe((snapshot) => {
    // 只接收低频状态，不接收样本。
  })

  try {
    await accelerometer.startCapture({ samplingPeriodMicros: 20_000 })
    const artifact = await accelerometer.stopCapture()
    const artifacts = await accelerometer.listArtifacts()
  } catch (error) {
    if (error instanceof SensorCaptureError) {
      // 根据 error.code 和 error.message 呈现失败。
    }
  } finally {
    unsubscribe()
  }
}
```

应用的“传感器”页签分别展示四种能力、请求／注册微秒间隔、运行状态、错误和完成路径。每种类型有自己的开始／停止控件；间隔范围为 5,000–1,000,000 μs。开始按钮在同类型采集期间禁用，原生重复命令仍以 `SENSOR_BUSY` 防护。离开页面只取消 UI 订阅，不影响采集；应用进入后台会中断会话，返回后需手动重新开始。

手动操作顺序：

1. 打开“传感器”页签，等待设备能力查询完成；不可用类型只展示原因，不会用其它传感器补造数据。
2. 按需填写 5,000–1,000,000 μs 的整数间隔，点击该类型的“开始采集”。
3. 点击同一类型的“停止并保存”，等待页面显示会话路径、样本数和文件大小；只有正常完成的 `.csv` 才是产物。
4. 切换其它页签不会停止采集；按 Home 或让应用进入后台会中断活动会话。返回前台后确认错误状态，再由用户手动开始新会话。
5. 需要再次打开应用时，从私有目录读取已完成文件；页面中的完成列表只对当前进程有效，进程重启后不恢复列表。


`listArtifacts()` 只返回当前进程完成的引用，不扫描文件系统。进程重启后列表会重置，但已经完成的 CSV 仍保存在应用私有目录；失败或被后台中断的 `.part` 不出现在完成列表中。

## Pixel_5 AVD 实测记录（2026-10-21）

实际运行环境：`Pixel_5` AVD／`emulator-5554`，`ro.product.model=sdk_gphone16k_arm64`，Android 17／API 37／arm64；build fingerprint 为 `google/sdk_gphone16k_arm64/emu64a16k:17/CP31.260623.009/15923651:userdebug/dev-keys`。使用本变更的 Android debug development build，四种能力均显示 `Goldfish` 默认设备，设备最小间隔为 10,000 μs；请求和实际注册间隔均为 20,000 μs。回调来自 Android `SensorManager`，不是 JS 样本或 mock。

通过模拟器传感器输入设置三种非零轴值，再由系统回调进入 CSV：

```sh
adb -s emulator-5554 emu sensor set acceleration 1.25:2.5:3.75
adb -s emulator-5554 emu sensor set gyroscope 4.5:5.5:6.5
adb -s emulator-5554 emu sensor set magnetic-field 7.25:8.25:9.25
```

下表数据来自原生文件读取；每个 CSV 的数据行数与界面 `sampleCount` 一致，三种时间列均有毫秒小数，轴值出现在类型对应列：

| 类型 | 会话 | `sampleCount` | 首条样本 X、Y、Z |
| --- | --- | ---: | --- |
| `accelerometer` | `db0d1cf3-5a90-4d20-b9f5-3941b7cf603d` | 1,933 | `1.2500001, 2.5000002, 3.7500002` |
| `gyroscope` | `aa865329-837b-40a8-be2c-b60408e15927` | 1,726 | `4.5, 5.5000005, 6.5000005` |
| `magnetometer` | `a1d36c95-5183-4169-b42a-7987c09248c4` | 2,187 | `7.25, 8.25, 9.25` |
| `gravity` | `bbdd196e-6e25-411a-9ef3-42eaae596fd3` | 1,901 | `2.6209378, 5.2418747, 7.862812` |

重力记录来自 Android 默认重力传感器；模拟器输入只显式设置加速度计、陀螺仪和磁力计。模拟器的传感器输入不是实体设备运动数据，未验证实体机兼容、准确性、耗电或持续性能。

### 并行会话与主动 PPG

实际并行采集加速度计 `10970775-9650-4f2c-b2c3-776df8636cd6`（4,095 条）和陀螺仪 `0a552c3c-e04a-4e22-9b63-84632311f41b`（3,868 条）。加速度计先正常停止，页面显示完成时间约 `13,576,041 ms`；之后陀螺仪仍在采集，并写入事件时间 `13,618,393.084123 ms` 的样本，约晚 42 秒。两份 CSV 位于不同类型／会话路径，停止一源没有关闭另一源。

另一次先启动加速度计会话 `8591f117-d3f7-45c7-bb63-977d297c2300`，再打开后摄完成主动 PPG 会话 `b9507218-4842-42ce-8ff2-6581477d7a6c`。关闭相机后传感器仍显示采集中，之后单独停止并保存。传感器 CSV 为 15,000 条样本；`ppg.csv` 和 `frame.csv` 各有 459 条数据行，第二列 `timestampFrame` 逐行完全一致。PPG 采用 AVD 虚拟场景，不代表真实生理 PPG。

同一进程内先后完成的加速度计会话 `1d14b86f-bd44-44cb-9bc0-6cc5b1f6a151` 和 `9e71adae-6aa5-4996-bcb0-c848e7d2ba1c` 使用不同会话 ID 和目录，两个已完成文件同时留在页面列表。一次重复并发 start 的 Nitro smoke 返回可读错误“accelerometer 已有活动采集会话。”，既有会话继续运行并只生成一份完成文件。

### 后台中断、进程重启与被动采集回归

陀螺仪会话 `6f91158a-a609-4dc7-a976-d664f5ab9b5c` 采集时按 Home 进入后台。返回后界面显示 `APP_NOT_FOREGROUND`，不会自动重启；`dumpsys sensorservice` 不再列出应用的传感器监听，私有目录中只有该会话的 `gyroscope.csv.part`，没有 `.csv` 完成文件。随后强制结束并重启应用，已完成传感器 CSV 仍存在，新进程页面显示“尚无完成文件”。

被动服务在明确点击启用后正常进入前台等待，等待态 `Active Camera Clients` 为空。模拟器真实锁屏／唤醒／解锁后，被动页面显示会话 `427a1494-74ac-44d4-a3e8-3f706d619d5d` 正在使用前摄；此时主动 PPG 页面拒绝打开相机并提示“相机正被另一种采集会话使用。”。关闭被动服务后 `dumpsys activity services` 不再列出服务，`Active Camera Clients` 为空。该次回归未额外探测或解码新产生的视频。

该 AVD 提供全部四种默认传感器，因此没有在真实设备上观察到缺失传感器 UI；`SENSOR_UNAVAILABLE`、注册返回 `false` 和注册抛错的资源回收由 Android 适配器行为测试覆盖。实体 Android 设备及厂商后台策略仍未验证。
