/** 验证 Camera2 能力映射保留真实范围、明确不支持和未知状态。 */

package com.healthcvapp.acquisition.camera

import android.hardware.camera2.CameraCharacteristics
import android.hardware.camera2.CaptureRequest
import com.healthcvapp.acquisition.camera.model.CameraCapabilityStatus
import com.healthcvapp.acquisition.camera.model.CameraRational
import org.junit.Assert.assertEquals
import org.junit.Test

/** 覆盖相机元数据的模式、范围及权限／缺失状态映射。 */
class CameraCapabilityMapperTest {
  @Test
  fun `maps reported controls ranges and exact compensation step`() {
    val capabilities = CameraCapabilityMapper.map("camera-0", metadata())

    assertEquals(CameraCapabilityStatus.SUPPORTED, capabilities.exposureModes.status)
    assertEquals(listOf("auto", "manual"), capabilities.exposureModes.modes)
    assertEquals(emptyList<String>(), capabilities.exposureModes.unknownModes)
    assertEquals(1_000_000.0, capabilities.exposureTimeNanos.range?.minimum)
    assertEquals(1_600.0, capabilities.iso.range?.maximum)
    assertEquals(
      CameraRational(1, 3),
      capabilities.exposureCompensationIndex.range?.step,
    )
    assertEquals(listOf("auto", "daylight"), capabilities.whiteBalanceModes.modes)
    assertEquals(listOf("auto", "off", "manual"), capabilities.focusModes.modes)
    assertEquals(10.0, capabilities.focusDistanceDiopters.range?.maximum)
    assertEquals(CameraCapabilityStatus.UNSUPPORTED, capabilities.torch.status)
    assertEquals(false, capabilities.torch.value)
    assertEquals(true, capabilities.aeLock.value)
    assertEquals(CameraCapabilityStatus.UNSUPPORTED, capabilities.awbLock.status)
  }

  @Test
  fun `keeps partially known modes separate from explicit unsupported modes`() {
    val capabilities = CameraCapabilityMapper.map(
      "camera-0",
      metadata(manualSensor = CameraMetadataValue.Unknown),
    )

    assertEquals(CameraCapabilityStatus.SUPPORTED, capabilities.exposureModes.status)
    assertEquals(listOf("auto"), capabilities.exposureModes.modes)
    assertEquals(listOf("manual"), capabilities.exposureModes.unknownModes)
    assertEquals(CameraCapabilityStatus.UNKNOWN, capabilities.exposureTimeNanos.status)
  }

  @Test
  fun `maps missing and permission blocked characteristics without zero defaults`() {
    val capabilities = CameraCapabilityMapper.map(
      "camera-0",
      metadata(
        aeModes = CameraMetadataValue.Read(null),
        exposureTimeNanos = CameraMetadataValue.Read(null),
        iso = CameraMetadataValue.Unknown,
        exposureCompensationStep = CameraMetadataValue.PermissionRequired,
        awbModes = CameraMetadataValue.Unknown,
        afModes = CameraMetadataValue.PermissionRequired,
        minimumFocusDistance = CameraMetadataValue.Unknown,
        flashAvailable = CameraMetadataValue.Read(null),
      ),
    )

    assertEquals(CameraCapabilityStatus.UNKNOWN, capabilities.exposureModes.status)
    assertEquals(null, capabilities.exposureModes.modes)
    assertEquals(listOf("auto", "manual"), capabilities.exposureModes.unknownModes)
    assertEquals(CameraCapabilityStatus.UNKNOWN, capabilities.exposureTimeNanos.status)
    assertEquals(null, capabilities.exposureTimeNanos.range)
    assertEquals(CameraCapabilityStatus.UNKNOWN, capabilities.iso.status)
    assertEquals(CameraCapabilityStatus.UNKNOWN, capabilities.whiteBalanceModes.status)
    assertEquals(CameraCapabilityStatus.PERMISSION_REQUIRED, capabilities.focusModes.status)
    assertEquals(CameraCapabilityStatus.PERMISSION_REQUIRED, capabilities.focusDistanceDiopters.status)
    assertEquals(CameraCapabilityStatus.UNKNOWN, capabilities.torch.status)
    val manualControlsRequirePermission = CameraCapabilityMapper.map(
      "camera-0",
      metadata(manualSensor = CameraMetadataValue.PermissionRequired),
    )
    assertEquals(CameraCapabilityStatus.PERMISSION_REQUIRED, manualControlsRequirePermission.exposureTimeNanos.status)
    assertEquals(CameraCapabilityStatus.PERMISSION_REQUIRED, manualControlsRequirePermission.iso.status)
  }

