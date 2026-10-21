/** 定义传感器能力、低频状态与完成文件的内部数据结构。 */

package com.healthcvapp.acquisition.sensors.model

/** 表示标准默认传感器当前可用能力。 */
data class SensorCapabilities(
  /** 被查询的传感器类型。 */
  val kind: SensorKind,
  /** 当前设备是否提供该类型的默认设备。 */
  val available: Boolean,
  /** 默认设备名称；不可用时为空。 */
  val deviceName: String?,
  /** 设备报告的最小注册间隔，单位微秒；不可用时为空。 */
  val minSamplingPeriodMicros: Int?,
)

/** 表示单类型控制器向客户端报告的低频阶段。 */
enum class SensorPhase {
  IDLE,
  STARTING,
  CAPTURING,
  STOPPING,
  FAILED,
}

/** 描述单一类型的当前运行状态，不包含任何样本或批次。 */
data class SensorSnapshot(
  /** 当前快照所属类型。 */
  val kind: SensorKind,
  /** 当前低频采集阶段。 */
  val phase: SensorPhase,
  /** 活动或最近会话标识；尚未创建时为空。 */
  val sessionId: String?,
  /** 最近请求的微秒间隔；无会话时为空。 */
  val requestedSamplingPeriodMicros: Int?,
  /** 最近注册的微秒间隔；无会话时为空。 */
  val registeredSamplingPeriodMicros: Int?,
  /** 最近操作的稳定错误码；无错误时为空。 */
  val errorCode: String?,
  /** 最近操作的可读错误说明；无错误时为空。 */
  val errorMessage: String?,
  /** 最近一次正常完成的同类型产物。 */
  val lastArtifact: SensorArtifact?,
)

/** 引用一份已关闭并提升为完成路径的传感器 CSV。 */
data class SensorArtifact(
  /** 文件所属的默认传感器类型。 */
  val kind: SensorKind,
  /** 唯一会话标识。 */
  val sessionId: String,
  /** 应用私有持久目录中的完成文件路径。 */
  val path: String,
  /** 已关闭文件的字节数。 */
  val sizeBytes: Long,
  /** 实际成功写入的样本数量。 */
  val sampleCount: Long,
  /** 单调时钟记录的会话起始时间，单位毫秒。 */
  val startedAtMillis: Long,
  /** 单调时钟记录的会话完成时间，单位毫秒。 */
  val finishedAtMillis: Long,
  /** 调用方请求的微秒间隔。 */
  val requestedSamplingPeriodMicros: Int,
  /** 实际传给 Android 注册接口的微秒间隔。 */
  val registeredSamplingPeriodMicros: Int,
  /** 三轴样本的物理单位标识。 */
  val unit: String,
  /** 三轴值采用的坐标系标识。 */
  val coordinateSystem: String,
)
