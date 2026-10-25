/** 校验相机请求与已知能力，所有失败均发生在取得相机资源之前。 */

package com.healthcvapp.acquisition.ppg.model

/** 对完整相机请求执行纯值校验，不访问设备、互斥锁或文件系统。 */
object CameraConfigValidator {
  private const val MAX_SAFE_JS_INTEGER = 9_007_199_254_740_991L

  /** 校验配置模式、数值范围、能力状态和二维网格限制。 */
  fun validate(
    config: CameraConfig,
    capabilities: CameraCapabilities,
    captureOptions: CameraCaptureOptions?,
  ) {
    if (config.cameraId.isBlank()) invalid("必须选择当前设备枚举得到的相机标识。")
    if (capabilities.cameraId != config.cameraId) unavailable("所选相机没有匹配的能力查询结果。")

    requirePositiveInteger(config.targetResolution.width, "目标宽度", Int.MAX_VALUE.toLong())
    requirePositiveInteger(config.targetResolution.height, "目标高度", Int.MAX_VALUE.toLong())
    if (!config.targetFps.isFinite() || config.targetFps <= 0.0) {
      invalid("目标帧率必须是有限正数。")
    }

    val exposure = config.exposure
    requireMode(capabilities.exposureModes, exposure.mode.wireValue, "曝光模式")
    when (exposure.mode) {
      CameraExposureMode.AUTO -> {
        if (exposure.timeNanos != null || exposure.iso != null) {
          invalid("自动曝光不能携带手动曝光时间或 ISO。")
        }
        val compensationIndex = requireSafeInteger(
          exposure.compensationIndex,
          "自动曝光补偿索引",
          Int.MIN_VALUE.toLong(),
          Int.MAX_VALUE.toLong(),
        )
        requireRange(
          capabilities.exposureCompensationIndex,
          compensationIndex.toDouble(),
          "自动曝光补偿索引",
          requireStep = true,
        )
        if (exposure.locked) requireEnabled(capabilities.aeLock, "AE 锁定")
      }
      CameraExposureMode.MANUAL -> {
        if (exposure.compensationIndex != null) {
          invalid("手动曝光不能携带自动曝光补偿索引。")
        }
        if (exposure.locked) invalid("手动曝光不能请求 AE 锁定。")
        val exposureTimeNanos = requirePositiveSafeInteger(
          exposure.timeNanos,
          "手动曝光时间",
          MAX_SAFE_JS_INTEGER,
        )
        val iso = requirePositiveSafeInteger(exposure.iso, "手动 ISO", Int.MAX_VALUE.toLong())
        requireRange(
          capabilities.exposureTimeNanos,
          exposureTimeNanos.toDouble(),
          "手动曝光时间",
          requireStep = false,
        )
        requireRange(capabilities.iso, iso.toDouble(), "手动 ISO", requireStep = false)
      }
    }

    val whiteBalance = config.whiteBalance
    requireMode(capabilities.whiteBalanceModes, whiteBalance.mode.wireValue, "白平衡模式")
    if (whiteBalance.locked && whiteBalance.mode != CameraWhiteBalanceMode.AUTO) {
      invalid("仅自动白平衡允许请求 AWB 锁定。")
    }
    if (whiteBalance.locked) requireEnabled(capabilities.awbLock, "AWB 锁定")

    val focus = config.focus
    requireMode(capabilities.focusModes, focus.mode.wireValue, "对焦模式")
    if (focus.mode == CameraFocusMode.MANUAL) {
      val distance = focus.distanceDiopters
      if (distance == null || !distance.isFinite() || distance < 0.0) {
        invalid("手动对焦距离必须是有限非负屈光度。")
      }
      requireRange(
        capabilities.focusDistanceDiopters,
        distance,
        "手动对焦距离",
        requireStep = false,
      )
    } else if (focus.distanceDiopters != null) {
      invalid("非手动对焦模式不能携带手动距离。")
    }

    if (config.torchEnabled) requireEnabled(capabilities.torch, "补光灯")
    validateProcessing(config, captureOptions)
  }