  @Test
  fun `preserves compensation range when its EV step cannot be read`() {
    val capabilities = CameraCapabilityMapper.map(
      "camera-0",
      metadata(exposureCompensationStep = CameraMetadataValue.Unknown),
    )

    assertEquals(CameraCapabilityStatus.SUPPORTED, capabilities.exposureCompensationIndex.status)
    assertEquals(null, capabilities.exposureCompensationIndex.range?.step)
    assertEquals("无法读取曝光补偿 EV 步长。", capabilities.exposureCompensationIndex.reason)
  }

  private fun metadata(
    manualSensor: CameraMetadataValue<Boolean> = CameraMetadataValue.Read(true),
    aeModes: CameraMetadataValue<Set<Int>> = CameraMetadataValue.Read(
      setOf(CaptureRequest.CONTROL_AE_MODE_ON, CaptureRequest.CONTROL_AE_MODE_OFF),
    ),
    exposureTimeNanos: CameraMetadataValue<CameraMetadataRange<Long>> = CameraMetadataValue.Read(
      CameraMetadataRange(1_000_000L, 100_000_000L),
    ),
    iso: CameraMetadataValue<CameraMetadataRange<Int>> = CameraMetadataValue.Read(
      CameraMetadataRange(50, 1_600),
    ),
    exposureCompensation: CameraMetadataValue<CameraMetadataRange<Int>> = CameraMetadataValue.Read(
      CameraMetadataRange(-6, 6),
    ),
    exposureCompensationStep: CameraMetadataValue<CameraRational> = CameraMetadataValue.Read(
      CameraRational(1, 3),
    ),
    awbModes: CameraMetadataValue<Set<Int>> = CameraMetadataValue.Read(
      setOf(CaptureRequest.CONTROL_AWB_MODE_AUTO, CaptureRequest.CONTROL_AWB_MODE_DAYLIGHT),
    ),
    afModes: CameraMetadataValue<Set<Int>> = CameraMetadataValue.Read(
      setOf(CaptureRequest.CONTROL_AF_MODE_CONTINUOUS_PICTURE, CaptureRequest.CONTROL_AF_MODE_OFF),
    ),
    minimumFocusDistance: CameraMetadataValue<Float> = CameraMetadataValue.Read(10f),
    flashAvailable: CameraMetadataValue<Boolean> = CameraMetadataValue.Read(false),
    aeLockAvailable: CameraMetadataValue<Boolean> = CameraMetadataValue.Read(true),
    awbLockAvailable: CameraMetadataValue<Boolean> = CameraMetadataValue.Read(false),
  ) = CameraCapabilityMetadata(
    manualSensor = manualSensor,
    aeModes = aeModes,
    exposureTimeNanos = exposureTimeNanos,
    iso = iso,
    exposureCompensation = exposureCompensation,
    exposureCompensationStep = exposureCompensationStep,
    awbModes = awbModes,
    afModes = afModes,
    minimumFocusDistanceDiopters = minimumFocusDistance,
    flashAvailable = flashAvailable,
    aeLockAvailable = aeLockAvailable,
    awbLockAvailable = awbLockAvailable,
  )
}
