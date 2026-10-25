/** 负责主动 CameraX 相机查询、精确配置绑定与串行 YUV 帧交付。 */

package com.healthcvapp.acquisition.ppg.camera

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.hardware.camera2.CameraCaptureSession
import android.hardware.camera2.CaptureRequest
import android.hardware.camera2.CaptureResult
import android.hardware.camera2.TotalCaptureResult
import android.hardware.camera2.CameraCharacteristics
import android.os.SystemClock
import android.util.Range
import android.util.Size
import android.view.Surface
import androidx.camera.camera2.interop.Camera2Interop
import androidx.camera.camera2.interop.Camera2CameraInfo
import androidx.camera.camera2.interop.Camera2CameraControl
import androidx.camera.camera2.interop.CaptureRequestOptions
import androidx.camera.core.Camera
import androidx.camera.core.CameraSelector
import androidx.camera.core.CameraState
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.ImageProxy
import androidx.camera.core.Preview
import androidx.camera.core.SessionConfig
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.core.content.ContextCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.LifecycleOwner
import androidx.lifecycle.Observer
import com.healthcvapp.acquisition.ppg.model.CameraCapabilities
import com.healthcvapp.acquisition.ppg.model.CameraCaptureOptions
import com.healthcvapp.acquisition.ppg.model.CameraCaptureOptionsRequest
import com.healthcvapp.acquisition.ppg.model.CameraDescriptor
import com.healthcvapp.acquisition.ppg.model.CameraFacing
import com.healthcvapp.acquisition.ppg.model.CameraFpsRange
import com.healthcvapp.acquisition.ppg.model.CameraProcessingLimits
import com.healthcvapp.acquisition.ppg.model.CameraResolution
import com.healthcvapp.acquisition.ppg.model.CameraConfig
import com.healthcvapp.acquisition.ppg.model.CameraBlockLayout
import com.healthcvapp.acquisition.ppg.model.CameraConfigAdjustment
import com.healthcvapp.acquisition.ppg.model.CameraConfigFailure
import com.healthcvapp.acquisition.ppg.model.CameraConfigSummary
import com.healthcvapp.acquisition.ppg.model.CameraConfigValidator
import com.healthcvapp.acquisition.ppg.model.CameraExposureMode
import com.healthcvapp.acquisition.ppg.model.CameraFocusMode
import com.healthcvapp.acquisition.ppg.model.CameraFrameCrop
import com.healthcvapp.acquisition.ppg.model.CameraFrameGeometry
import com.healthcvapp.acquisition.ppg.model.CameraWhiteBalanceMode
import com.healthcvapp.acquisition.ppg.model.CameraCapabilityStatus
import androidx.camera.core.CameraInfo
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import java.util.concurrent.ExecutionException
import java.util.concurrent.atomic.AtomicBoolean
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.withContext
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

/** 相机打开失败或设备中断时保留给控制层的稳定错误。 */
class CameraSourceException(
  val code: String,
  message: String,
  cause: Throwable? = null,
) : IllegalStateException(message, cause)

/** 返回 CameraX 真实打开后的能力与本周期冻结配置。 */
data class CameraSourceCapabilities(
  /** 当前所选相机是否具备 torch 硬件。 */
  val torchAvailable: Boolean,
  /** CameraX 为当前 Preview + YUV 用例协商出的帧率范围。 */
  val selectedFrameRateRange: Range<Int>,
  /** 本次请求、实际提交配置和后续帧测量的低频摘要。 */
  val configSummary: CameraConfigSummary,
)

/** 保存未绑定的精确相机用例计划；创建它不会占用设备。 */
private data class PreparedCameraConfiguration(
  /** 当前主动 CameraX provider。 */
  val provider: ProcessCameraProvider,
  /** 只包含被选中 cameraId 的 CameraX selector。 */
  val selector: CameraSelector,
  /** 使用已验证尺寸和帧率范围的绑定配置。 */
  val sessionConfig: SessionConfig,
  /** 组合查询得到且在打开时再次验证的帧率范围。 */
  val selectedFrameRateRange: Range<Int>,
  /** 本次预览用例。 */
  val preview: Preview,
  /** 本次 YUV 分析用例。 */
  val analysis: ImageAnalysis,
  /** 请求值、提交值及分块布局摘要。 */
  val configSummary: CameraConfigSummary,
  /** Camera2 静态传感器方向。 */
  val sensorOrientationDegrees: Int?,
)

