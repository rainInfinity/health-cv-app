/** 血压同轮低频事实复用相机值合同，原始传感器样本不跨桥。 */
package com.healthcvapp.acquisition.ppg.bloodpressure

import com.healthcvapp.acquisition.ppg.bloodpressure.imu.ImuAdmissionSnapshot
import com.healthcvapp.acquisition.ppg.fingertip.FingertipSnapshotData
import com.healthcvapp.acquisition.sensors.model.SensorArtifact

/** 相机、ACC 文件与组内释放分别表达，不从完成列表补齐。 */
internal data class BloodPressureSnapshotData(
  /** 同轮相机、覆盖、时钟及组合终态；阶段使用血压阶段。 */
  val capture: FingertipSnapshotData,
  /** 本轮保留的 ACC 会话身份，未登记时为空。 */
  val accSessionId: String?,
  /** 当前真实 IMU 低频判定，未知字段保持空值。 */
  val imu: ImuAdmissionSnapshot,
  /** 本轮已正常定稿 ACC，准备或失败时可为空。 */
  val accArtifact: SensorArtifact?,
  /** 正式接受的实际 ACC 数量。 */
  val receivedAccCount: Long,
  /** 正式首条 ACC 原始事件时间，单位纳秒。 */
  val firstAccTimestamp: Long?,
  /** 正式末条 ACC 原始事件时间，单位纳秒。 */
  val lastAccTimestamp: Long?,
  /** 实际封闭入口时间，未正式开窗时为空。 */
  val stoppedAt: Long?,
)
