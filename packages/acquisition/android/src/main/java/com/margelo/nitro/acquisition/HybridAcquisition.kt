/** 将 Nitro 控制命令委派给应用级原生采集服务。 */

package com.margelo.nitro.acquisition

import com.margelo.nitro.NitroModules
import com.margelo.nitro.core.Promise
import com.healthcvapp.acquisition.ppg.runtime.PPGRuntime
import com.healthcvapp.acquisition.camera.model.CameraFacing as ModelCameraFacing
import com.healthcvapp.acquisition.camera.model.CameraCapabilities as ModelCameraCapabilities
import com.healthcvapp.acquisition.camera.model.CameraCapabilityStatus as ModelCameraCapabilityStatus
import com.healthcvapp.acquisition.camera.model.CameraModeCapability as ModelCameraModeCapability
import com.healthcvapp.acquisition.camera.model.CameraNumericCapability as ModelCameraNumericCapability
import com.healthcvapp.acquisition.camera.model.CameraBooleanCapability as ModelCameraBooleanCapability
import com.healthcvapp.acquisition.camera.model.CameraNumberRange as ModelCameraNumberRange
import com.healthcvapp.acquisition.camera.model.CameraRational as ModelCameraRational
import com.healthcvapp.acquisition.camera.model.CameraCaptureOption as ModelCameraCaptureOption
import com.healthcvapp.acquisition.camera.model.CameraCaptureOptionsRequest as ModelCameraCaptureOptionsRequest
import com.healthcvapp.acquisition.camera.model.CameraFpsRange as ModelCameraFpsRange
import com.healthcvapp.acquisition.camera.model.CameraResolution as ModelCameraResolution
import com.healthcvapp.acquisition.camera.model.CameraConfigFailure
import com.healthcvapp.acquisition.ppg.model.CameraProcessingLimits as ModelCameraProcessingLimits
import com.healthcvapp.acquisition.ppg.model.PPGCaptureOptions as ModelPPGCaptureOptions
import com.margelo.nitro.core.NullType
import com.margelo.nitro.acquisition.Variant_NullType_Double

/** 暴露手动相机控制、完成文件查询和低频状态监听。 */
class HybridAcquisition : HybridAcquisitionSpec() {
  /** 每个控制实例独立授权，不能停止其他页面或手动客户端持有的相机。 */
  private val ownerId = java.util.UUID.randomUUID().toString()
  private val controller = PPGRuntime.get(
    checkNotNull(NitroModules.applicationContext) { "Nitro ReactApplicationContext is unavailable" },
  )
  private val fingertipBridge = FingertipAcquisitionBridge(ownerId, controller.fingertip, controller::toNitroArtifact)

  /** 返回当前相机和会话状态，不触发设备副作用。 */
  override fun getSnapshot(): AcquisitionSnapshot = controller.getSnapshot()

  /** 返回 CameraX 可用于主动采集的相机 ID 与朝向，不打开相机或启用补光。 */
  override fun listCameras(): Promise<Array<CameraDescriptor>> = Promise.async {
    controller.listCameras().map { camera ->
      val facing = when (camera.facing) {
        ModelCameraFacing.BACK -> CameraFacing.BACK
        ModelCameraFacing.FRONT -> CameraFacing.FRONT
        ModelCameraFacing.EXTERNAL -> CameraFacing.EXTERNAL
        ModelCameraFacing.UNKNOWN -> CameraFacing.UNKNOWN
      }
      val sensorOrientation = camera.sensorOrientationDegrees
        ?.let { Variant_NullType_Double.create(it.toDouble()) }
        ?: Variant_NullType_Double.create(NullType.NULL)
      CameraDescriptor(
        cameraId = camera.cameraId,
        facing = facing,
        sensorOrientationDegrees = sensorOrientation,
      )
    }.toTypedArray()
  }

  /** 返回静态相机能力，不绑定预览或改变当前采集会话。 */
  override fun getCameraCapabilities(cameraId: String): Promise<CameraCapabilities> = Promise.async {
    controller.getCameraCapabilities(cameraId).toNitro()
  }

  /** 返回未绑定的尺寸／帧率组合查询及本地分块上限。 */
  override fun getSupportedCaptureOptions(
    cameraId: String,
    request: CameraCaptureOptionsRequest,
  ): Promise<CameraCaptureOptions> = Promise.async {
    controller.getSupportedCaptureOptions(cameraId, request.toModel()).toNitro()
  }

