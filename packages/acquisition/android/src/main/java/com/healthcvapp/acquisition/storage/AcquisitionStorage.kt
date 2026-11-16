/** 统一解析新采集产物的应用专属外部根目录。 */

package com.healthcvapp.acquisition.storage

import android.content.Context
import java.io.File
import java.io.IOException

/** 外部目录不可用时明确失败，禁止把新产物回退保存到内部目录。 */
internal fun Context.acquisitionFilesDirectory(): File =
  getExternalFilesDir(null) ?: throw IOException("应用专属外部采集目录不可用。")
