/** 定义已原子发布的 RPPG 文件集合及其来源。 */

package com.healthcvapp.acquisition.rppg.model

/** 标识 RPPG 三件套中的文件用途。 */
internal enum class RPPGArtifactFileKind {
  /** 会话配置、来源和结束结论。 */
  SESSION_JSON,
  /** 相对会话原点的定稿脉搏波形。 */
  PULSE,
  /** 以传感器绝对纳秒时间标注的心率窗口。 */
  HEART_RATE,
}

/** 描述已关闭并发布的本地结果文件。 */
internal data class RPPGArtifactFile(
  /** 文件用途。 */
  val kind: RPPGArtifactFileKind,
  /** 应用私有目录中的文件绝对路径。 */
  val path: String,
  /** 已发布文件的字节数。 */
  val sizeBytes: Long,
)

/** 引用已完成的三件套、来源、正常结束原因与信号质量摘要。 */
internal data class RPPGArtifact(
  /** 唯一会话标识。 */
  val sessionId: String,
  /** 用于默认查询过滤的采集来源。 */
  val source: RPPGSessionSource,
  /** 正常结束原因；技术失败不会生成已发布产物。 */
  val termination: RPPGTerminationReason,
  /** 最终信号质量结论，不代表医学有效性。 */
  val signalStatus: RPPGSignalStatus,
  /** 与三件套一致的实际样本计数。 */
  val sampleCounts: RPPGSessionSampleCounts,
  /** 按元信息、脉搏和心率顺序列出的完整文件。 */
  val files: List<RPPGArtifactFile>,
)
