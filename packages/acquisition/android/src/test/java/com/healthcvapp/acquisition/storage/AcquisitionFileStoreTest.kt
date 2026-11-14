/** 验证共通文件操作拒绝覆盖并只交付成功提升的路径。 */

package com.healthcvapp.acquisition.storage

import java.io.File
import java.io.IOException
import java.nio.file.Files
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

/** 使用临时文件系统覆盖主动 CSV 与被动视频所需的文件行为。 */
class AcquisitionFileStoreTest {
  @Test
  fun `new output and preallocated file reject overwrite and preserve existing bytes`() = withStore { root, store ->
    val output = File(root, "acquisition/session-1/ppg.csv.part")
    store.createNewOutput(output).use { it.write("original".toByteArray(Charsets.UTF_8)) }

    val outputError = assertThrows(IOException::class.java) { store.createNewOutput(output) }
    assertTrue(outputError.message.orEmpty().contains("拒绝覆盖"))
    assertEquals("original", output.readText())

    val video = store.createNewFile(File(root, "passive-capture/session-1/video.mp4.part"))
    assertTrue(video.isFile)
    video.writeText("allocated")
    assertThrows(IOException::class.java) { store.createNewFile(video) }
    assertEquals("allocated", video.readText())
  }

  @Test
  fun `promotion returns only a moved file and never replaces an occupied destination`() = withStore { root, store ->
    val directory = File(root, "acquisition/session-1")
    val partial = File(directory, "ppg.csv.part")
    val completed = File(directory, "ppg.csv")
    store.createNewOutput(partial).use { it.write("finished".toByteArray(Charsets.UTF_8)) }

    assertEquals(completed.canonicalFile, store.promote(partial, completed))
    assertFalse(partial.exists())
    assertEquals("finished", completed.readText())

    val blockedPartial = File(directory, "frame.csv.part")
    val occupiedCompleted = File(directory, "frame.csv")
    store.createNewOutput(blockedPartial).use { it.write("partial".toByteArray(Charsets.UTF_8)) }
    occupiedCompleted.writeText("existing")
    assertThrows(IOException::class.java) { store.promote(blockedPartial, occupiedCompleted) }
    assertTrue(blockedPartial.isFile)
    assertEquals("existing", occupiedCompleted.readText())

    assertThrows(IOException::class.java) {
      store.promote(File(directory, "missing.part"), File(directory, "missing.csv"))
    }
    assertFalse(File(directory, "missing.csv").exists())
  }

  @Test
  fun `directory promotion moves a complete folder and preserves existing targets`() = withStore { root, store ->
    val parent = File(root, "acquisition/rppg")
    val partial = File(parent, ".session-a.tmp")
    val completed = File(parent, "session-a")
    store.ensureDirectory(partial)
    File(partial, "session.json").writeText("complete")

    assertEquals(completed.canonicalFile, store.promoteDirectory(partial, completed))
    assertFalse(partial.exists())
    assertEquals("complete", File(completed, "session.json").readText())

    val blockedPartial = File(parent, ".session-b.tmp")
    store.ensureDirectory(blockedPartial)
    File(blockedPartial, "session.json").writeText("partial")
    assertThrows(IOException::class.java) { store.promoteDirectory(blockedPartial, completed) }
    assertTrue(blockedPartial.isDirectory)
    assertEquals("complete", File(completed, "session.json").readText())

    val crossParent = File(root, "other/session-b")
    assertThrows(IOException::class.java) { store.promoteDirectory(blockedPartial, crossParent) }
    assertThrows(IOException::class.java) {
      store.promoteDirectory(File(parent, ".missing.tmp"), File(parent, "missing"))
    }
  }


  @Test
  fun `path-driven session files remain isolated when created through the store`() = withStore { root, store ->
    val paths = AcquisitionPaths(root)
    val first = paths.ppgPartialFile("session-1")
    val second = paths.ppgPartialFile("session-2")

    store.createNewOutput(first).use { it.write("first".toByteArray(Charsets.UTF_8)) }
    store.createNewOutput(second).use { it.write("second".toByteArray(Charsets.UTF_8)) }

    assertNotEquals(first.canonicalFile, second.canonicalFile)
    assertEquals("first", first.readText())
    assertEquals("second", second.readText())
  }

  /** 在临时根目录中运行文件行为并清理测试数据。 */
  private inline fun withStore(block: (File, AcquisitionFileStore) -> Unit) {
    val root = Files.createTempDirectory("acquisition-file-store").toFile()
    try {
      block(root, AcquisitionFileStore())
    } finally {
      root.deleteRecursively()
    }
  }
}