/** 将图像分析帧、拍摄结果与设备中断交给会话协调层。 */
interface CameraSourceListener {
  /** 接收一帧仅在同步回调期间有效的 ImageProxy；调用方负责关闭。 */
  fun onImage(image: ImageProxy)
  /** 接收相机完成结果中提取的逐帧数值，不保留 Camera2 对象。 */
  fun onCaptureMetadata(metadata: CameraFrameMetadata)
  /** 收到实际分析尺寸、有效裁剪及窗口测得帧率时更新低频状态。 */
  fun onMetrics(geometry: CameraFrameGeometry, framesPerSecond: Double)
  /** 生命周期或设备错误使当前相机会话无法继续。 */
  fun onInterrupted(code: String, message: String)
}

/** 绑定所选相机、原生预览与有界 YUV 分析，不创建 JavaScript 图像数据。 */
class CameraSource(context: Context) {
  private val applicationContext = context.applicationContext
  private val analyzerExecutor: ExecutorService = Executors.newSingleThreadExecutor { runnable ->
    Thread(runnable, "AcquisitionCameraAnalyzer").apply { isDaemon = true }
  }
  private val interruptionReported = AtomicBoolean(false)
  private var provider: ProcessCameraProvider? = null
  /** 解绑时必须传入绑定相机时使用的同一个 SessionConfig 实例。 */
  private var boundSessionConfig: SessionConfig? = null
  private var analysisUseCase: ImageAnalysis? = null
  private var camera: Camera? = null
  /** 当前相机周期提交到 Camera2 的完整配置。 */
  private var activeCaptureConfig: CameraConfig? = null
  private var lifecycleOwner: LifecycleOwner? = null
  private var lifecycleObserver: LifecycleEventObserver? = null
  private var cameraStateObserver: Observer<CameraState>? = null
  @Volatile private var listener: CameraSourceListener? = null
  @Volatile private var closing = false
  private var metricsWindowStartNanos = 0L
  private var metricsFrames = 0
  private var metricsWidth = 0
  private var metricsHeight = 0
  private var lastReportedWidth = 0
  private var lastReportedHeight = 0
  /** 当前 Camera2 传感器安装方向，供实际帧摘要使用。 */
  private var sensorOrientationDegrees: Int? = null

  /** 从 CameraX 已枚举的逻辑相机读取 ID 和朝向，不绑定用例或启用补光。 */
  suspend fun listCameras(): List<CameraDescriptor> {
    val cameraProvider = try {
      ProcessCameraProvider.getInstance(applicationContext).await()
    } catch (error: Throwable) {
      throw CameraSourceException("CAMERA_ENUMERATION_FAILED", "无法枚举 CameraX 相机。", error)
    }

    return withContext(Dispatchers.Main.immediate) {
      cameraProvider.availableCameraInfos.map { cameraInfo ->
        val camera2Info = Camera2CameraInfo.from(cameraInfo)
        val facing = when (cameraInfo.lensFacing) {
          CameraSelector.LENS_FACING_BACK -> CameraFacing.BACK
          CameraSelector.LENS_FACING_FRONT -> CameraFacing.FRONT
          CameraSelector.LENS_FACING_EXTERNAL -> CameraFacing.EXTERNAL
          else -> CameraFacing.UNKNOWN
        }
        CameraDescriptor(
          cameraId = camera2Info.cameraId,
          facing = facing,
          sensorOrientationDegrees = runCatching {
            camera2Info.getCameraCharacteristic(CameraCharacteristics.SENSOR_ORIENTATION)
          }.getOrNull(),
        )
      }.sortedBy { it.cameraId }
    }
  }

  /** 查询精确逻辑相机的静态能力，不请求权限、不绑定用例或改动现有会话。 */
  suspend fun getCameraCapabilities(cameraId: String): CameraCapabilities {
    val cameraProvider = try {
      ProcessCameraProvider.getInstance(applicationContext).await()
    } catch (error: Throwable) {
      throw CameraSourceException("CAMERA_CAPABILITY_QUERY_FAILED", "无法初始化 CameraX 能力查询。", error)
    }

    return withContext(Dispatchers.Main.immediate) {
      val camera2Info = cameraProvider.availableCameraInfos.firstNotNullOfOrNull { cameraInfo ->
        Camera2CameraInfo.from(cameraInfo).takeIf { it.cameraId == cameraId }
      } ?: throw CameraSourceException("CAMERA_UNAVAILABLE", "当前设备未枚举到所选相机。")
      CameraCapabilityMapper.map(cameraId, Camera2CharacteristicsReader.read(camera2Info))
    }
  }

