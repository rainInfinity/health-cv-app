/** 将 Nitro 传感器控制请求连接到按类型隔离的原生运行时。 */

package com.margelo.nitro.acquisition

import com.healthcvapp.acquisition.sensors.model.SensorArtifact as ModelSensorArtifact
import com.healthcvapp.acquisition.sensors.model.SensorCapabilities as ModelSensorCapabilities
import com.healthcvapp.acquisition.sensors.model.SensorCaptureFailure
import com.healthcvapp.acquisition.sensors.model.SensorKind as ModelSensorKind
import com.healthcvapp.acquisition.sensors.model.SensorPhase as ModelSensorPhase
import com.healthcvapp.acquisition.sensors.model.SensorSnapshot as ModelSensorSnapshot
import com.healthcvapp.acquisition.sensors.runtime.SensorRuntime
import com.margelo.nitro.NitroModules
import com.margelo.nitro.core.NullType
import com.margelo.nitro.core.Promise
import java.util.concurrent.CancellationException

/** 提供能力查询、逐类型控制、低频状态订阅和本进程完成文件引用。 */
class HybridSensorCapture : HybridSensorCaptureSpec() {
  private val runtime = SensorRuntime.get(
    checkNotNull(NitroModules.applicationContext) { "Nitro ReactApplicationContext is unavailable" },
  )

  /** 查询对应类型的默认设备能力，不启动采样。 */
  override fun getCapabilities(kind: String): Promise<SensorCapabilities> = Promise.async {
    runtime.controller(kind).getCapabilities().toNitro()
  }

  /** 返回对应类型权威低频状态，不触发设备副作用。 */
  override fun getSnapshot(kind: String): SensorSnapshot =
    runtime.controller(kind).getSnapshot().toNitro()

  /** 启动单一传感器会话，并以结构化结果报告失败。 */
  override fun startCapture(
    kind: String,
    samplingPeriodMicros: Double,
  ): Promise<SensorCaptureCommandResult> = Promise.async {
    try {
      runtime.controller(kind).startCapture(samplingPeriodMicros)
      commandResult()
    } catch (error: CancellationException) {
      throw error
    } catch (error: Throwable) {
      val (code, message) = commandFailure(error)
      commandResult(code, message)
    }
  }

  /** 停止调用时绑定的会话并等待文件关闭或结构化失败。 */
  override fun stopCapture(kind: String): Promise<SensorStopCaptureResult> = Promise.async {
    try {
      stopResult(artifact = runtime.controller(kind).stopCapture())
    } catch (error: CancellationException) {
      throw error
    } catch (error: Throwable) {
      val (code, message) = commandFailure(error)
      stopResult(errorCode = code, errorMessage = message)
    }
  }

  /** 返回本进程已完成的对应类型文件，不扫描磁盘。 */
  override fun listArtifacts(kind: String): Promise<Array<SensorArtifact>> = Promise.async {
    runtime.controller(kind).listArtifacts().map { it.toNitro() }.toTypedArray()
  }

  /** 注册对应类型的低频状态订阅。 */
  override fun addListener(kind: String, listener: (SensorSnapshot) -> Unit): Double =
    runtime.controller(kind).addListener { listener(it.toNitro()) }

  /** 解除对应类型的单个状态订阅，不影响采集。 */
  override fun removeListener(kind: String, listenerId: Double) {
    runtime.controller(kind).removeListener(listenerId)
  }

  /** 将内部错误转换为稳定码和可读说明。 */
  private fun commandFailure(error: Throwable): Pair<String, String> = when (error) {
    is SensorCaptureFailure -> error.code to (error.message ?: "传感器操作失败。")
    else -> "SENSOR_CAPTURE_FAILED" to (error.message ?: "传感器操作失败。")
  }

  /** 创建成功或失败的启动命令结果。 */
  private fun commandResult(
    errorCode: String? = null,
    errorMessage: String? = null,
  ) = SensorCaptureCommandResult(
    errorCode = errorCode.toNitroNullable(),
    errorMessage = errorMessage.toNitroNullable(),
  )

