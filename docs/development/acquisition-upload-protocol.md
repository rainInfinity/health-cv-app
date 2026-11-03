# 采集文件上传对接草案

> 状态：供后端确认。本文将客户端当前已实现的采集文件格式与 HTTP 上传合同，与尚未确认的业务输入映射分开描述。待确认项不表示后端已支持。

## 1. 目的与范围

本文整理 Android 当前生成的采集产物及普通渠道任务文件上传接口，供前后端确认采集文件如何映射为模型输入。

当前 Android 原生模块生成 PPG CSV、相机帧元数据 CSV、传感器 CSV 和被动录像。`cloud-client` 提供单文件上传能力，但 Native 应用尚未将真实采集产物编排成完整的创建任务、上传、提交流程。本文不假定所有采集产物都应上传。

## 2. 采集文件格式

### 2.1 CSV 通用约定

Android CSV 文件使用 UTF-8 编码，第一行为表头，字段以逗号分隔，每条数据记录占一行。文件不包含 JSON 包装；上传请求发送文件字节。

所有 CSV 时间字段均为设备单调时钟，**不是 Unix 时间或 UTC 时间**。不同类型的时间字段分别表示回调接收时间、传感器事件时间或相机帧时间，不应混为同一时钟来源。

### 2.2 主动 PPG：`ppg.csv`

完整表头：

```csv
timestamp,timestampFrame,timestampSystem,avgY,avgU,avgV,frameIndex,blockIndex
```

| 字段 | 类型／单位 | 语义与约束 |
|---|---|---|
| `timestamp` | 数值，毫秒 | 开始处理该帧时读取的 `SystemClock.elapsedRealtimeNanos()`，换算为毫秒并保留小数。设备启动后的单调时间。 |
| `timestampFrame` | 数值，毫秒 | CameraX `ImageInfo.timestamp`，由纳秒换算为毫秒；用于与 `frame.csv` 精确配对。 |
| `timestampSystem` | 数值，毫秒 | 开始处理该帧时读取的 `System.nanoTime()`，换算为毫秒并保留小数；不是 Unix 时间。 |
| `avgY` | 数值，0–255 | 当前图像块有效亮度像素的 Y 平均值。 |
| `avgU` | 数值，0–255 | 与当前图像块相交的 U 色度样本平均值。 |
| `avgV` | 数值，0–255 | 与当前图像块相交的 V 色度样本平均值。 |
| `frameIndex` | 整数 | 正式采集收到的帧序号；每个 PPG 会话从 `0` 递增。同一帧各分块行的值相同。 |
| `blockIndex` | 整数 | 当前帧分块的行优先编号，从 `0` 开始。单块 `[1,1]` 布局时固定为 `0`。 |

每帧按冻结的 `[rows, columns]` 分块布局输出 `rows × columns` 行；同一帧的所有行共享三个时间字段和 `frameIndex`，并按 `blockIndex` 顺序排列。默认 `[1,1]` 时每帧一行。Y/U/V 是图像通道统计值，不是血压或其他医学结果。

### 2.3 相机元数据：`frame.csv`

完整表头：

```csv
timestamp,timestampFrame,timestampSystem,exposureTime,durationTime,rollingShutterSkewTime,iso,whiteBalanceMode
```

| 字段 | 类型／单位 | 语义与缺失值 |
|---|---|---|
| `timestamp` | 数值，毫秒 | Camera2 拍摄结果完成回调时读取的 `SystemClock.elapsedRealtimeNanos()`。 |
| `timestampFrame` | 数值，毫秒 | Camera2 `CaptureResult.SENSOR_TIMESTAMP`，与对应 PPG 帧的 `timestampFrame` 精确配对。 |
| `timestampSystem` | 数值，毫秒 | 拍摄结果完成回调时读取的 `System.nanoTime()`。 |
| `exposureTime` | 整数，纳秒 | 实际曝光时长；结果缺失时写 `0`。 |
| `durationTime` | 整数，纳秒 | 实际帧时长；结果缺失时写 `0`。 |
| `rollingShutterSkewTime` | 整数，纳秒 | 实际滚动快门时长；结果缺失时写 `0`。 |
| `iso` | 整数 | 实际 ISO；结果缺失时写 `0`。 |
| `whiteBalanceMode` | 整数 | Camera2 `CONTROL_AWB_MODE` 枚举值；结果缺失时写 `0`。 |

