/** 在主动与被动快照中统一保留逐搏采集时间和显式空值。 */
package com.margelo.nitro.acquisition

import com.healthcvapp.acquisition.rppg.model.RPPGInstantHeartRate as ModelRPPGInstantHeartRate
import com.margelo.nitro.core.NullType

/** 只转换已确认逐搏结果，不制造默认或历史读数。 */
internal object RPPGInstantHeartRateNitroMapper {
  /** 纳秒跨桥使用十进制字符串，避免 JavaScript 大整数精度损失。 */
  fun toNitro(value: ModelRPPGInstantHeartRate?): Variant_NullType_RPPGInstantHeartRate =
    if (value == null) {
      Variant_NullType_RPPGInstantHeartRate.create(NullType.NULL)
    } else {
      Variant_NullType_RPPGInstantHeartRate.create(
        RPPGInstantHeartRate(
          segmentIndex = value.segmentIndex.toDouble(),
          previousPeakTimestampNanos = value.previousPeakTimestampNanos.toString(),
          peakTimestampNanos = value.peakTimestampNanos.toString(),
          intervalNanos = value.intervalNanos.toString(),
          heartRateBpm = value.heartRateBpm,
        ),
      )
    }
}
