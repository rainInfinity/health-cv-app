/** 验证主动帧处理的同步借用、会话归属和 ImageProxy 回收。 */

package com.healthcvapp.acquisition.ppg.processing

import android.graphics.ImageFormat
import android.graphics.Rect
import androidx.camera.core.ImageInfo
import androidx.camera.core.ImageProxy
import com.healthcvapp.acquisition.ppg.camera.CameraFrameMetadata
import com.healthcvapp.acquisition.ppg.model.PPGArtifactFileKind
import com.healthcvapp.acquisition.ppg.pixels.PixelReader
import com.healthcvapp.acquisition.ppg.session.PPGCaptureSession
import java.lang.reflect.InvocationHandler
import java.lang.reflect.Method
import java.lang.reflect.Proxy
import java.nio.ByteBuffer
import java.nio.file.Files
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

class PPGFrameHandlerTest {
  @Test
  fun successfulFormalFrameWritesOnePairedRecordAndExpiresBorrowedPixels() = runTest {
    withRoot { root ->
      val retainedReaders = mutableListOf<PixelReader>()
      val handler = frameHandler(
        processors = listOf(PixelProcessor { frame, _ -> retainedReaders += PixelReader(frame) }),
      )
      val session = session(root, "frame-success")
      session.start(startedAtElapsedNanos = 0, startedAtMillis = 10)
      val image = TestImageProxy(timestampNanos = 1_234_567_000L)

      handler.handle(image.proxy, "camera-one", session)
      session.offerCaptureMetadata(metadata(1_234_567_000L))
      val artifact = session.stop(finishedAtMillis = 20)

      assertEquals(1, image.closeCount)
      assertThrows(IllegalStateException::class.java) { retainedReaders.single().readY(0, 0) }
      val ppgFile = artifact.files.single { it.kind == PPGArtifactFileKind.PPG }
      val frameFile = artifact.files.single { it.kind == PPGArtifactFileKind.FRAME }
      assertEquals(2, java.io.File(ppgFile.path).readLines().size)
      assertEquals(2, java.io.File(frameFile.path).readLines().size)
      assertEquals("1234.567", java.io.File(ppgFile.path).readLines()[1].split(',')[1])
      assertEquals("1234.567", java.io.File(frameFile.path).readLines()[1].split(',')[1])
    }
  }

  @Test
  fun processingFailureReleasesOnceExpiresBorrowAndPreventsPublication() = runTest {
    withRoot { root ->
      val failure = IllegalStateException("processor failed")
      var retainedReader: PixelReader? = null
      val handler = frameHandler(
        processors = listOf(PixelProcessor { frame, _ ->
          retainedReader = PixelReader(frame)
          throw failure
        }),
      )
      val session = session(root, "frame-failure")
      session.start(startedAtElapsedNanos = 0, startedAtMillis = 10)
      val image = TestImageProxy(timestampNanos = 2_000_000L)

      handler.handle(image.proxy, "camera-one", session)
      val result = runCatching { session.stop(finishedAtMillis = 20) }

      assertTrue(result.isFailure)
      assertEquals("PIXEL_PROCESSING_FAILED", session.terminalFailure?.code)
      assertEquals(failure, session.terminalFailure?.cause)
      assertEquals(1, image.closeCount)
      assertThrows(IllegalStateException::class.java) { retainedReader!!.readY(0, 0) }
      assertFalse(root.resolve("acquisition/frame-failure/ppg.csv").exists())
      assertFalse(root.resolve("acquisition/frame-failure/frame.csv").exists())
    }
  }

  @Test
  fun oldSessionAndPreviewCallbacksDoNotWriteIntoNewFormalSession() = runTest {
    withRoot { root ->
      val handler = frameHandler()
      val oldSession = session(root, "old-callback")
      oldSession.start(startedAtElapsedNanos = 0, startedAtMillis = 10)
      val oldImage = TestImageProxy(timestampNanos = 3_000_000L)
      handler.handle(oldImage.proxy, "camera-one", oldSession)
      oldSession.offerCaptureMetadata(metadata(3_000_000L))
      oldSession.stop(finishedAtMillis = 20)

      val activeSession = session(root, "new-callback")
      activeSession.start(startedAtElapsedNanos = 0, startedAtMillis = 30)
      val lateOldImage = TestImageProxy(timestampNanos = 4_000_000L)
      handler.handle(lateOldImage.proxy, "camera-one", oldSession)
      val previewImage = TestImageProxy(timestampNanos = 5_000_000L)
      handler.handle(previewImage.proxy, "camera-one", null)
      val activeArtifact = activeSession.stop(finishedAtMillis = 40)

      assertEquals(1, oldImage.closeCount)
      assertEquals(1, lateOldImage.closeCount)
      assertEquals(1, previewImage.closeCount)
      val activePpgFile = activeArtifact.files.single { it.kind == PPGArtifactFileKind.PPG }
      val activeFrameFile = activeArtifact.files.single { it.kind == PPGArtifactFileKind.FRAME }
      assertEquals(1, java.io.File(activePpgFile.path).readLines().size)
      assertEquals(1, java.io.File(activeFrameFile.path).readLines().size)
    }
  }

