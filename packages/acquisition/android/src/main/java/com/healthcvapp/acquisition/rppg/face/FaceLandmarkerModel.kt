package com.healthcvapp.acquisition.rppg.face

import android.content.Context
import android.graphics.Bitmap
import com.google.mediapipe.framework.image.BitmapImageBuilder
import com.google.mediapipe.framework.image.MPImage
import com.google.mediapipe.tasks.core.BaseOptions
import com.google.mediapipe.tasks.core.Delegate
import com.google.mediapipe.tasks.vision.core.RunningMode
import com.google.mediapipe.tasks.vision.facelandmarker.FaceLandmarker
import com.google.mediapipe.tasks.vision.facelandmarker.FaceLandmarkerResult

/** 持有官方 Face Landmarker 模型，并提供串行视频帧推理入口。 */
internal class FaceLandmarkerModel private constructor(
  private val landmarker: FaceLandmarker,
) : AutoCloseable {
  private var inputBitmap: Bitmap? = null
  private var inputImage: MPImage? = null
  /** 缓存输入包装；更换 Bitmap 或关闭模型时释放其持有的像素。 */
  fun detectForVideo(bitmap: Bitmap, timestampMs: Long): FaceLandmarkerResult {
    if (inputBitmap !== bitmap) {
      val previousImage = inputImage
      inputImage = null
      inputBitmap = null
      previousImage?.close()
      val nextImage = BitmapImageBuilder(bitmap).build()
      inputBitmap = bitmap
      inputImage = nextImage
    }
    return landmarker.detectForVideo(checkNotNull(inputImage), timestampMs)
  }

  override fun close() {
    val image = inputImage
    inputImage = null
    inputBitmap = null
    try {
      landmarker.close()
    } finally {
      image?.close()
    }
  }

  companion object {
    const val MODEL_ASSET = "face_landmarker.task"

    /** 从 Android assets 加载固定模型；调用方负责在单一串行线程上推理和关闭。 */
    fun create(context: Context): FaceLandmarkerModel {
      val baseOptions =
        BaseOptions.builder()
          .setDelegate(Delegate.CPU)
          .setModelAssetPath(MODEL_ASSET)
          .build()
      val options =
        FaceLandmarker.FaceLandmarkerOptions.builder()
          .setBaseOptions(baseOptions)
          .setRunningMode(RunningMode.VIDEO)
          .setNumFaces(1)
          .setOutputFaceBlendshapes(false)
          .setOutputFacialTransformationMatrixes(true)
          .build()
      return FaceLandmarkerModel(
        FaceLandmarker.createFromOptions(context.applicationContext, options),
      )
    }
  }
}
