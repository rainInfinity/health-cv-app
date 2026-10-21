/** 表示传感器采集路径中的稳定业务错误及原始根因。 */

package com.healthcvapp.acquisition.sensors.model

/** 保留可跨原生、Nitro 与 JS 边界传递的错误码。 */
class SensorCaptureFailure(
  /** 稳定错误码。 */
  val code: String,
  message: String,
  cause: Throwable? = null,
) : Exception(message, cause)
