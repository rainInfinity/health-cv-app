/** 指尖控制边界的纯值合同；不依赖 Nitro 或 Android 时钟。 */
package com.healthcvapp.acquisition.ppg.fingertip

import com.healthcvapp.acquisition.ppg.model.PPGArtifact
import com.healthcvapp.acquisition.ppg.model.PPGCaptureRecord
import com.healthcvapp.acquisition.ppg.model.PPGConfigSummary
import com.healthcvapp.acquisition.ppg.session.PPGCaptureFailure
import com.healthcvapp.acquisition.ppg.session.PPGCaptureSession

/** 文件定稿与资源释放分别记录；释放失败不能吞掉已经完成的文件。 */
internal data class FingertipFinishResult(
  /** 已正常定稿的双 CSV。 */
  val artifact: PPGArtifact?,
  /** 当前文件屏障错误，不混入资源释放错误。 */
  val fileFailure: PPGCaptureFailure?,
  /** 当前相机释放错误，下一次重试独立更新。 */
  val resourceFailure: PPGCaptureFailure?,
  /** 相机和补光是否已经释放。 */
  val resourcesReleased: Boolean,
)

/** 复用现有 PPG 设备控制，不创建平行相机运行时。 */
internal interface FingertipHost {
  /** 只返回调用方持有且没有关闭意图的预览配置。 */
  fun configuration(ownerId: String): PPGConfigSummary?
  /** 完成必要锁确认和双 writer 准备，但尚不接收正式帧。 */
  suspend fun prepare(onRecord: (PPGCaptureRecord) -> Unit, onFailure: (PPGCaptureFailure) -> Unit): PPGCaptureSession
  /** 在覆盖重新确认后原子安装半开窗口。 */
  fun activate(session: PPGCaptureSession, start: Long, end: Long)
  /** 撤销未开窗准备并回到覆盖观测，不发布正式产物。 */
  suspend fun discard(session: PPGCaptureSession)
  /** 等待原始配对、队列、双 CSV 和相机关闭屏障。 */
  suspend fun finish(session: PPGCaptureSession?): FingertipFinishResult
}

/** 低频指尖事实；绝对纳秒跨桥时才转为十进制字符串。 */
internal data class FingertipSnapshotData(
  /** 产品轮次标识，观测阶段即建立。 */
  val captureId: String,
  /** 正式 PPG 文件会话标识；尚未准备时为空。 */
  val sessionId: String?,
  /** 观测、准备、正式、收尾及真实终态。 */
  val phase: String,
  /** 最新空间覆盖估计，不代表计时进度。 */
  val coverage: FingertipCoverage,
  /** 连续完整覆盖稳定且输入仍新鲜。 */
  val coverageReady: Boolean,
  /** 目标正式时长，单位毫秒。 */
  val targetDurationMillis: Long,
  /** 原生正式窗口已持续时长，单位毫秒。 */
  val elapsedMillis: Double,
  /** 目标时长减去实际经过时长，单位毫秒。 */
  val remainingMillis: Double,
  /** 正常截止或真实中断/失败原因。 */
  val endReason: String?,
  /** 技术错误或当前资源释放错误。 */
  val errorCode: String?,
  /** 可读错误信息；正常中断为空。 */
  val errorMessage: String?,
  /** 已正常定稿的文件，与资源释放状态独立。 */
  val artifact: PPGArtifact?,
  /** writer 准备并重新确认覆盖之后的正式入口下界。 */
  val windowStart: Long?,
  /** 运行中为计划上界，终态为实际封闭入口时刻，不是文件关闭时刻。 */
  val windowEnd: Long?,
  /** 精确配对且被原始队列接受的正式帧数。 */
  val receivedFrameCount: Long,
  /** 正式首帧的相机传感器时间。 */
  val firstTimestamp: Long?,
  /** 正式末帧的相机传感器时间。 */
  val lastTimestamp: Long?,
  /** 本轮冻结的相机和单块配置。 */
  val configuration: PPGConfigSummary?,
  /** 相机与补光是否真正完成释放。 */
  val resourcesReleased: Boolean,
)