  /** 查询单个尺寸偏好对应的 Preview + YUV 组合，不绑定或占用相机。 */
  suspend fun getSupportedCaptureOptions(
    cameraId: String,
    request: CameraCaptureOptionsRequest,
  ): CameraCaptureOptions {
    val cameraProvider = try {
      ProcessCameraProvider.getInstance(applicationContext).await()
    } catch (error: Throwable) {
      throw CameraSourceException("CAMERA_OPTION_QUERY_FAILED", "无法初始化 CameraX 组合查询。", error)
    }

    return withContext(Dispatchers.Main.immediate) {
      val cameraInfo = cameraProvider.availableCameraInfos.firstOrNull { info ->
        Camera2CameraInfo.from(info).cameraId == cameraId
      } ?: throw CameraSourceException("CAMERA_UNAVAILABLE", "当前设备未枚举到所选相机。")

      val requestedResolution = request.targetResolution
        ?: CameraResolution(CANDIDATE_WIDTH.toDouble(), CANDIDATE_HEIGHT.toDouble())
      val width = requestedResolution.width.toPositiveInt("宽度")
      val height = requestedResolution.height.toPositiveInt("高度")
      val targetFps = request.targetFps
      if (targetFps != null && (!targetFps.isFinite() || targetFps <= 0.0)) {
        throw CameraSourceException("INVALID_CAMERA_CONFIG", "目标帧率必须是有限正数。")
      }

      val candidateResolution = CameraResolution(width.toDouble(), height.toDouble())
      val size = Size(width, height)
      val preview = Preview.Builder()
        .setTargetResolution(size)
        .setTargetRotation(Surface.ROTATION_0)
        .build()
      val analysis = ImageAnalysis.Builder()
        .setTargetResolution(size)
        .setTargetRotation(Surface.ROTATION_0)
        .setOutputImageFormat(ImageAnalysis.OUTPUT_IMAGE_FORMAT_YUV_420_888)
        .setBackpressureStrategy(ImageAnalysis.STRATEGY_BLOCK_PRODUCER)
        .build()
      val sessionConfig = SessionConfig.Builder(listOf(preview, analysis)).build()
      val supported = runCatching { cameraInfo.isSessionConfigSupported(sessionConfig) }.getOrNull()
      val fpsRanges = if (supported == true) {
        runCatching { cameraInfo.getSupportedFrameRateRanges(sessionConfig) }
          .getOrNull()
          ?.sortedWith(compareBy<Range<Int>> { it.lower }.thenBy { it.upper })
          ?.map { CameraFpsRange(it.lower.toDouble(), it.upper.toDouble()) }
      } else if (supported == false) {
        emptyList()
      } else {
        null
      }

      val candidate = CameraCaptureOptionMapper.map(
        resolution = candidateResolution,
        targetFps = targetFps,
        sessionSupported = supported,
        fpsRanges = fpsRanges,
      )
      CameraCaptureOptions(
        cameraId = cameraId,
        options = listOf(candidate),
        processing = CameraProcessingLimits(
          maxBlockCount = CameraBlockLayout.MAX_BLOCK_COUNT,
          maxColumns = minOf(width, CameraBlockLayout.MAX_BLOCK_COUNT),
          maxRows = minOf(height, CameraBlockLayout.MAX_BLOCK_COUNT),
        ),
      )
    }
  }

  /** 在不绑定设备的情况下重新验证完整配置，供控制层在申请租约前调用。 */
  suspend fun validateConfiguration(config: CameraConfig): CameraConfigSummary {
    requireCameraPermission()
    return prepareConfiguration(config, Surface.ROTATION_0, null).configSummary
  }

