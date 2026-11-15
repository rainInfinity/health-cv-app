/** 验证主动帧处理的同步借用、会话归属和 ImageProxy 回收。 */

package com.healthcvapp.acquisition.ppg.processing

import android.graphics.ImageFormat
import android.graphics.Rect
import androidx.camera.core.ImageInfo
import androidx.camera.core.ImageProxy
import com.healthcvapp.acquisition.camera.CameraFrameMetadata
import com.healthcvapp.acquisition.ppg.fingertip.FingertipCoverage
import com.healthcvapp.acquisition.ppg.fingertip.FingertipCoverageEstimator
import com.healthcvapp.acquisition.ppg.model.PPGCaptureRecord
import com.healthcvapp.acquisition.ppg.model.CameraBlockLayout
import com.healthcvapp.acquisition.ppg.model.PPGArtifactFileKind
import com.healthcvapp.acquisition.pixels.PixelReader
import com.healthcvapp.acquisition.pixels.PixelFrameView
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
  fun oneFormalFrameWritesEveryRequestedBlockButOneCameraMetadataRow() = runTest {
    withRoot { root ->
      val layout = CameraBlockLayout(rows = 2, columns = 3)
      val handler = frameHandler()
      val session = session(root, "frame-multi-block", layout)
      session.start(startedAtElapsedNanos = 0, startedAtMillis = 10)
      val image = TestImageProxy(
        timestampNanos = 1_234_567_000L,
        width = 6,
        height = 3,
        cropRect = Rect().apply {
          left = 1
          top = 0
          right = 6
          bottom = 3
        },
      )

      handler.handle(image.proxy, "camera-one", session)
      session.offerCaptureMetadata(metadata(1_234_567_000L))
      val artifact = session.stop(finishedAtMillis = 20)

      assertEquals(1, image.closeCount)
      val ppgRows = java.io.File(
        artifact.files.single { it.kind == PPGArtifactFileKind.PPG }.path,
      ).readLines().drop(1).map { it.split(',') }
      val frameRows = java.io.File(
        artifact.files.single { it.kind == PPGArtifactFileKind.FRAME }.path,
      ).readLines()
      assertEquals((0..5).toList(), ppgRows.map { it[7].toInt() })
      assertEquals(setOf("0"), ppgRows.map { it[6] }.toSet())
      assertEquals(setOf("1234.567"), ppgRows.map { it[1] }.toSet())
      assertEquals(2, frameRows.size)
      assertEquals("1234.567", frameRows[1].split(',')[1])
    }
  }

  @Test
  fun sameFrameNearlyFullAndUnknownCoverageReachPairedConsumerWithoutPromotingPercent() = runTest {
    withRoot { root ->
      val estimator = FingertipCoverageEstimator()
      val observed = mutableListOf<FingertipCoverage>()
      val paired = mutableListOf<PPGCaptureRecord>()
      val handler = frameHandler(onFrameEvaluated = { frame ->
        estimator.estimate(frame).also(observed::add).usable
      })
      val session = session(root, "coverage-pair", onAcceptedRecord = paired::add)
      session.start(startedAtElapsedNanos = 0, startedAtMillis = 10)
      val nearlyFull = TestImageProxy(
        timestampNanos = 100L, width = 128, height = 128,
        yBytes = ByteArray(128 * 128) { index ->
          if (index % 128 in 62..65 && index / 128 in 62..65) 100.toByte() else 90.toByte()
        },
        uBytes = ByteArray(64 * 64) { index ->
          if (index % 64 in 31..32 && index / 64 in 31..32) 128.toByte() else 90.toByte()
        },
        vBytes = ByteArray(64 * 64) { index ->
          if (index % 64 in 31..32 && index / 64 in 31..32) 128.toByte() else 210.toByte()
        },
      )
      handler.handle(nearlyFull.proxy, "camera-one", session)
      session.offerCaptureMetadata(metadata(100L))
      val unknown = TestImageProxy(timestampNanos = 200L, yBytes = ByteArray(4))
      handler.handle(unknown.proxy, "camera-one", session)
      session.offerCaptureMetadata(metadata(200L))
      val artifact = session.stop(finishedAtMillis = 20)
      assertEquals(FingertipCoverage.State.PARTIAL, observed.first().state)
      assertTrue(observed.first().percent!! >= 95.0)
      assertTrue(observed.first().percent!! < 100.0)
      assertEquals(FingertipCoverage.UNKNOWN, observed.last())
      assertEquals(listOf(true, false), paired.map { it.ppg.coverageUsable })
      assertEquals(3, java.io.File(artifact.files.single { it.kind == PPGArtifactFileKind.PPG }.path).readLines().size)
      assertEquals(1, nearlyFull.closeCount)
      assertEquals(1, unknown.closeCount)
    }
  }

  @Test
  fun blockStatisticsFailureCannotSubmitPartialFrameAndReleasesImageOnce() = runTest {
    withRoot { root ->
      val layout = CameraBlockLayout(rows = 2, columns = 3)
      val handler = frameHandler()
      val session = session(root, "frame-partial-block-failure", layout)
      session.start(startedAtElapsedNanos = 0, startedAtMillis = 10)
      val image = TestImageProxy(
        timestampNanos = 2_000_000L,
        width = 6,
        height = 3,
        cropRect = Rect().apply {
          left = 1
          top = 0
          right = 6
          bottom = 3
        },
        yBytes = ByteArray(17) { (10 + it).toByte() },
      )

      handler.handle(image.proxy, "camera-one", session)
      val outcome = runCatching { session.stop(finishedAtMillis = 20) }

      assertTrue(outcome.isFailure)
      assertEquals("PIXEL_PROCESSING_FAILED", session.terminalFailure?.code)
      assertEquals(1, image.closeCount)
      assertFalse(root.resolve("acquisition/frame-partial-block-failure/ppg.csv").exists())
      assertFalse(root.resolve("acquisition/frame-partial-block-failure/frame.csv").exists())
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

  private fun frameHandler(
    processors: List<PixelProcessor> = emptyList(),
    onFrameEvaluated: (PixelFrameView) -> Boolean? = { null },
  ) = PPGFrameHandler(
    framePipeline = FramePipeline(PixelStatisticsExtractor(), processors),
    ppgRecordProcessor = PPGRecordProcessor(),
    onPreviewFrameFailure = { _, _, _ -> error("valid preview frame failed") },
    elapsedRealtimeNanos = { 1_000L },
    onFrameEvaluated = onFrameEvaluated,
  )

  private fun session(
    root: java.io.File,
    id: String,
    blockLayout: CameraBlockLayout = CameraBlockLayout(rows = 1, columns = 1),
    onAcceptedRecord: (PPGCaptureRecord) -> Unit = {},
  ) = PPGCaptureSession(
    filesDirectory = root,
    sessionId = id,
    blockLayout = blockLayout,
    ioDispatcher = Dispatchers.Unconfined,
    consumerDispatcher = Dispatchers.Unconfined,
    onAcceptedRecord = onAcceptedRecord,
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

  private class TestImageProxy(
    timestampNanos: Long,
    format: Int = ImageFormat.YUV_420_888,
    private val width: Int = 2,
    private val height: Int = 2,
    private val cropRect: Rect = Rect().apply {
      right = width
      bottom = height
    },
    yBytes: ByteArray = ByteArray(width * height) { (10 + it).toByte() },
    uBytes: ByteArray = ByteArray(((width + 1) / 2) * ((height + 1) / 2)) { 128.toByte() },
    vBytes: ByteArray = ByteArray(((width + 1) / 2) * ((height + 1) / 2)) { 129.toByte() },
  ) {
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
      plane(ByteBuffer.wrap(yBytes), rowStride = width, pixelStride = 1),
      plane(ByteBuffer.wrap(uBytes), rowStride = (width + 1) / 2, pixelStride = 1),
      plane(ByteBuffer.wrap(vBytes), rowStride = (width + 1) / 2, pixelStride = 1),
    )

    val proxy = proxy(ImageProxy::class.java) { method, _ ->
      when (method.name) {
        "getFormat" -> format
        "getWidth" -> width
        "getHeight" -> height
        "getCropRect" -> Rect().apply {
          left = cropRect.left
          top = cropRect.top
          right = cropRect.right
          bottom = cropRect.bottom
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
