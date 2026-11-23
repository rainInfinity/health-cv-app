/** 将主动 RPPG runtime 连接到 Android 前摄、预览视图和官方人脸模型。 */

package com.healthcvapp.acquisition.rppg.runtime

import android.content.Context
import androidx.camera.view.PreviewView
import androidx.lifecycle.LifecycleOwner
import com.healthcvapp.acquisition.rppg.face.FaceLandmarkerModel
import com.healthcvapp.acquisition.rppg.model.RPPGConfig
import com.healthcvapp.acquisition.camera.CameraSourceException
import com.healthcvapp.acquisition.rppg.session.AndroidRPPGSessionCameraSource
import com.healthcvapp.acquisition.rppg.session.FaceRPPGSessionProcessor
import com.healthcvapp.acquisition.rppg.session.RPPGSession
import com.healthcvapp.acquisition.rppg.session.RPPGSessionProcessorFactory
import com.healthcvapp.acquisition.rppg.session.RPPGSessionSnapshot
import java.io.File
import kotlinx.coroutines.CoroutineScope

/** 为单个页面 runtime 创建惰性会话依赖；模型只在显式 start 时加载。 */
internal class AndroidRPPGActiveSessionFactory(
  context: Context,
  private val previewViewProvider: () -> PreviewView?,
  private val lifecycleOwnerProvider: () -> LifecycleOwner?,
  private val filesDirectory: File,
  private val config: RPPGConfig = RPPGConfig.EXPERIMENTAL_V2,
) : RPPGActiveSessionFactory {
  private val applicationContext = context.applicationContext

  /** 创建新的相机源和单会话处理器工厂，不触碰设备或文件系统。 */
  override fun create(
    scope: CoroutineScope,
    onSnapshot: (RPPGSessionSnapshot) -> Unit,
  ): RPPGSession {
    val cameraSourceFactory = {
      val previewView = previewViewProvider()
        ?: throw CameraSourceException("PREVIEW_UNAVAILABLE", "RPPG 原生预览视图尚未挂载。")
      val lifecycleOwner = lifecycleOwnerProvider()
        ?: throw CameraSourceException("ACTIVITY_UNAVAILABLE", "当前界面无法绑定 Android 相机生命周期。")
      AndroidRPPGSessionCameraSource(applicationContext, previewView, lifecycleOwner)
    }
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
      cameraSourceFactory = cameraSourceFactory,
      processorFactory = processorFactory,
      scope = scope,
      onSnapshot = onSnapshot,
    )
  }
}