  /** 按精确 cameraId 绑定配置用例，且只应用调用方明确提交的参数。 */
  suspend fun open(
    config: CameraConfig,
    previewView: PreviewView,
    owner: LifecycleOwner,
    listener: CameraSourceListener,
  ): CameraSourceCapabilities {
    requireCameraPermission()
    if (owner.lifecycle.currentState == Lifecycle.State.DESTROYED) {
      throw CameraSourceException("ACTIVITY_UNAVAILABLE", "当前界面已退出，无法打开相机。")
    }

    val rotation = withContext(Dispatchers.Main.immediate) {
      previewView.display?.rotation ?: Surface.ROTATION_0
    }
    val prepared = prepareConfiguration(config, rotation, listener)
    if (owner.lifecycle.currentState == Lifecycle.State.DESTROYED) {
      throw CameraSourceException("ACTIVITY_UNAVAILABLE", "当前界面已退出，无法打开相机。")
    }

    return withContext(Dispatchers.Main.immediate) {
      closing = false
      interruptionReported.set(false)
      metricsWindowStartNanos = 0L
      metricsFrames = 0
      metricsWidth = 0
      metricsHeight = 0
      lastReportedWidth = 0
      lastReportedHeight = 0
      provider = prepared.provider
      sensorOrientationDegrees = prepared.sensorOrientationDegrees
      this@CameraSource.listener = listener
      lifecycleOwner = owner

      prepared.preview.setSurfaceProvider(previewView.surfaceProvider)
      prepared.analysis.setAnalyzer(analyzerExecutor) { image ->
        val activeListener = this@CameraSource.listener
        if (closing || activeListener == null || activeListener !== listener) {
          image.close()
        } else {
          updateMetrics(image)
          activeListener.onImage(image)
        }
      }
      analysisUseCase = prepared.analysis

      try {
        camera = prepared.provider.bindToLifecycle(owner, prepared.selector, prepared.sessionConfig)
        boundSessionConfig = prepared.sessionConfig
      } catch (error: Throwable) {
        prepared.analysis.clearAnalyzer()
        prepared.provider.unbind(prepared.sessionConfig)
        analysisUseCase = null
        this@CameraSource.listener = null
        lifecycleOwner = null
        throw CameraSourceException("CAMERA_OPEN_FAILED", "所选相机无法打开或不支持请求的用例组合。", error)
      }

      val activeCamera = checkNotNull(camera)
      val submittedConfig = prepared.configSummary.submittedConfig
      activeCaptureConfig = submittedConfig
      val torchAvailable = activeCamera.cameraInfo.hasFlashUnit()
      if (config.torchEnabled && !torchAvailable) {
        throw CameraSourceException("CAMERA_PARAMETER_UNSUPPORTED", "所选相机不具备请求的补光灯。")
      }
      if (torchAvailable) {
        try {
          activeCamera.cameraControl.enableTorch(config.torchEnabled).await()
        } catch (error: Throwable) {
          throw CameraSourceException("TORCH_APPLY_FAILED", "所选相机未能应用请求的补光灯状态。", error)
        }
      }
      if (closing || this@CameraSource.listener !== listener || this@CameraSource.camera !== activeCamera) {
        throw CameraSourceException("CAMERA_INTERRUPTED", "相机在打开期间中断。")
      }
      try {
        applyCaptureConfiguration(activeCamera, submittedConfig, aeLocked = false, awbLocked = false)
      } catch (error: CancellationException) {
        throw error
      } catch (error: Throwable) {
        throw CameraSourceException("CAMERA_CONFIGURATION_APPLY_FAILED", "CameraX 未能应用请求的相机参数。", error)
      }
      if (closing || this@CameraSource.listener !== listener || this@CameraSource.camera !== activeCamera) {
        throw CameraSourceException("CAMERA_INTERRUPTED", "应用相机参数时相机周期已结束。")
      }
      observeLifecycle(owner, activeCamera)
      CameraSourceCapabilities(
        torchAvailable = torchAvailable,
        selectedFrameRateRange = prepared.selectedFrameRateRange,
        configSummary = prepared.configSummary,
      )
    }
  }
  /** 动态更新 AE／AWB 锁请求；Future 只确认请求已应用，不代表算法已锁定。 */
  suspend fun setAlgorithmLocks(aeLocked: Boolean, awbLocked: Boolean) {
    val activeCamera = withContext(Dispatchers.Main.immediate) {
      if (closing) throw CameraSourceException("CAMERA_INTERRUPTED", "相机正在关闭。")
      camera ?: throw CameraSourceException("CAMERA_NOT_READY", "相机尚未打开，不能更改算法锁。")
    }
    try {
      val config = activeCaptureConfig
        ?: throw CameraSourceException("CAMERA_NOT_READY", "相机配置尚未完成，不能更改算法锁。")
      applyCaptureConfiguration(activeCamera, config, aeLocked, awbLocked)
    } catch (error: CancellationException) {
      throw error
    } catch (error: Throwable) {
      throw CameraSourceException("CAMERA_LOCK_APPLY_FAILED", "CameraX 未能应用 AE／AWB 锁请求。", error)
    }
    if (closing || camera !== activeCamera) {
      throw CameraSourceException("CAMERA_INTERRUPTED", "等待应用算法锁时相机周期已结束。")
    }
  }

