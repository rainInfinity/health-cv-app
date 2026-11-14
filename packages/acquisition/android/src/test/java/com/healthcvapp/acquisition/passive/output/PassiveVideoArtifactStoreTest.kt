/** 验证被动视频临时文件隔离、发布失败及完成列表边界。 */

package com.healthcvapp.acquisition.passive.output

import com.healthcvapp.acquisition.storage.AcquisitionFileStore
import com.healthcvapp.acquisition.storage.AcquisitionPaths
import java.io.File
import java.nio.file.Files
import java.util.UUID
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Assert.assertThrows
import org.junit.Test

/** 使用临时文件系统覆盖会话不覆盖、临时文件排除和失败不发布。 */
class PassiveVideoArtifactStoreTest {
  @Test
  fun `sessions receive isolated paths and cannot overwrite an existing temporary file`() = withStore { root, store ->
    val firstId = UUID.randomUUID().toString()
    val secondId = UUID.randomUUID().toString()
    val first = store.createTemporaryFile(firstId)
    assertEquals(File(root, "passive-capture/$firstId/video.mp4.part"), first)
    first.writeText("first session")

    val error = assertThrows(IllegalStateException::class.java) {
      store.createTemporaryFile(firstId)
    }
    assertTrue(error.message.orEmpty().contains("拒绝覆盖"))

    val second = store.createTemporaryFile(secondId)
    assertFalse(first.parentFile == second.parentFile)
    assertEquals("first session", first.readText())
  }

  @Test
  fun `unfinished and foreign temporary files never enter or disappear from the store`() = withStore { _, store ->
    val temporary = store.createTemporaryFile(UUID.randomUUID().toString())
    val foreign = File.createTempFile("outside-", ".part")
    try {
      temporary.writeText("unfinished")
      assertEquals(0, runBlocking { store.listVideoArtifacts() }.size)

      store.discardTemporaryFile(temporary)
      store.discardTemporaryFile(foreign)
      assertFalse(temporary.exists())
      assertTrue(foreign.exists())
    } finally {
      foreign.delete()
    }
  }

  @Test
  fun `invalid or occupied publish paths fail before claiming completion`() = withStore { _, store ->
    val sessionId = UUID.randomUUID().toString()
    val temporary = store.createTemporaryFile(sessionId)
    var claimed = false

    assertThrows(IllegalStateException::class.java) {
      store.publish(sessionId, temporary) { claimed = true; true }
    }
    assertFalse(claimed)

    temporary.writeText("not a media file")
    val finalFile = File(temporary.parentFile, "video.mp4")
    finalFile.writeText("existing session")
    assertThrows(IllegalStateException::class.java) {
      store.publish(sessionId, temporary) { claimed = true; true }
    }
    assertFalse(claimed)
    assertEquals("existing session", finalFile.readText())
  }

  /** 在独立临时目录中运行存储行为，结束后清除测试数据。 */
  private inline fun withStore(block: (File, PassiveVideoArtifactStore) -> Unit) {
    val root = Files.createTempDirectory("passive-capture-store").toFile()
    try {
      block(root, PassiveVideoArtifactStore(AcquisitionPaths(root), AcquisitionFileStore()))
    } finally {
      root.deleteRecursively()
    }
  }
}