  /** 按完整配置请求打开所选相机；桥接形状错误在触及控制器前返回结构化失败。 */
  override fun openCamera(config: CameraConfig): Promise<AcquisitionCommandResult> {
    val openVersion = controller.beginOpen(ownerId)
    return Promise.async {
    try {
      controller.openCamera(config.toModel(), ownerId, openVersion)
    } catch (error: CameraConfigFailure) {
      AcquisitionCommandResult(
        errorCode = Variant_NullType_String.create(error.code),
        errorMessage = Variant_NullType_String.create(error.message ?: "相机配置不合法。"),
      )
    }
  }
  }

  /** 在预览就绪后创建单独的正式采集会话。 */
  override fun startCapture(): Promise<AcquisitionCommandResult> = Promise.async {
    controller.startCapture(ownerId)
  }

  /** 等待队列尾批和文件关闭后返回产物或结构化失败。 */
  override fun stopCapture(): Promise<StopCaptureResult> = Promise.async {
    controller.stopCapture(ownerId)
  }

  /** 结束采集后解绑相机并保留已完成文件。 */
  override fun closeCamera(): Promise<AcquisitionCommandResult> {
    controller.requestClose(ownerId)
    return Promise.async { controller.closeCamera(ownerId) }
  }

  /** 建立本实例指尖轮次；正式开始由原生覆盖门控驱动。 */
  override fun startFingertipCapture(config: FingertipCaptureConfig): Promise<FingertipStartResult> =
    Promise.async { fingertipBridge.start(config.durationMillis) }

  /** 读取本实例指尖事实，未知轮次保持显式空值。 */
  override fun getFingertipSnapshot(): Variant_NullType_FingertipSnapshot =
    fingertipBridge.snapshot()

  /** 同步登记指定轮次的停止意图，再异步等待完整屏障。 */
  override fun stopFingertipCapture(captureId: String): Promise<AcquisitionCommandResult> {
    fingertipBridge.requestStop(captureId)
    return Promise.async { fingertipBridge.stop(captureId) }
  }

  /** 订阅低频覆盖、阶段、正式计时与文件/资源事实。 */
  override fun addFingertipListener(listener: (snapshot: Variant_NullType_FingertipSnapshot?) -> Unit): Double =
    fingertipBridge.addListener(listener)

  /** 删除低频指尖订阅，不停止采集。 */
  override fun removeFingertipListener(listenerId: Double) = fingertipBridge.removeListener(listenerId)

  /** 订阅每批最多 64 点、每订阅四批的真实标量波形。 */
  override fun addFingertipPulseListener(listener: (batch: FingertipPulseBatch) -> Unit): Double =
    fingertipBridge.addPulseListener(listener)

  /** 删除波形订阅，不影响原始双 CSV 或原生截止。 */
  override fun removeFingertipPulseListener(listenerId: Double) = fingertipBridge.removePulseListener(listenerId)

  /** 返回本进程已正常完成的采集文件引用。 */
  override fun listArtifacts(): Promise<Array<com.margelo.nitro.acquisition.AcquisitionArtifact>> = Promise.async {
    controller.listArtifacts()
  }

  /** 注册低频状态快照回调并返回清理标识。 */
  override fun addListener(listener: (snapshot: AcquisitionSnapshot) -> Unit): Double =
    controller.addListener(listener)

  /** 删除此前注册的状态快照回调。 */
  override fun removeListener(listenerId: Double) {
    controller.removeListener(listenerId)
  }

  /** 转换原生能力快照为 Nitro 可传输的数据结构。 */
  private fun ModelCameraCapabilities.toNitro() = CameraCapabilities(
    cameraId = cameraId,
    exposureModes = exposureModes.toNitro(),
    exposureTimeNanos = exposureTimeNanos.toNitro(),
    iso = iso.toNitro(),
    exposureCompensationIndex = exposureCompensationIndex.toNitro(),
    whiteBalanceModes = whiteBalanceModes.toNitro(),
    focusModes = focusModes.toNitro(),
    focusDistanceDiopters = focusDistanceDiopters.toNitro(),
    torch = torch.toNitro(),
    aeLock = aeLock.toNitro(),
    awbLock = awbLock.toNitro(),
  )

