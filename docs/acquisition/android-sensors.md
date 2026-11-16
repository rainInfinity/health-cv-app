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

新文件使用应用专属外部目录 `getExternalFilesDir(null)`，直接按类型和会话隔离，不再设置 `sensors/` 中间目录；`<kind>` 为 `accelerometer`、`gyroscope`、`magnetometer` 或 `gravity`：

```text
<externalFilesDir>/acquisition/<kind>/<sessionId>/<kind>.csv.part
<externalFilesDir>/acquisition/<kind>/<sessionId>/<kind>.csv
```

`.part` 是未完成文件；只有正常停止、writer 关闭成功且至少写入一条样本后，文件才提升为 `.csv` 并返回产物引用。会话失败不会作为完成文件返回。产物记录类型、会话标识、路径、文件字节数、样本行数、起止单调毫秒、请求／注册微秒间隔、物理单位和坐标系。

完成文件保存在 `Android/data/com.healthcvapp.mobile/files/acquisition/<kind>/<sessionId>/` 中，独立传感器和血压 ACC 使用同一外部根目录；血压 ACC 位于 `acquisition/accelerometer/<accSessionId>/accelerometer.csv`，仍使用 ACC 自己的会话标识。目录不可用时明确失败，不回退内部目录；不新增存储权限，普通应用访问仍受限制，卸载应用仍会删除文件。已有内部文件不迁移、不删除。`listArtifacts()` 只返回当前进程记录的完成引用，不扫描磁盘；进程重启后查询列表重置，已完成文件仍保留。

表头与字段顺序保持既有协议；与外部后端的兼容性不在本地采集保证范围内。

## 设备能力、会话与错误边界

Android 以 `SensorManager.getDefaultSensor` 查询每种类型的默认设备；能力查询、快照读取和订阅都不会注册采样监听。开始时才在原生受控线程注册 `SensorEventListener`，注册返回 `false`、抛错或设备缺失都会失败并回收已取得的资源。JavaScript 只收到低频快照、错误和文件引用，不接收 `SensorEvent`、样本或批次。

每种 `SensorKind` 有独立且进程唯一的 `SensorController`、活动会话、`DataHub` 和 writer。同类型只允许一个所有者占用，观测、采集及未完成资源收尾都纳入互斥，重复启动返回 `SENSOR_BUSY`。其它类型可并行，独立源失败不会级联到兄弟源。唯一协调例外是用户显式发起的血压轮次：它仅能关闭自己取得的 ACC／陀螺仪，不接管已有独立会话，不影响组外类型，也不使用跨源共享文件事务。

每个原生客户端在构造时建立 owner 身份，创建、查询及订阅不注册监听。独立 `SensorClient.startCapture(config)` 为本次请求建立确切 sessionId；`stopCapture()` 外观不变，但内部等待在途启动，并将该 sessionId 与原生 owner 一起核对。原生 `startCapture(kind, samplingPeriodMicros, sessionId)`／`stopCapture(kind, sessionId)` 没有按类型无条件停止的旁路。非所有者得到 `SENSOR_NOT_OWNER`，未知轮次得到 `SENSOR_SESSION_MISMATCH`；旧轮停止只能等待旧轮自己的结果，不能注销新轮监听。应用的四类型客户端由应用层持续持有，页面解除订阅不丢失其控制身份。

正常停止等待监听注销、在途回调退出、队列尾批写入和文件关闭；正式开窗且至少有一条有效样本时才把 `.part` 提升为 `.csv` 并返回 `SensorArtifact`。无样本、数据队列溢出、注册和文件读写／收尾失败均 reject，不返回成功产物。失败事实与资源释放分别保留：文件失败不能掩盖监听注销失败，未释放的会话继续占用本类型，可按相同 owner／sessionId 再次关闭。独立入口生命周期中断或技术失败留下的 `.part` 不是完成文件；当前实现不扫描或恢复它。

宿主暂停或销毁会以 `APP_NOT_FOREGROUND` 或 `RUNTIME_DESTROYED` 中断所有活动源（含准备观测）。独立源沿用失败合同，不发布中断文件；显式血压组内源先封正式入口，再将生命周期原因通知本轮协调器，由它封全组、注销观测并定稿已接受数据，不把后台／宿主销毁伪装成文件技术失败。中断产物不代表正常采满。回到前台不自动恢复；页面切换和解除状态订阅不停止原生采集。

