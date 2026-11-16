/** 通过既有类型控制器取得血压组内观测，不注册第二个 ACC 来源。 */
package com.healthcvapp.acquisition.ppg.bloodpressure

import com.healthcvapp.acquisition.sensors.model.SensorArtifact
import com.healthcvapp.acquisition.sensors.model.SensorCaptureFailure
import com.healthcvapp.acquisition.sensors.model.SensorConfig
import com.healthcvapp.acquisition.sensors.model.SensorKind
import com.healthcvapp.acquisition.sensors.model.SensorSample
import com.healthcvapp.acquisition.sensors.runtime.SensorRuntime
import com.healthcvapp.acquisition.sensors.session.SensorCaptureSession

/** 真实运行时与确定性回归共用的确切会话授权边界。 */
internal interface BloodPressureSensors {
  /** 取得独占类型并注册观测，尚不准备正式文件。 */
  suspend fun reserve(kind: SensorKind, owner: String, id: String, intervalMicros: Int,
    onSample: (SensorSample) -> Unit, onFailure: (SensorCaptureFailure) -> Unit): SensorCaptureSession
  /** 只关闭指定所有者和指定会话，未开窗时没有正式产物。 */
  suspend fun release(kind: SensorKind, owner: String, id: String): SensorArtifact?
  /** reserve 抛出而未返回对象时仍可核查该确切占用是否释放。 */
  fun isReserved(kind: SensorKind, owner: String, id: String): Boolean
}

/** 复用四类型入口的同一控制器与互斥，不接管独立会话。 */
internal class RuntimeBloodPressureSensors(private val runtime: SensorRuntime) : BloodPressureSensors {
  override suspend fun reserve(kind: SensorKind, owner: String, id: String, intervalMicros: Int,
    onSample: (SensorSample) -> Unit, onFailure: (SensorCaptureFailure) -> Unit): SensorCaptureSession =
    runtime.controller(kind).reserve(owner, id, SensorConfig.fromRequest(kind.wireName, intervalMicros.toDouble()), onSample, onFailure)

  override suspend fun release(kind: SensorKind, owner: String, id: String): SensorArtifact? =
    runtime.controller(kind).release(owner, id)
  override fun isReserved(kind: SensorKind, owner: String, id: String): Boolean =
    runtime.controller(kind).isReserved(owner, id)
}