  /** 转换模式列表并保留未知模式与查询原因。 */
  private fun ModelCameraModeCapability.toNitro() = CameraModeCapability(
    status = status.toNitro(),
    modes = modes?.let { Variant_NullType_Array_String_.create(it.toTypedArray()) }
      ?: Variant_NullType_Array_String_.create(NullType.NULL),
    unknownModes = unknownModes.toTypedArray(),
    reason = reason.toNitroNullable(),
  )

  /** 转换数值范围及可空步长，不填充未知值。 */
  private fun ModelCameraNumericCapability.toNitro() = CameraNumericCapability(
    status = status.toNitro(),
    range = range?.let { Variant_NullType_CameraNumberRange.create(it.toNitro()) }
      ?: Variant_NullType_CameraNumberRange.create(NullType.NULL),
    reason = reason.toNitroNullable(),
  )

  /** 转换布尔能力并保留 null 与 false 的区别。 */
  private fun ModelCameraBooleanCapability.toNitro() = CameraBooleanCapability(
    status = status.toNitro(),
    value = value?.let { Variant_Boolean_NullType.create(it) }
      ?: Variant_Boolean_NullType.create(NullType.NULL),
    reason = reason.toNitroNullable(),
  )

  /** 转换范围值及其 EV 有理数步长。 */
  private fun ModelCameraNumberRange.toNitro() = CameraNumberRange(
    minimum = minimum,
    maximum = maximum,
    step = step?.let { Variant_NullType_CameraRational.create(it.toNitro()) }
      ?: Variant_NullType_CameraRational.create(NullType.NULL),
  )

  /** 转换组合查询偏好并保留显式空值。 */
  private fun CameraCaptureOptionsRequest.toModel() = ModelCameraCaptureOptionsRequest(
    targetResolution = targetResolution?.asSecondOrNull()?.let {
      ModelCameraResolution(it.width, it.height)
    },
    targetFps = targetFps?.asSecondOrNull(),
  )

  /** 转换共用相机查询结果及 PPG 专属网格限制。 */
  private fun ModelPPGCaptureOptions.toNitro() = CameraCaptureOptions(
    cameraId = cameraOptions.cameraId,
    options = cameraOptions.options.map { it.toNitro() }.toTypedArray(),
    processing = processing.toNitro(),
  )

  /** 转换单个尺寸组合，不把空帧率集解释为已支持。 */
  private fun ModelCameraCaptureOption.toNitro() = CameraCaptureOption(
    resolution = resolution.toNitro(),
    fpsRanges = fpsRanges?.let { ranges ->
      Variant_NullType_Array_CameraFpsRange_.create(ranges.map { it.toNitro() }.toTypedArray())
    } ?: Variant_NullType_Array_CameraFpsRange_.create(NullType.NULL),
    compatibility = compatibility.toNitro(),
    reason = reason.toNitroNullable(),
  )

  /** 转换本地网格处理边界。 */
  private fun ModelCameraProcessingLimits.toNitro() = CameraProcessingLimits(
    maxBlockCount = maxBlockCount.toDouble(),
    maxColumns = maxColumns.toDouble(),
    maxRows = maxRows.toDouble(),
  )

  /** 转换候选像素尺寸。 */
  private fun ModelCameraResolution.toNitro() = CameraResolution(width, height)

  /** 转换设备报告的帧率区间。 */
  private fun ModelCameraFpsRange.toNitro() = CameraFpsRange(minimum, maximum)

  /** 转换有理数步长。 */
  private fun ModelCameraRational.toNitro() = CameraRational(numerator.toDouble(), denominator.toDouble())

  /** 转换原生能力判别状态。 */
  private fun ModelCameraCapabilityStatus.toNitro() = when (this) {
    ModelCameraCapabilityStatus.SUPPORTED -> CameraCapabilityStatus.SUPPORTED
    ModelCameraCapabilityStatus.UNSUPPORTED -> CameraCapabilityStatus.UNSUPPORTED
    ModelCameraCapabilityStatus.PERMISSION_REQUIRED -> CameraCapabilityStatus.PERMISSION_REQUIRED
    ModelCameraCapabilityStatus.UNKNOWN -> CameraCapabilityStatus.UNKNOWN
  }

  /** 将可选说明转换为 Nitro 的显式空值分支。 */
  private fun String?.toNitroNullable() = this?.let { Variant_NullType_String.create(it) }
    ?: Variant_NullType_String.create(NullType.NULL)
}