每个相机帧对应一条 `frame.csv` 数据行，以及一条或多条具有相同 `timestampFrame` 的 `ppg.csv` 数据行。两文件应按 `timestampFrame` 配对，不能按 CSV 行号配对。正式采集帧缺少可配对的传感器时间戳时，采集会失败，不会把缺失配对发布成成功产物。上述 `0` 缺失语义仅适用于表中明确列出的 Camera2 数值字段；不能把所有 `0` 都解释为缺失。

### 2.4 运动传感器 CSV

每种传感器独立写入一份 CSV。表头按传感器类型固定：

| 文件 | 完整表头 | 轴值单位 |
|---|---|---|
| `accelerometer.csv` | `timestamp,timestampEvent,timestampSystem,accX,accY,accZ` | `m/s2` |
| `gyroscope.csv` | `timestamp,timestampEvent,timestampSystem,gyrX,gyrY,gyrZ` | `rad/s` |
| `magnetometer.csv` | `timestamp,timestampEvent,timestampSystem,magX,magY,magZ` | `uT` |
| `gravity.csv` | `timestamp,timestampEvent,timestampSystem,graX,graY,graZ` | `m/s2` |

| 字段 | 类型／单位 | 语义与约束 |
|---|---|---|
| `timestamp` | 数值，毫秒 | 回调接受样本时读取的 `elapsedRealtimeNanos()`。 |
| `timestampEvent` | 数值，毫秒 | Android `SensorEvent.timestamp` 提供的事件时间。 |
| `timestampSystem` | 数值，毫秒 | 回调中读取的 `System.nanoTime()`。 |
| 类型专属 X/Y/Z 列 | 有限数值 | 同一回调中的三轴原始值，按 Android 自然设备坐标系输出，不随屏幕旋转重映射。 |

三个时间字段保留其各自的时钟来源；纳秒换算为毫秒时最多保留六位小数。每条传感器样本一行；文件没有独立的样本序号列。`kind`、单位、坐标系和采样间隔属于产物引用元数据，不作为这些 CSV 的额外列写入。

### 2.5 文件路径、会话与完成条件

| 产物 | 完成文件路径 | 同会话关系 |
|---|---|---|
| PPG | `filesDir/acquisition/<sessionId>/ppg.csv` | 与 `frame.csv` 共用一个 PPG `sessionId`。 |
| 相机帧元数据 | `filesDir/acquisition/<sessionId>/frame.csv` | 与 `ppg.csv` 共用一个 PPG `sessionId`。 |
| 传感器 | `filesDir/acquisition/sensors/<kind>/<sessionId>/<kind>.csv` | 按传感器类型和会话独立保存；不同传感器会话可并行。 |
| 被动录像 | `filesDir/passive-capture/<sessionId>/video.mp4` | 独立于 PPG 与传感器会话。 |

PPG 与传感器 CSV 先写入 `.part` 文件，正常停止、数据队列排空、writer 关闭成功后才提升为完成文件。被动录像须正常结束并通过媒体可读检查。未完成的 `.part` 不作为成功产物交付。

`sessionId`、PPG 分块布局与相机配置、传感器 `sampleCount`／采样间隔／坐标系等属于产物引用元数据，不在 CSV 表头中。当前单文件上传接口仅发送 `logicalName` 与文件，不会自动附带这些字段。如果后端需要会话关联或采集配置，需单独确认承载位置及格式。

被动录像是 MP4，没有 CSV 表头。当前不自动上传，也没有确认的模型输入映射。

## 3. 当前单文件上传接口

客户端配置的 `baseUrl` 是不含 `/api/v1` 的 HTTP(S) 服务根地址，客户端追加 `/api/v1/{channel}`。上传路由为：

```http
POST /api/v1/{channel}/tasks/{taskId}/files
Authorization: Bearer <Access Token>
Content-Type: multipart/form-data; boundary=<由 React Native 运行时生成>
```

每次请求包含两个 multipart 字段：

- `logicalName`：模型声明的输入逻辑名，不是文件名或扩展名。
- `file`：单个文件的二进制内容。客户端传入 React Native 文件引用 `{ uri, name, type }`；已有 URI scheme 保持不变，裸本地路径转换为 `file://`。

客户端使用 React Native `FormData`，不手写 `Content-Type`，由运行时生成 boundary；不把完整文件读为 JavaScript 字符串或 Base64。上传成功时返回 JSON 响应封套中的登记数据：

```json
{
  "fileId": 301,
  "logicalName": "ppg",
  "sizeBytes": 188,
  "uploadedAt": "2026-10-19 10:01:00",
  "isSelected": true
}
```