  /** 重新读取能力与组合并构建未绑定用例计划；查询失败不会改变会话或占用。 */
  private suspend fun prepareConfiguration(
    config: CameraConfig,
    targetRotation: Int,
    listener: CameraSourceListener?,
  ): PreparedCameraConfiguration {
    val cameraProvider = try {
      ProcessCameraProvider.getInstance(applicationContext).await()
    } catch (error: Throwable) {
      throw CameraSourceException("CAMERA_PROVIDER_FAILED", "无法初始化 CameraX。", error)
    }
    val cameraInfo = withContext(Dispatchers.Main.immediate) {
      cameraProvider.availableCameraInfos.firstOrNull { info ->
        Camera2CameraInfo.from(info).cameraId == config.cameraId
      }
    } ?: throw CameraSourceException("CAMERA_UNAVAILABLE", "当前设备未枚举到请求的相机 ID。")
    val camera2Info = Camera2CameraInfo.from(cameraInfo)
    val capabilities = getCameraCapabilities(config.cameraId)
    val options = getSupportedCaptureOptions(
      config.cameraId,
      CameraCaptureOptionsRequest(config.targetResolution, config.targetFps),
    )
    CameraConfigValidator.validate(config, capabilities, options)

    val option = options.options.firstOrNull { candidate ->
      candidate.resolution.width == config.targetResolution.width
        && candidate.resolution.height == config.targetResolution.height
    } ?: throw CameraConfigFailure("CAMERA_CAPABILITY_UNAVAILABLE", "查询结果不包含请求的尺寸组合。")
    when (option.compatibility) {
      CameraCapabilityStatus.SUPPORTED -> Unit
      CameraCapabilityStatus.UNSUPPORTED ->
        throw CameraConfigFailure("CAMERA_CONFIGURATION_UNAVAILABLE", option.reason ?: "所选 Preview + YUV 组合不受支持。")
      CameraCapabilityStatus.PERMISSION_REQUIRED ->
        throw CameraConfigFailure("CAMERA_PERMISSION_DENIED", option.reason ?: "读取尺寸组合需要相机权限。")
      CameraCapabilityStatus.UNKNOWN ->
        throw CameraConfigFailure("CAMERA_CAPABILITY_UNAVAILABLE", option.reason ?: "无法确认所选尺寸组合。")
    }
    val frameRateCandidates = option.fpsRanges
      ?: throw CameraConfigFailure("CAMERA_CAPABILITY_UNAVAILABLE", "所选组合的帧率范围未知。")
    val selectedFrameRate = chooseFrameRateRange(frameRateCandidates, config.targetFps)
      ?: throw CameraConfigFailure("CAMERA_CAPABILITY_UNAVAILABLE", "所选组合没有可用的帧率范围。")
    val frameRateRange = Range(selectedFrameRate.minimum.toInt(), selectedFrameRate.maximum.toInt())

    val selectedFps = if (
      config.targetFps >= selectedFrameRate.minimum
      && config.targetFps <= selectedFrameRate.maximum
    ) {
      config.targetFps
    } else {
      selectedFrameRate.maximum
    }
    val adjustments = ArrayList<CameraConfigAdjustment>(2)
    if (option.resolution != config.targetResolution) {
      adjustments.add(
        CameraConfigAdjustment(
          field = "targetResolution",
          requestedValue = "${config.targetResolution.width}x${config.targetResolution.height}",
          submittedValue = "${option.resolution.width}x${option.resolution.height}",
          reason = option.reason ?: "当前用例选择了不同的可用像素尺寸。",
        ),
      )
    }
    if (selectedFps != config.targetFps) {
      adjustments.add(
        CameraConfigAdjustment(
          field = "targetFps",
          requestedValue = config.targetFps.toString(),
          submittedValue = "${selectedFrameRate.minimum}–${selectedFrameRate.maximum}",
          reason = "目标帧率不在组合报告的任一范围内，已选择最高可用范围；实际帧率仍以测量值为准。",
        ),
      )
    }
    val submittedConfig = config.copy(
      targetResolution = option.resolution,
      targetFps = selectedFps,
    )

    return withContext(Dispatchers.Main.immediate) {
      val width = submittedConfig.targetResolution.width.toPositiveInt("宽度")
      val height = submittedConfig.targetResolution.height.toPositiveInt("高度")
      val resolution = Size(width, height)
      val preview = Preview.Builder()
        .setTargetResolution(resolution)
        .setTargetRotation(targetRotation)
        .build()
      val analysisBuilder = ImageAnalysis.Builder()
        .setTargetResolution(resolution)
        .setTargetRotation(targetRotation)
        .setOutputImageFormat(ImageAnalysis.OUTPUT_IMAGE_FORMAT_YUV_420_888)
        .setBackpressureStrategy(ImageAnalysis.STRATEGY_BLOCK_PRODUCER)
      val extender = Camera2Interop.Extender(analysisBuilder)
      if (listener != null) {
        extender.setSessionCaptureCallback(object : CameraCaptureSession.CaptureCallback() {
          override fun onCaptureCompleted(
            session: CameraCaptureSession,
            request: CaptureRequest,
            result: TotalCaptureResult,
          ) {
            val activeListener = this@CameraSource.listener
            if (closing || activeListener == null || activeListener !== listener) return
            activeListener.onCaptureMetadata(
              CameraFrameMetadata.fromCaptureResult(
                timestampElapsedNanos = SystemClock.elapsedRealtimeNanos(),
                timestampFrameNanos = result.get(CaptureResult.SENSOR_TIMESTAMP),
                timestampSystemNanos = System.nanoTime(),
                exposureTimeNanos = result.get(CaptureResult.SENSOR_EXPOSURE_TIME),
                durationTimeNanos = result.get(CaptureResult.SENSOR_FRAME_DURATION),
                rollingShutterSkewTimeNanos = result.get(CaptureResult.SENSOR_ROLLING_SHUTTER_SKEW),
                iso = result.get(CaptureResult.SENSOR_SENSITIVITY),
                whiteBalanceMode = result.get(CaptureResult.CONTROL_AWB_MODE),
                aeLocked = result.get(CaptureResult.CONTROL_AE_LOCK),
                awbLocked = result.get(CaptureResult.CONTROL_AWB_LOCK),
              ),
            )
          }
        })
      }
      val analysis = analysisBuilder.build()
      val useCases = listOf(preview, analysis)
      val sessionConfig = SessionConfig.Builder(useCases)
        .setFrameRateRange(frameRateRange)
        .build()
      val supported = runCatching { cameraInfo.isSessionConfigSupported(sessionConfig) }.getOrNull()
      when (supported) {
        true -> Unit
        false -> throw CameraConfigFailure("CAMERA_CONFIGURATION_UNAVAILABLE", "所选 Preview + YUV 尺寸／帧率组合已不再受支持。")
        null -> throw CameraConfigFailure("CAMERA_CAPABILITY_UNAVAILABLE", "无法重新确认所选尺寸／帧率组合。")
      }
      val selector = CameraSelector.Builder()
        .addCameraFilter { infos ->
          infos.filter { Camera2CameraInfo.from(it).cameraId == config.cameraId }
        }
        .build()
      PreparedCameraConfiguration(
        provider = cameraProvider,
        selector = selector,
        sessionConfig = sessionConfig,
        preview = preview,
        selectedFrameRateRange = frameRateRange,
        analysis = analysis,
        configSummary = CameraConfigSummary(
          cameraId = config.cameraId,
          requestedConfig = config,
          submittedConfig = submittedConfig,
          adjustments = adjustments,
          actualFrame = null,
          observedFps = null,
          blockLayout = config.processing,
        ),
        sensorOrientationDegrees = runCatching {
          camera2Info.getCameraCharacteristic(CameraCharacteristics.SENSOR_ORIENTATION)
        }.getOrNull(),
      )
    }
  }

