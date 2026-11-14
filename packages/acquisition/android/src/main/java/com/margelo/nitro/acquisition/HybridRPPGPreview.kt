/** 将 CameraX PreviewView 映射为明确归属主动 RPPG 的 Nitro 原生视图。 */

package com.margelo.nitro.acquisition

import android.content.Context
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import androidx.camera.view.PreviewView
import com.healthcvapp.acquisition.rppg.runtime.RPPGPreviewRegistry
import com.margelo.nitro.NitroModules

/** 为 CameraX 后续插入的纹理视图补做原生布局。 */
private class RPPGPreviewContainer(
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

  /** CameraX 改变内部 Surface 子视图时重新测量并布局。 */
  override fun requestLayout() {
    super.requestLayout()
    if (!isAttachedToWindow || relayoutQueued) return

    relayoutQueued = true
    post {
      relayoutQueued = false
      val width = this@RPPGPreviewContainer.width
      val height = this@RPPGPreviewContainer.height
      if (width == 0 || height == 0) return@post

      previewView.measure(
        MeasureSpec.makeMeasureSpec(width, MeasureSpec.EXACTLY),
        MeasureSpec.makeMeasureSpec(height, MeasureSpec.EXACTLY),
      )
      previewView.layout(0, 0, previewView.measuredWidth, previewView.measuredHeight)
    }
  }
}

/** 提供主动 RPPG 会话使用的原生前摄 Surface，不会因挂载而启动相机。 */
class HybridRPPGPreview private constructor(
  context: Context,
  @Suppress("UNUSED_PARAMETER") marker: Unit,
) : HybridRPPGPreviewSpec() {
  constructor() : this(
    checkNotNull(NitroModules.applicationContext) { "Nitro ReactApplicationContext is unavailable" },
    Unit,
  )

  constructor(context: Context) : this(context, Unit)

  private val previewView = PreviewView(context).apply {
    implementationMode = PreviewView.ImplementationMode.PERFORMANCE
    scaleType = PreviewView.ScaleType.FILL_CENTER
  }
  private val previewContainer = RPPGPreviewContainer(context, previewView)

  override val view: View = previewContainer

  init {
    RPPGPreviewRegistry.attach(previewView)
  }

  /** 仅解绑仍属于本视图的预览引用，不触碰其他页面或相机租约。 */
  override fun onDropView() {
    RPPGPreviewRegistry.detach(previewView)
  }
}