当前后端对接说明要求文件非空；默认上传上限为 `52,428,800` 字节（50 MiB），部署和代理限制可能不同，接口不提供上限查询。上传只允许操作本人当前渠道的 `DRAFT` 任务；逻辑名、文件或任务状态不满足约束时会返回相应业务错误。

同一 `logicalName` 再次上传成功会选择新文件记录，旧记录和文件仍保留。上传超时后重传可能新增历史记录，不能视为覆盖或幂等重放。当前没有普通用户输入文件列表接口，任务详情也不返回完整输入文件集合；客户端需自行保存上传回执，不能仅靠任务详情恢复上传历史。

## 4. 任务上传顺序

1. 查询模型目录并读取所选模型的 `requiredInputs`。
2. 创建草稿：`POST /tasks`，请求体 `{ "modelId": number }`。
3. 对模型要求的每个输入逻辑名分别调用单文件上传接口，并等待所有上传响应完成。
4. 提交草稿：`POST /tasks/{taskId}/submit`，可选携带 `clientMetadata`。
5. 查询任务详情，区分 `SUBMITTED`、`RUNNING`、`SUCCEEDED`、`FAILED` 等服务端状态。提交成功表示已接受任务，不代表推理成功。

`requiredInputs` 是输入逻辑名，不声明文件格式、大小上限或算法字段约束。当前示例模型目录返回 `requiredInputs: ["ppg"]`；这是该示例模型的逻辑名，不能据此推导所有模型都接收同一种 CSV。

`cloud-client` 的资源方法各自只发出一个后端请求，不自动建任务、遍历输入、上传后提交、轮询、刷新令牌或重试。上传进度来自 Axios 实际传输事件；`loadedBytes` 与可选 `totalBytes` 是传输进度，不是任务处理进度。上传到 100% 后仍需等待服务端响应。`signal` 取消只终止本地请求传输，不撤销已到达服务端的操作。

## 5. 当前已知映射与待确认项

| 采集产物 | 当前已知信息 | 需要后端确认 |
|---|---|---|
| 主动 `ppg.csv` | Android RN 联调曾以 `logicalName=ppg` 上传 188 字节合成 `ppg.csv`，验证了单文件传输与回执。该样例不是 Android 原生实际采集产物。 | 真实 Android `ppg.csv` 是否满足当前 PPG 模型输入契约；服务端解析器期望的表头、列类型、时间单位、行约束和拒绝条件。 |
| `frame.csv` | 与 PPG 同会话；通过 `timestampFrame` 与 PPG 帧配对。 | 是否需要上传；若需要，正式 `logicalName`、必需／可选关系，以及服务端如何校验其与 PPG 文件的配对。 |
| 传感器 CSV | 各类型有独立表头、单位和会话 ID。 | 哪些模型接收哪些类型；正式 `logicalName`、多文件组合方式及如何与 PPG 会话关联。 |
| 被动 `video.mp4` | 单独保存在应用私有目录，当前不自动上传。 | 当前是否明确不接收视频；如未来支持，需另定媒体格式、大小／时长限制、授权、保留及删除约定。 |

请后端进一步确认：

1. 当前目标模型实际要求的输入逻辑名，以及真实 PPG 产物是否通过解析和算法校验。
2. `frame.csv` 和各传感器文件是必需、可选还是不接收；若接收，明确输入名、组合规则和关联标识。
3. 服务端对 CSV 表头、时间字段、单位、精度、空值／零值和采样顺序的校验要求；是否能提供经后端验证的真实采集文件样例。
4. 当前部署的上传字节上限、允许的媒体类型及代理层限制。
5. 若服务端需要 `sessionId`、采集配置、采样间隔、坐标系或样本数，使用何种正式字段承载；客户端 `clientMetadata` 是自报快照，不证明设备身份，也不应替代输入校验。
6. 上传超时后的状态查询或幂等处理方式，以及是否计划提供输入文件列表接口。

## 6. 隐私与本地文件边界

采集产物保存在应用私有目录。当前没有自动上传完整测量会话的应用流程，也没有因上传成功自动删除本地采集文件的策略。采集完成、上传完成、云端任务成功和允许删除本地文件是不同事实。

被动视频包含前摄原始画面，当前明确不自动上传。若要纳入云端处理，需另行确认产品授权、服务端输入合同、访问控制、保留期限和删除方式后再实现。

## 7. 客户端实现参考

- [Android PPG 采集协议](../acquisition/android-ppg.md)
- [Android 传感器采集](../acquisition/android-sensors.md)
- [Android 被动采集协议](../acquisition/android-passive-capture.md)
- [普通渠道云端请求接口](./cloud-client-api.md)
