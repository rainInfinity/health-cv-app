/** 定义已原子发布的 RPPG 文件集合及其来源。 */

package com.healthcvapp.acquisition.rppg.model

/** 标识 RPPG 已发布文件集合中的文件用途。 */
internal enum class RPPGArtifactFileKind {
  /** 会话配置、来源和结束结论。 */
  SESSION_JSON,
  /** 相对会话原点的定稿脉搏波形。 */
  PULSE,
  /** 以传感器绝对纳秒时间标注的心率窗口。 */
  HEART_RATE,
  /** 以传感器绝对纳秒时间标注的逐搏初步心率。 */
  INSTANT_HEART_RATE,
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

/** 引用已完成的结果文件、来源、正常结束原因与信号质量摘要。 */
internal data class RPPGArtifact(
  /** 唯一会话标识。 */
  val sessionId: String,
  /** session.json 中的真实 UTC ISO 开始时间，仅供原生跨目录排序。 */
  val startedAt: String,
  /** 用于默认查询过滤的采集来源。 */
  val source: RPPGSessionSource,
  /** 正常结束原因；技术失败不会生成已发布产物。 */
  val termination: RPPGTerminationReason,
  /** 最终信号质量结论，不代表医学有效性。 */
  val signalStatus: RPPGSignalStatus,
  /** 与波形和频谱窗口文件一致的实际样本计数。 */
  val sampleCounts: RPPGSessionSampleCounts,
  /** 顺序为元信息、脉搏、频谱心率；v2 另含逐搏心率，v1 不补造。 */
  val files: List<RPPGArtifactFile>,
) {
  /** UTC 秒后的小数补齐九位；每份产物只计算一次，不在比较器中分配。 */
  val startedAtSortKey: String = startedAt.removeSuffix("Z").let { timestamp ->
    if ('.' in timestamp) timestamp.padEnd(29, '0') else "$timestamp.000000000"
  }
}
