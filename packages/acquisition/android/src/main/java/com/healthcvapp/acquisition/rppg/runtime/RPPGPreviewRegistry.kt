/** 将唯一活动 RPPG 预览视图与主动 runtime 的相机源显式关联。 */

package com.healthcvapp.acquisition.rppg.runtime

import androidx.camera.view.PreviewView
import java.lang.ref.WeakReference

/** 仅保留当前原生预览的弱引用，避免与原始 PPG 预览控制器串用。 */
internal object RPPGPreviewRegistry {
  private val lock = Any()
  private var previewReference: WeakReference<PreviewView>? = null

  /** 注册当前 RPPG 视图；新视图成为唯一可供会话绑定的预览。 */
  fun attach(previewView: PreviewView) {
    synchronized(lock) { previewReference = WeakReference(previewView) }
  }

  /** 仅清除仍匹配的视图，迟到的旧页面卸载不能移除新预览。 */
  fun detach(previewView: PreviewView) {
    synchronized(lock) {
      if (previewReference?.get() === previewView) previewReference = null
    }
  }

  /** 返回当前仍存活的 RPPG 预览视图。 */
  fun current(): PreviewView? = synchronized(lock) { previewReference?.get() }
}