  /** 创建成功或失败的停止命令结果。 */
  private fun stopResult(
    artifact: ModelSensorArtifact? = null,
    errorCode: String? = null,
    errorMessage: String? = null,
  ) = SensorStopCaptureResult(
    artifact = artifact.toNitroNullable(),
    errorCode = errorCode.toNitroNullable(),
    errorMessage = errorMessage.toNitroNullable(),
  )

  /** 转换低频状态字段，并保留所有空值语义。 */
  private fun ModelSensorSnapshot.toNitro() = SensorSnapshot(
    kind = kind.toNitro(),
    phase = phase.toNitro(),
    sessionId = sessionId.toNitroNullable(),
    requestedSamplingPeriodMicros = requestedSamplingPeriodMicros.toNitroNullable(),
    registeredSamplingPeriodMicros = registeredSamplingPeriodMicros.toNitroNullable(),
    errorCode = errorCode.toNitroNullable(),
    errorMessage = errorMessage.toNitroNullable(),
    lastArtifact = lastArtifact.toNitroNullable(),
  )

  /** 转换设备能力及可空数值字段。 */
  private fun ModelSensorCapabilities.toNitro() = SensorCapabilities(
    kind = kind.toNitro(),
    available = available,
    deviceName = deviceName.toNitroNullable(),
    minSamplingPeriodMicros = minSamplingPeriodMicros.toNitroNullable(),
  )

  /** 转换完整的已完成文件引用。 */
  private fun ModelSensorArtifact.toNitro() = SensorArtifact(
    kind = kind.toNitro(),
    sessionId = sessionId,
    path = path,
    sizeBytes = sizeBytes.toDouble(),
    sampleCount = sampleCount.toDouble(),
    startedAtMillis = startedAtMillis.toDouble(),
    finishedAtMillis = finishedAtMillis.toDouble(),
    requestedSamplingPeriodMicros = requestedSamplingPeriodMicros.toDouble(),
    registeredSamplingPeriodMicros = registeredSamplingPeriodMicros.toDouble(),
    unit = unit,
    coordinateSystem = coordinateSystem,
  )

  /** 映射内部传感器标识到 Nitro 公共枚举。 */
  private fun ModelSensorKind.toNitro(): com.margelo.nitro.acquisition.SensorKind = when (this) {
    ModelSensorKind.ACCELEROMETER -> com.margelo.nitro.acquisition.SensorKind.ACCELEROMETER
    ModelSensorKind.GYROSCOPE -> com.margelo.nitro.acquisition.SensorKind.GYROSCOPE
    ModelSensorKind.MAGNETOMETER -> com.margelo.nitro.acquisition.SensorKind.MAGNETOMETER
    ModelSensorKind.GRAVITY -> com.margelo.nitro.acquisition.SensorKind.GRAVITY
  }

  /** 映射内部运行阶段到 Nitro 公共枚举。 */
  private fun ModelSensorPhase.toNitro(): SensorCapturePhase = when (this) {
    ModelSensorPhase.IDLE -> SensorCapturePhase.IDLE
    ModelSensorPhase.STARTING -> SensorCapturePhase.STARTING
    ModelSensorPhase.CAPTURING -> SensorCapturePhase.CAPTURING
    ModelSensorPhase.STOPPING -> SensorCapturePhase.STOPPING
    ModelSensorPhase.FAILED -> SensorCapturePhase.FAILED
  }

  /** 把可空字符串转换为 Nitro 的显式 null 联合。 */
  private fun String?.toNitroNullable(): Variant_NullType_String =
    if (this == null) Variant_NullType_String.create(NullType.NULL)
    else Variant_NullType_String.create(this)

  /** 把可空微秒整数转换为 Nitro number 的显式 null 联合。 */
  private fun Int?.toNitroNullable(): Variant_NullType_Double =
    if (this == null) Variant_NullType_Double.create(NullType.NULL)
    else Variant_NullType_Double.create(toDouble())

  /** 把可空产物转换为 Nitro 的显式 null 联合。 */
  private fun ModelSensorArtifact?.toNitroNullable(): Variant_NullType_SensorArtifact =
    if (this == null) Variant_NullType_SensorArtifact.create(NullType.NULL)
    else Variant_NullType_SensorArtifact.create(toNitro())
}
