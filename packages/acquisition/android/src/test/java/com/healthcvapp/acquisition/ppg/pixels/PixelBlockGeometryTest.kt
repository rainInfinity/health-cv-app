/** 验证有效裁剪区域的均匀网格、行优先归属和尺寸边界。 */

package com.healthcvapp.acquisition.ppg.pixels

import com.healthcvapp.acquisition.camera.model.CameraConfigFailure
import com.healthcvapp.acquisition.pixels.PixelCropRect
import com.healthcvapp.acquisition.pixels.PixelFrameView
import com.healthcvapp.acquisition.pixels.PixelPlane
import com.healthcvapp.acquisition.ppg.model.CameraBlockLayout
import java.nio.ByteBuffer
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

class PixelBlockGeometryTest {
  @Test
  fun `every supported grid assigns each crop pixel to exactly one nonempty block`() {
    val crop = PixelCropRect(left = 4, top = 7, right = 9, bottom = 10)
    val layouts = listOf(
      CameraBlockLayout(1, 1),
      CameraBlockLayout(3, 1),
      CameraBlockLayout(1, 5),
      CameraBlockLayout(2, 3),
    )

    for (layout in layouts) {
      val geometry = PixelBlockGeometry.create(crop, layout)
      val sampleCounts = IntArray(geometry.blockCount)
      for (y in crop.top until crop.bottom) {
        for (x in crop.left until crop.right) sampleCounts[geometry.blockIndexAt(x, y)] += 1
      }

      assertEquals((crop.right - crop.left) * (crop.bottom - crop.top), sampleCounts.sum())
      assertTrue(sampleCounts.all { it > 0 })
    }
  }

  @Test
  fun `nondivisible five by three crop distributes remainders to leading cells in row major order`() {
    val crop = PixelCropRect(left = 4, top = 7, right = 9, bottom = 10)
    val geometry = PixelBlockGeometry.create(crop, CameraBlockLayout(rows = 2, columns = 3))

    assertEquals(0, geometry.blockIndexAt(4, 7))
    assertEquals(0, geometry.blockIndexAt(5, 8))
    assertEquals(1, geometry.blockIndexAt(6, 7))
    assertEquals(2, geometry.blockIndexAt(8, 8))
    assertEquals(3, geometry.blockIndexAt(4, 9))
    assertEquals(5, geometry.blockIndexAt(8, 9))
  }

  @Test
  fun `preview rotation and mirror do not change sensor pixel block identity`() {
    val crop = PixelCropRect(left = 2, top = 3, right = 7, bottom = 8)
    val layout = CameraBlockLayout(rows = 2, columns = 3)
    val expected = blockAssignments(crop, layout)

    for (rotation in listOf(0, 90, 180, 270)) {
      for (mirrored in listOf(false, true)) {
        val frame = frame(crop, rotation, mirrored)
        assertArrayEquals(expected, blockAssignments(frame.cropRect, layout))
      }
    }
  }

  @Test
  fun `rejects grids larger than the real crop and the local block ceiling`() {
    val crop = PixelCropRect(left = 4, top = 7, right = 9, bottom = 10)

    assertThrows(IllegalArgumentException::class.java) {
      PixelBlockGeometry.create(crop, CameraBlockLayout(rows = 4, columns = 1))
    }
    assertThrows(IllegalArgumentException::class.java) {
      PixelBlockGeometry.create(crop, CameraBlockLayout(rows = 1, columns = 6))
    }
    val tooManyBlocks = assertThrows(CameraConfigFailure::class.java) {
      PixelBlockGeometry.create(crop, CameraBlockLayout(rows = 9, columns = 8))
    }
    assertEquals("INVALID_CAMERA_CONFIG", tooManyBlocks.code)
  }

  private fun blockAssignments(crop: PixelCropRect, layout: CameraBlockLayout): IntArray {
    val geometry = PixelBlockGeometry.create(crop, layout)
    val assignments = IntArray((crop.right - crop.left) * (crop.bottom - crop.top))
    var index = 0
    for (y in crop.top until crop.bottom) {
      for (x in crop.left until crop.right) assignments[index++] = geometry.blockIndexAt(x, y)
    }
    return assignments
  }

  private fun frame(crop: PixelCropRect, rotation: Int, mirrored: Boolean) = PixelFrameView(
    width = 9,
    height = 10,
    cropRect = crop,
    rotationDegrees = rotation,
    mirrored = mirrored,
    colorSpace = null,
    sessionId = "geometry-test",
    frameIndex = 0,
    timestampFrameNanos = 0,
    processingElapsedNanos = 0,
    timestampSystemNanos = 0,
    yPlane = PixelPlane(ByteBuffer.allocate(90), 0, 9, 10, 9, 1),
    uPlane = PixelPlane(ByteBuffer.allocate(25), 0, 5, 5, 5, 1),
    vPlane = PixelPlane(ByteBuffer.allocate(25), 0, 5, 5, 5, 1),
  )
}