  private fun frameHandler(processors: List<PixelProcessor> = emptyList()) = PPGFrameHandler(
    framePipeline = FramePipeline(PixelStatisticsExtractor(), processors),
    ppgRecordProcessor = PPGRecordProcessor(),
    onPreviewFrameFailure = { _, _, _ -> error("valid preview frame failed") },
    elapsedRealtimeNanos = { 1_000L },
  )

  private fun session(root: java.io.File, id: String) = PPGCaptureSession(
    filesDirectory = root,
    sessionId = id,
    ioDispatcher = Dispatchers.Unconfined,
    consumerDispatcher = Dispatchers.Unconfined,
  )

  private fun metadata(timestampNanos: Long) = CameraFrameMetadata(
    timestampElapsedNanos = timestampNanos + 1,
    timestampFrameNanos = timestampNanos,
    timestampSystemNanos = timestampNanos + 2,
    exposureTimeNanos = 8_000_000,
    durationTimeNanos = 33_000_000,
    rollingShutterSkewTimeNanos = 0,
    iso = 0,
    whiteBalanceMode = 1,
  )

  private inline fun withRoot(block: (java.io.File) -> Unit) {
    val root = Files.createTempDirectory("ppg-frame-handler").toFile()
    try {
      block(root)
    } finally {
      root.deleteRecursively()
    }
  }

  private class TestImageProxy(timestampNanos: Long, format: Int = ImageFormat.YUV_420_888) {
    var closeCount = 0
      private set

    private val imageInfo = proxy(ImageInfo::class.java) { method, _ ->
      when (method.name) {
        "getTimestamp" -> timestampNanos
        "getRotationDegrees" -> 0
        else -> defaultValue(method.returnType)
      }
    }
    private val planeProxies = arrayOf(
      plane(ByteBuffer.wrap(byteArrayOf(10, 11, 12, 13)), rowStride = 2, pixelStride = 1),
      plane(ByteBuffer.wrap(byteArrayOf(128.toByte())), rowStride = 1, pixelStride = 1),
      plane(ByteBuffer.wrap(byteArrayOf(129.toByte())), rowStride = 1, pixelStride = 1),
    )

    val proxy = proxy(ImageProxy::class.java) { method, _ ->
      when (method.name) {
        "getFormat" -> format
        "getWidth", "getHeight" -> 2
        "getCropRect" -> Rect().apply {
          left = 0
          top = 0
          right = 2
          bottom = 2
        }
        "getImageInfo" -> imageInfo
        "getPlanes" -> planeProxies
        "close" -> {
          closeCount += 1
          null
        }
        else -> defaultValue(method.returnType)
      }
    }

    private fun plane(buffer: ByteBuffer, rowStride: Int, pixelStride: Int) =
      proxy(ImageProxy.PlaneProxy::class.java) { method, _ ->
        when (method.name) {
          "getBuffer" -> buffer
          "getRowStride" -> rowStride
          "getPixelStride" -> pixelStride
          else -> defaultValue(method.returnType)
        }
      }
  }

  private companion object {
    fun <T> proxy(type: Class<T>, handler: (Method, Array<out Any?>?) -> Any?): T =
      Proxy.newProxyInstance(
        type.classLoader,
        arrayOf(type),
        InvocationHandler { _, method, arguments -> handler(method, arguments) },
      ) as T

    fun defaultValue(type: Class<*>): Any? = when (type) {
      java.lang.Boolean.TYPE -> false
      java.lang.Byte.TYPE -> 0.toByte()
      java.lang.Character.TYPE -> '\u0000'
      java.lang.Double.TYPE -> 0.0
      java.lang.Float.TYPE -> 0.0f
      java.lang.Integer.TYPE -> 0
      java.lang.Long.TYPE -> 0L
      java.lang.Short.TYPE -> 0.toShort()
      else -> null
    }
  }
}
