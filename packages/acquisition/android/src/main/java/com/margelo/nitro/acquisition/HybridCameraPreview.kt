/** 将 CameraX PreviewView 实现为 Nitro 原生视图，不在挂载时启动相机。 */

package com.margelo.nitro.acquisition

import android.content.Context
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import androidx.camera.view.PreviewView
import com.healthcvapp.acquisition.ppg.runtime.PPGRuntime
import com.margelo.nitro.NitroModules

/** 在 React Native 容器中同步 CameraX 预览视图的延迟布局。 */
private class CameraPreviewContainer(
  context: Context,
  private val previewView: PreviewView,
) : FrameLayout(context) {
  private var relayoutQueued = false

  init {
    addView(
      previewView,
      FrameLayout.LayoutParams(
        ViewGroup.LayoutParams.MATCH_PARENT,
        ViewGroup.LayoutParams.MATCH_PARENT,
      ),
    )
  }

  /** 为 CameraX 后续插入的纹理视图安排一次本地重新测量与布局。 */
  override fun requestLayout() {
    super.requestLayout()
    if (!isAttachedToWindow || relayoutQueued) return

    relayoutQueued = true
    post {
      relayoutQueued = false
      val width = this@CameraPreviewContainer.width
      val height = this@CameraPreviewContainer.height
      if (width == 0 || height == 0) return@post

      previewView.measure(
        MeasureSpec.makeMeasureSpec(width, MeasureSpec.EXACTLY),
        MeasureSpec.makeMeasureSpec(height, MeasureSpec.EXACTLY),
      )
      previewView.layout(0, 0, previewView.measuredWidth, previewView.measuredHeight)
    }
  }
}

/** 提供同一采集服务使用的原生 Surface 预览视图。 */
class HybridCameraPreview private constructor(context: Context, @Suppress("UNUSED_PARAMETER") marker: Unit) : HybridCameraPreviewSpec() {
  constructor() : this(
    checkNotNull(NitroModules.applicationContext) { "Nitro ReactApplicationContext is unavailable" },
    Unit,
  )

  constructor(context: Context) : this(context, Unit)

  private val previewView = PreviewView(context).apply {
    // TextureView 参与原生视图合成，供指尖操作提示读取背景并实时模糊。
    implementationMode = PreviewView.ImplementationMode.COMPATIBLE
    scaleType = PreviewView.ScaleType.FILL_CENTER
  }
  private val previewContainer = CameraPreviewContainer(context, previewView)
  private val controller = PPGRuntime.get(context)

  override val view: View = previewContainer

  init {
    controller.attachPreview(previewView)
  }

  /** 释放旧页面持有的预览 Surface 引用。 */
  override fun onDropView() {
    controller.detachPreview(previewView)
  }
}
