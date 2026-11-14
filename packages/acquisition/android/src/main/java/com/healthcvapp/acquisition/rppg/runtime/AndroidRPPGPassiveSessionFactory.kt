/** 为 Android 前台服务创建无预览的共用被动 RPPG 会话。 */

package com.healthcvapp.acquisition.rppg.runtime

import android.content.Context
import androidx.lifecycle.LifecycleOwner
import com.healthcvapp.acquisition.rppg.face.FaceLandmarkerModel
import com.healthcvapp.acquisition.rppg.model.RPPGConfig
import com.healthcvapp.acquisition.rppg.model.RPPGSessionSource
import com.healthcvapp.acquisition.rppg.session.AndroidRPPGSessionCameraSource
import com.healthcvapp.acquisition.rppg.session.FaceRPPGSessionProcessor
import com.healthcvapp.acquisition.rppg.session.RPPGSession
import com.healthcvapp.acquisition.rppg.session.RPPGSessionProcessorFactory
import com.healthcvapp.acquisition.rppg.session.RPPGSessionSnapshot
import java.io.File
import kotlinx.coroutines.CoroutineScope

/** 复用主动 RPPG 处理器和完整结果管线，不创建 PreviewView 或实时订阅。 */
internal class AndroidRPPGPassiveSessionFactory(
  context: Context,
  private val lifecycleOwner: LifecycleOwner,
  private val filesDirectory: File,
  private val measurementDurationNanos: Long,
  private val scope: CoroutineScope,
) {
  private val applicationContext = context.applicationContext

  /** 为一次有效解锁机会创建独立相机、算法和持久化会话。 */
  fun create(
    onFirstFrame: (sessionId: String, elapsedRealtimeNanos: Long) -> Unit,
    onSnapshot: (RPPGSessionSnapshot) -> Unit,
  ): RPPGSession {
    val config = RPPGConfig.EXPERIMENTAL_V1.copy(
      targetMeasurementDurationNanos = measurementDurationNanos,
    )
    val processorFactory = RPPGSessionProcessorFactory { sessionId, sessionConfig ->
      FaceRPPGSessionProcessor(
        model = FaceLandmarkerModel.create(applicationContext),
        sessionId = sessionId,
        config = sessionConfig,
      )
    }
    return RPPGSession(
      filesDirectory = filesDirectory,
      config = config,
      cameraSourceFactory = {
        AndroidRPPGSessionCameraSource(
          context = applicationContext,
          previewView = null,
          lifecycleOwner = lifecycleOwner,
        )
      },
      processorFactory = processorFactory,
      scope = scope,
      sessionSource = RPPGSessionSource.PASSIVE,
      onFirstFrame = onFirstFrame,
      onSnapshot = onSnapshot,
    )
  }
}