`SensorClient` 将原生结构化错误转换为带 `code` 和可读 `message` 的 `SensorCaptureError`。无效微秒配置会在进入 Nitro 前以 `INVALID_SENSOR_CONFIG` 拒绝；设备缺失、注册失败、同类型忙碌、后台中断和文件失败使用对应稳定码。实际调试中至少会遇到 `SENSOR_UNAVAILABLE`、`SENSOR_REGISTRATION_FAILED`、`SENSOR_BUSY`、`APP_NOT_FOREGROUND`、`SENSOR_NO_SAMPLES`、`DATAHUB_CAPACITY_EXCEEDED`、`FILE_WRITE_FAILED` 与 `FILE_FINALIZATION_FAILED`。

传感器采集本身不新增运行时权限：不需要相机、通知或外部存储权限，也不申请高采样率权限。应用现有的相机／通知／前台服务权限供 PPG、RPPG 与被动采集使用。

## 血压组内观测与共同正式窗口

血压通过同一运行时控制器的 `reserve(ownerId, sessionId, config, onSample, onFailure)` 取得 ACC／陀螺仪并注册原生观测。此时不创建正式 CSV 或保存队列；原生样本仅供有界工程判定，不向 JavaScript 推送。ACC 请求间隔为 5,000 μs，陀螺仪为 20,000 μs，注册值仍受实际设备能力约束，不承诺实际采样率、不新增高采样率权限。陀螺仪仅观测，不要求第四份完成文件；独立陀螺仪入口仍能保存原始 CSV。

ACC 的 `prepareOutput()` 仅准备本源 writer 和队列，不开放正式入口；`discardPreparedOutput()` 可以撤销未开窗准备且保留观测，之后可重新准备。`openWindow(T0, T1, isActive)` 接受同轮共同控制边界，并要求组内激活。正式记录必须同时满足回调接收 elapsed 时间及原始事件时间都在 `[T0,T1)`，不回填观测历史；封闭后到达的回调也不因事件较早而接受。独立手动采集保持自取起点和原始事件下界的既有规则。

`sealEntrance()` 封正式保存入口而不停止判定观测；截止时协调器先撤销组内激活并封各源入口，再调用 `closeObservation()`／`release(ownerId, sessionId)` 等待监听、回调、消费者和文件屏障。未开窗关闭返回空产物且撤销准备文件，不发布只有表头的伪文件。`statistics()` 返回正式接受的真实计数、首末回调 elapsed 纳秒与首末原始事件纳秒；这些事实不由请求间隔或控制边界推算。

共同窗口是原生接收窗口，不是硬件同步、收齐全部硬件事件或相机曝光与 ACC 精确对齐的承诺。原始 CSV 的三种毫秒时间、六列顺序、含重力 `m/s²`、设备自然坐标及轴值保持不变，内部滤波不得改写保存分支；共同控制时间与实际首末样本分别表达，不能用 T0／T1 覆盖事件时间。

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

“开发”→“验证入口”→“传感”分别展示四种能力、请求／注册微秒间隔、运行状态、错误和完成路径。每种类型有自己的开始／停止控件；间隔范围为 5,000–1,000,000 μs。开始按钮在同类型采集期间禁用，原生重复命令仍以 `SENSOR_BUSY` 防护。离开页面只取消 UI 订阅，不影响采集；应用进入后台会中断会话，返回后需手动重新开始。

手动操作顺序：

1. 打开传感器页面，等待设备能力查询完成；不可用类型只展示原因，不会用其它传感器补造数据。
2. 按需填写 5,000–1,000,000 μs 的整数间隔，点击该类型的“开始采集”。
3. 点击同一类型的“停止并保存”，等待页面显示会话路径、样本数和文件大小；只有正常完成的 `.csv` 才是产物。
4. 切换其它页签不会停止采集；按 Home 或让应用进入后台会中断活动会话。返回前台后确认错误状态，再由用户手动开始新会话。
5. 需要再次打开应用时，从应用专属外部目录读取已完成文件；页面中的完成列表只对当前进程有效，进程重启后不恢复列表。切换前已有的内部文件仍留在原位置。

模拟器输入、外部与已有内部文件读取及开发操作见 [Android 开发手册](../development/android-development.md)。模拟器的传感器输入不是实体运动数据；实体设备缺失类型、精度、采样频率、耗电、持续性能及厂商后台策略仍需真机验证。
