/** 提供采集文件所需的目录创建、新建输出和单文件提升操作。 */

package com.healthcvapp.acquisition.storage

import java.io.File
import java.io.FileOutputStream
import java.io.IOException
import java.io.OutputStream

/** 对新文件采用拒绝覆盖语义，并只在同目录内提升单个文件。 */
internal class AcquisitionFileStore {
  /** 确保会话目录存在；不能将普通文件当作目录使用。 */
  fun ensureDirectory(directory: File) {
    if (!directory.isDirectory && !directory.mkdirs() && !directory.isDirectory) {
      throw IOException("无法创建采集目录：${directory.absolutePath}")
    }
  }

  /** 新建并打开 CSV 输出；目标已存在时保留原文件并失败。 */
  fun createNewOutput(file: File): OutputStream {
    ensureParentDirectory(file)
    if (!file.createNewFile()) throw IOException("采集输出文件已存在，拒绝覆盖：${file.absolutePath}")
    return try {
      FileOutputStream(file, false)
    } catch (error: Throwable) {
      file.delete()
      throw error
    }
  }

  /** 为 CameraX 预分配空文件，不打开或持有输出流。 */
  fun createNewFile(file: File): File {
    ensureParentDirectory(file)
    if (!file.createNewFile()) throw IOException("采集输出文件已存在，拒绝覆盖：${file.absolutePath}")
    return file
  }

  /** 将单个临时文件提升到同目录完成路径，目标已存在时不覆盖。 */
  fun promote(partialFile: File, completedFile: File): File {
    val partial = partialFile.canonicalFile
    val completed = completedFile.canonicalFile
    if (partial.parentFile != completed.parentFile) {
      throw IOException("采集文件只能在同一目录内提升。")
    }
    if (!partial.isFile) throw IOException("采集临时文件不存在：${partial.absolutePath}")
    if (completed.exists()) throw IOException("采集完成路径已存在，拒绝覆盖：${completed.absolutePath}")
    if (!partial.renameTo(completed)) {
      throw IOException("无法将采集临时文件提升为完成文件：${completed.absolutePath}")
    }
    if (!completed.isFile) throw IOException("采集完成文件不存在：${completed.absolutePath}")
    return completed
  }

  /** 将完整临时会话目录一次提升到同父目录，目标已存在时拒绝覆盖。 */
  fun promoteDirectory(partialDirectory: File, completedDirectory: File): File {
    val partial = partialDirectory.canonicalFile
    val completed = completedDirectory.canonicalFile
    if (partial.parentFile != completed.parentFile) {
      throw IOException("采集目录只能在同一父目录内提升。")
    }
    if (!partial.isDirectory) throw IOException("采集临时目录不存在：${partial.absolutePath}")
    if (completed.exists()) throw IOException("采集完成目录已存在，拒绝覆盖：${completed.absolutePath}")
    if (!partial.renameTo(completed)) {
      throw IOException("无法将采集临时目录提升为完成目录：${completed.absolutePath}")
    }
    if (!completed.isDirectory) throw IOException("采集完成目录不存在：${completed.absolutePath}")
    return completed
  }


  /** 为新文件操作准备父目录。 */
  private fun ensureParentDirectory(file: File) {
    file.parentFile?.let(::ensureDirectory)
  }
}