  /** 构造完整的 Camera2 请求，避免 Preview 用例覆盖分析用例的参数。 */
  private fun buildCaptureRequestOptions(
    config: CameraConfig,
    cameraInfo: CameraInfo,
    aeLocked: Boolean,
    awbLocked: Boolean,
  ): CaptureRequestOptions {
    val exposureMode = when (config.exposure.mode) {
      CameraExposureMode.AUTO -> CaptureRequest.CONTROL_AE_MODE_ON
      CameraExposureMode.MANUAL -> CaptureRequest.CONTROL_AE_MODE_OFF
    }
    val builder = CaptureRequestOptions.Builder()
      .setCaptureRequestOption(CaptureRequest.CONTROL_AE_MODE, exposureMode)
      .setCaptureRequestOption(CaptureRequest.CONTROL_AE_LOCK, aeLocked)
      .setCaptureRequestOption(
        CaptureRequest.CONTROL_AWB_MODE,
        config.whiteBalance.mode.toCaptureRequestMode(),
      )
      .setCaptureRequestOption(CaptureRequest.CONTROL_AWB_LOCK, awbLocked)
      .setCaptureRequestOption(
        CaptureRequest.CONTROL_AF_MODE,
        config.focus.mode.toCaptureRequestMode(cameraInfo),
      )

    when (config.exposure.mode) {
      CameraExposureMode.AUTO -> builder.setCaptureRequestOption(
        CaptureRequest.CONTROL_AE_EXPOSURE_COMPENSATION,
        checkNotNull(config.exposure.compensationIndex).toInt(),
      )
      CameraExposureMode.MANUAL -> {
        builder.setCaptureRequestOption(
          CaptureRequest.SENSOR_EXPOSURE_TIME,
          checkNotNull(config.exposure.timeNanos).toLong(),
        )
        builder.setCaptureRequestOption(
          CaptureRequest.SENSOR_SENSITIVITY,
          checkNotNull(config.exposure.iso).toInt(),
        )
      }
    }
    if (config.focus.mode == CameraFocusMode.MANUAL) {
      builder.setCaptureRequestOption(
        CaptureRequest.LENS_FOCUS_DISTANCE,
        checkNotNull(config.focus.distanceDiopters).toFloat(),
      )
    }
    return builder.build()
  }

