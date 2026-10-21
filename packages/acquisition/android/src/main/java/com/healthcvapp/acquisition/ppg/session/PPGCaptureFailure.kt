/** 保留主动 PPG 会话错误码、说明和原始根因。 */

package com.healthcvapp.acquisition.ppg.session

/** 会话失败时供控制层识别的稳定错误。 */
class PPGCaptureFailure(
  /** Nitro 原生协议中的稳定错误码。 */
  val code: String,
  message: String,
  cause: Throwable? = null,
) : IllegalStateException(message, cause)
