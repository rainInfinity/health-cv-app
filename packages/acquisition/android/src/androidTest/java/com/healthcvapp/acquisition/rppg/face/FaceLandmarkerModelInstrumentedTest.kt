/** 验证 Face Landmarker 在连续视频帧间保留并最终释放复用 Bitmap。 */
package com.healthcvapp.acquisition.rppg.face

import android.graphics.Bitmap
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class FaceLandmarkerModelInstrumentedTest {
  @Test
  fun retainsReusableBitmapAcrossFramesAndReleasesItWhenModelCloses() {
    val context = InstrumentationRegistry.getInstrumentation().targetContext
    val bitmap = Bitmap.createBitmap(64, 64, Bitmap.Config.ARGB_8888)
    val model = FaceLandmarkerModel.create(context)
    try {
      model.detectForVideo(bitmap, 0L)
      assertFalse("the first inference must not consume the reusable bitmap", bitmap.isRecycled)
      model.detectForVideo(bitmap, 33L)
      assertFalse("the next frame must be able to reuse the same bitmap", bitmap.isRecycled)
    } finally {
      model.close()
    }
    assertTrue("closing the model must release its input image", bitmap.isRecycled)
  }
}