  /** 将完整配置和当前锁状态提交给所有 CameraX 用例。 */
  private suspend fun applyCaptureConfiguration(
    camera: Camera,
    config: CameraConfig,
    aeLocked: Boolean,
    awbLocked: Boolean,
  ) {
    val options = buildCaptureRequestOptions(config, camera.cameraInfo, aeLocked, awbLocked)
    Camera2CameraControl.from(camera.cameraControl)
      .setCaptureRequestOptions(options)
      .await()
  }

  /** 将受支持的 AWB 语义模式映射为 Camera2 常量。 */
  private fun CameraWhiteBalanceMode.toCaptureRequestMode(): Int = when (this) {
    CameraWhiteBalanceMode.AUTO -> CaptureRequest.CONTROL_AWB_MODE_AUTO
    CameraWhiteBalanceMode.OFF -> CaptureRequest.CONTROL_AWB_MODE_OFF
    CameraWhiteBalanceMode.INCANDESCENT -> CaptureRequest.CONTROL_AWB_MODE_INCANDESCENT
    CameraWhiteBalanceMode.FLUORESCENT -> CaptureRequest.CONTROL_AWB_MODE_FLUORESCENT
    CameraWhiteBalanceMode.WARM_FLUORESCENT -> CaptureRequest.CONTROL_AWB_MODE_WARM_FLUORESCENT
    CameraWhiteBalanceMode.DAYLIGHT -> CaptureRequest.CONTROL_AWB_MODE_DAYLIGHT
    CameraWhiteBalanceMode.CLOUDY_DAYLIGHT -> CaptureRequest.CONTROL_AWB_MODE_CLOUDY_DAYLIGHT
    CameraWhiteBalanceMode.TWILIGHT -> CaptureRequest.CONTROL_AWB_MODE_TWILIGHT
    CameraWhiteBalanceMode.SHADE -> CaptureRequest.CONTROL_AWB_MODE_SHADE
  }

  /** 选择请求的 AF 控制，并在自动模式中只使用设备明确报告的常量。 */
  private fun CameraFocusMode.toCaptureRequestMode(cameraInfo: CameraInfo): Int {
    val modes = Camera2CameraInfo.from(cameraInfo)
      .getCameraCharacteristic(CameraCharacteristics.CONTROL_AF_AVAILABLE_MODES)
      ?: throw CameraConfigFailure("CAMERA_CAPABILITY_UNAVAILABLE", "设备未提供对焦模式元数据。")
    return when (this) {
      CameraFocusMode.AUTO -> when {
        CaptureRequest.CONTROL_AF_MODE_CONTINUOUS_PICTURE in modes ->
          CaptureRequest.CONTROL_AF_MODE_CONTINUOUS_PICTURE
        CaptureRequest.CONTROL_AF_MODE_AUTO in modes -> CaptureRequest.CONTROL_AF_MODE_AUTO
        CaptureRequest.CONTROL_AF_MODE_CONTINUOUS_VIDEO in modes ->
          CaptureRequest.CONTROL_AF_MODE_CONTINUOUS_VIDEO
        else -> throw CameraConfigFailure("CAMERA_PARAMETER_UNSUPPORTED", "所选相机没有可用的自动对焦模式。")
      }
      CameraFocusMode.OFF,
      CameraFocusMode.MANUAL -> {
        if (CaptureRequest.CONTROL_AF_MODE_OFF !in modes) {
          throw CameraConfigFailure("CAMERA_PARAMETER_UNSUPPORTED", "所选相机不支持关闭自动对焦。")
        }
        CaptureRequest.CONTROL_AF_MODE_OFF
      }
    }
  }

  /** 检查本次主动采集的系统权限，不在查询或打开过程中弹出授权界面。 */
  private fun requireCameraPermission() {
    if (
      ContextCompat.checkSelfPermission(applicationContext, Manifest.permission.CAMERA)
      != PackageManager.PERMISSION_GRANTED
    ) {
      throw CameraSourceException("CAMERA_PERMISSION_DENIED", "尚未授予相机权限。")
    }
  }

  /** 从单个已查询组合中选择包含目标值的最窄帧率范围，否则选择最高范围。 */
  private fun chooseFrameRateRange(
    ranges: List<CameraFpsRange>,
    targetFps: Double,
  ): CameraFpsRange? {
    val validRanges = ranges.filter { range ->
      range.minimum.isFinite()
        && range.maximum.isFinite()
        && range.minimum > 0.0
        && range.minimum <= range.maximum
        && range.maximum <= Int.MAX_VALUE.toDouble()
    }
    return validRanges.filter { targetFps in it.minimum..it.maximum }
      .minByOrNull { it.maximum - it.minimum }
      ?: validRanges.maxWithOrNull(compareBy<CameraFpsRange> { it.maximum }.thenBy { it.minimum })
  }