  /** 校验分块行列对和乘积均落在当前查询的有限处理范围内。 */
  private fun validateProcessing(config: CameraConfig, options: CameraCaptureOptions?) {
    val selectedOptions = options ?: unavailable("分块限制尚未查询，不能确认当前网格可用。")
    if (selectedOptions.cameraId != config.cameraId) {
      unavailable("分块限制不属于当前所选相机。")
    }
    val limits = selectedOptions.processing
    if (limits.maxBlockCount <= 0 || limits.maxColumns <= 0 || limits.maxRows <= 0) {
      unavailable("能力查询未返回有效的本地分块限制。")
    }
    val layout = config.processing
    val blockCount = layout.rows.toLong() * layout.columns.toLong()
    if (
      blockCount > limits.maxBlockCount.toLong()
      || layout.rows > limits.maxRows
      || layout.columns > limits.maxColumns
    ) {
      invalid("分块网格超过已查询的最大块数或目标尺寸约束。")
    }
  }

  private fun requireMode(capability: CameraModeCapability, mode: String, field: String) {
    requireSupportedStatus(capability.status, field)
    val modes = capability.modes ?: unavailable("$field 的支持模式未知。")
    if (mode in modes) return
    if (mode in capability.unknownModes) unavailable("$field 请求模式的支持状态未知。")
    unsupported("设备不支持请求的$field。")
  }

  /** 要求数值能力范围已知且请求值位于设备报告范围内。 */
  private fun requireRange(
    capability: CameraNumericCapability,
    value: Double,
    field: String,
    requireStep: Boolean,
  ) {
    requireSupportedStatus(capability.status, field)
    val range = capability.range ?: unavailable("$field 的设备范围未知。")
    if (!range.minimum.isFinite() || !range.maximum.isFinite() || range.minimum > range.maximum) {
      unavailable("$field 的设备范围无效。")
    }
    if (requireStep) {
      val step = range.step ?: unavailable("$field 的设备步长未知。")
      if (step.numerator <= 0 || step.denominator <= 0) unavailable("$field 的设备步长无效。")
    }
    if (value < range.minimum || value > range.maximum) invalid("$field 超出设备报告范围。")
  }

  /** 要求显式开启的硬件或算法锁能力为已知且启用。 */
  private fun requireEnabled(capability: CameraBooleanCapability, field: String) {
    requireSupportedStatus(capability.status, field)
    val enabled = capability.value ?: unavailable("$field 的设备能力未知。")
    if (!enabled) unsupported("设备不支持$field。")
  }

  /** 将能力状态映射到稳定的设备错误分类。 */
  private fun requireSupportedStatus(status: CameraCapabilityStatus, field: String) {
    when (status) {
      CameraCapabilityStatus.SUPPORTED -> Unit
      CameraCapabilityStatus.UNSUPPORTED -> unsupported("设备不支持$field。")
      CameraCapabilityStatus.PERMISSION_REQUIRED,
      CameraCapabilityStatus.UNKNOWN -> unavailable("$field 的设备能力不可用或未知。")
    }
  }

  /** 验证有限、正整数且不超过 JS 精确整数及原生表示范围。 */
  private fun requirePositiveInteger(value: Double, field: String, maximum: Long): Long =
    requireSafeInteger(value, field, 1L, minOf(maximum, MAX_SAFE_JS_INTEGER))

  /** 验证桥接数值为 JS 可精确表达的整数。 */
  private fun requireSafeInteger(
    value: Double?,
    field: String,
    minimum: Long,
    maximum: Long,
  ): Long {
    if (
      value == null
      || !value.isFinite()
      || value % 1.0 != 0.0
      || value < minimum.toDouble()
      || value > maximum.toDouble()
    ) {
      invalid("$field 必须是范围内的 JS 安全整数。")
    }
    return value.toLong()
  }

  /** 验证桥接数值为正的 JS 安全整数。 */
  private fun requirePositiveSafeInteger(value: Double?, field: String, maximum: Long): Long =
    requireSafeInteger(value, field, 1L, minOf(maximum, MAX_SAFE_JS_INTEGER))

  /** 抛出请求形状或范围错误。 */
  private fun invalid(message: String): Nothing =
    throw CameraConfigFailure("INVALID_CAMERA_CONFIG", message)

  /** 抛出设备明确不支持错误。 */
  private fun unsupported(message: String): Nothing =
    throw CameraConfigFailure("CAMERA_PARAMETER_UNSUPPORTED", message)

  /** 抛出设备能力不足以验证错误。 */
  private fun unavailable(message: String): Nothing =
    throw CameraConfigFailure("CAMERA_CAPABILITY_UNAVAILABLE", message)
}
