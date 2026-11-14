/** 定义已正常完成的主动 PPG 双 CSV 产物。 */

package com.healthcvapp.acquisition.ppg.model

/** 标识主动采集产物中的 CSV 类型。 */
enum class PPGArtifactFileKind {
  /** 八列 PPG 像素统计。 */
  PPG,
  /** Camera2 逐帧拍摄参数。 */
  FRAME,
}

/** 描述一份正常完成且已关闭的 PPG CSV 文件。 */
data class PPGArtifactFile(
  /** 文件用途。 */
  val kind: PPGArtifactFileKind,
  /** 应用私有持久目录中的已完成文件路径。 */
  val path: String,
  /** 已关闭文件的字节数。 */
  val sizeBytes: Long,
)

/** 仅在两份尾批均已消费、文件关闭并提升后返回的 PPG 产物。 */
data class PPGArtifact(
  /** 唯一采集会话标识。 */
  val sessionId: String,
  /** 按 PPG、逐帧元数据顺序列出的已完成文件。 */
  val files: List<PPGArtifactFile>,
  /** 本次会话的冻结配置、协商结果、实际帧几何与分块布局。 */
  val cameraConfigSummary: PPGConfigSummary?,
  /** 采集开始时的单调时间，单位毫秒。 */
  val startedAtMillis: Long,
  /** 文件关闭时的单调时间，单位毫秒。 */
  val finishedAtMillis: Long,
)