  /** 通过绑定时保留的 SessionConfig 解绑相机，并移除所有生命周期观察。 */
  suspend fun close() {
    withContext(Dispatchers.Main.immediate) {
      if (closing && camera == null) return@withContext
      closing = true
      val owner = lifecycleOwner
      lifecycleObserver?.let { observer -> owner?.lifecycle?.removeObserver(observer) }
      cameraStateObserver?.let { observer -> camera?.cameraInfo?.cameraState?.removeObserver(observer) }
      lifecycleObserver = null
      cameraStateObserver = null
      analysisUseCase?.clearAnalyzer()
      val sessionConfigToUnbind = boundSessionConfig
      if (sessionConfigToUnbind != null) provider?.unbind(sessionConfigToUnbind)
      boundSessionConfig = null
      camera = null
      analysisUseCase = null
      lifecycleOwner = null
      activeCaptureConfig = null
      listener = null
    }
    awaitAnalyzerIdle()
  }

  private fun observeLifecycle(owner: LifecycleOwner, camera: Camera) {
    val ownerObserver = LifecycleEventObserver { _, event ->
      if (event == Lifecycle.Event.ON_STOP) {
        reportInterruption("APP_BACKGROUND", "应用进入后台，相机已停止。")
      }
    }
    val stateObserver = Observer<CameraState> { state ->
      val cameraError = state.error ?: return@Observer
      reportInterruption("CAMERA_INTERRUPTED", cameraError.cause?.message ?: cameraError.toString())
    }
    lifecycleObserver = ownerObserver
    cameraStateObserver = stateObserver
    owner.lifecycle.addObserver(ownerObserver)
    camera.cameraInfo.cameraState.observe(owner, stateObserver)
  }

  private fun reportInterruption(code: String, message: String) {
    val interruptedListener = listener ?: return
    if (closing || !interruptionReported.compareAndSet(false, true)) return
    ContextCompat.getMainExecutor(applicationContext).execute {
      if (!closing && this@CameraSource.listener === interruptedListener) {
        interruptedListener.onInterrupted(code, message)
      }
    }
  }

  /** 等待解绑前已经排入串行分析器的旧帧结束，避免跨会话通知。 */
  private suspend fun awaitAnalyzerIdle() {
    val barrier = CompletableDeferred<Unit>()
    analyzerExecutor.execute { barrier.complete(Unit) }
    barrier.await()
  }

  private fun updateMetrics(image: ImageProxy) {
    val width = image.width
    val height = image.height
    val now = SystemClock.elapsedRealtimeNanos()
    if (width != metricsWidth || height != metricsHeight) {
      metricsWidth = width
      metricsHeight = height
      metricsWindowStartNanos = now
      metricsFrames = 0
    }
    metricsFrames += 1
    val elapsed = now - metricsWindowStartNanos
    if (lastReportedWidth != width || lastReportedHeight != height || elapsed >= METRICS_WINDOW_NANOS) {
      val fps = if (elapsed > 0L) metricsFrames * NANOS_PER_SECOND / elapsed else 0.0
      val crop = image.cropRect
      listener?.onMetrics(
        CameraFrameGeometry(
          width = width,
          height = height,
          crop = CameraFrameCrop(
            left = crop.left,
            top = crop.top,
            width = crop.width(),
            height = crop.height(),
          ),
          sensorOrientationDegrees = sensorOrientationDegrees,
          mirrored = false,
        ),
        fps,
      )
      metricsWindowStartNanos = now
      metricsFrames = 0
      lastReportedWidth = width
      lastReportedHeight = height
    }
  }

  /** 将桥接传入的像素尺寸校验为 CameraX 所需的正整数。 */
  private fun Double.toPositiveInt(field: String): Int {
    if (!isFinite() || this <= 0.0 || this % 1.0 != 0.0 || this > Int.MAX_VALUE) {
      throw CameraSourceException("INVALID_CAMERA_CONFIG", "${field}必须是正整数像素。")
    }
    return toInt()
  }


  private suspend fun <T> com.google.common.util.concurrent.ListenableFuture<T>.await(): T =
    suspendCancellableCoroutine { continuation ->
      addListener({
        try {
          continuation.resume(get())
        } catch (error: ExecutionException) {
          continuation.resumeWithException(error.cause ?: error)
        } catch (error: Throwable) {
          continuation.resumeWithException(error)
        }
      }, ContextCompat.getMainExecutor(applicationContext))
    }

  private companion object {
    const val CANDIDATE_WIDTH = 720
    const val CANDIDATE_HEIGHT = 720
    const val METRICS_WINDOW_NANOS = 1_000_000_000L
    const val NANOS_PER_SECOND = 1_000_000_000.0
  }
}
