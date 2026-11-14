/** 验证统一路径策略保持既有目录、文件名与会话隔离。 */

package com.healthcvapp.acquisition.storage

import java.io.File
import java.nio.file.Files
import com.healthcvapp.acquisition.sensors.model.SensorKind
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

/** 使用临时目录验证主动和被动产物的路径布局。 */
class AcquisitionPathsTest {
  @Test
  fun `ppg and passive sessions keep legacy paths and isolate session files`() = withTemporaryDirectory { root ->
    val paths = AcquisitionPaths(root)
    val ppgSession = paths.ppgSessionDirectory("legacy_session-01")
    val passiveSessionId = "7f4ca24c-27cc-4d88-86e5-153d76f90123"
    val passiveSession = paths.passiveVideoSessionDirectory(passiveSessionId)

    assertEquals(File(root, "acquisition/legacy_session-01"), ppgSession)
    assertEquals(File(ppgSession, "ppg.csv.part"), paths.ppgPartialFile("legacy_session-01"))
    assertEquals(File(ppgSession, "ppg.csv"), paths.ppgCompletedFile("legacy_session-01"))
    assertEquals(File(ppgSession, "frame.csv.part"), paths.framePartialFile("legacy_session-01"))
    assertEquals(File(ppgSession, "frame.csv"), paths.frameCompletedFile("legacy_session-01"))
    assertEquals(File(root, "passive-capture"), paths.passiveVideoRootDirectory())
    assertEquals(File(root, "passive-capture/$passiveSessionId"), passiveSession)
    assertEquals(File(passiveSession, "video.mp4.part"), paths.passiveVideoPartialFile(passiveSessionId))
    assertEquals(File(passiveSession, "video.mp4"), paths.passiveVideoCompletedFile(passiveSessionId))

    assertTrue(ppgSession.mkdirs())
    assertTrue(passiveSession.mkdirs())
    val otherPpgSession = paths.ppgSessionDirectory("another-session")
    assertTrue(otherPpgSession.mkdirs())
    assertNotEquals(ppgSession, otherPpgSession)
    assertTrue(ppgSession.isDirectory)
    assertTrue(passiveSession.isDirectory)
  }

  @Test
  fun `rppg sessions isolate temporary files from final result paths`() = withTemporaryDirectory { root ->
    val paths = AcquisitionPaths(root)
    val sessionId = "active-session_01"
    val temporary = paths.rppgPartialSessionDirectory(sessionId)
    val completed = paths.rppgSessionDirectory(sessionId)

    assertEquals(File(root, "acquisition/rppg"), paths.rppgRootDirectory())
    assertEquals(File(root, "acquisition/rppg/.${sessionId}.tmp"), temporary)
    assertEquals(File(root, "acquisition/rppg/$sessionId"), completed)
    assertEquals(File(temporary, "pulse.csv"), paths.rppgPartialPulseFile(sessionId))
    assertEquals(File(temporary, "hr.csv"), paths.rppgPartialHeartRateFile(sessionId))
    assertEquals(File(temporary, "session.json"), paths.rppgPartialSessionJsonFile(sessionId))
    assertEquals(File(completed, "pulse.csv"), paths.rppgPulseFile(sessionId))
    assertEquals(File(completed, "hr.csv"), paths.rppgHeartRateFile(sessionId))
    assertEquals(File(completed, "session.json"), paths.rppgSessionJsonFile(sessionId))
    assertNotEquals(temporary, completed)
  }


  @Test
  fun `sensor paths isolate types and sessions below the shared acquisition root`() = withTemporaryDirectory { root ->
    val paths = AcquisitionPaths(root)
    val accelerometer = paths.sensorSessionDirectory(SensorKind.ACCELEROMETER, "session-1")
    val gyroscope = paths.sensorSessionDirectory(SensorKind.GYROSCOPE, "session-1")
    val nextSession = paths.sensorSessionDirectory(SensorKind.ACCELEROMETER, "session-2")

    assertEquals(File(root, "acquisition/sensors/accelerometer/session-1"), accelerometer)
    assertEquals(File(accelerometer, "accelerometer.csv.part"), paths.sensorPartialFile(SensorKind.ACCELEROMETER, "session-1"))
    assertEquals(File(accelerometer, "accelerometer.csv"), paths.sensorCompletedFile(SensorKind.ACCELEROMETER, "session-1"))
    assertNotEquals(accelerometer, gyroscope)
    assertNotEquals(accelerometer, nextSession)
    assertThrows(IllegalArgumentException::class.java) {
      paths.sensorSessionDirectory(SensorKind.GRAVITY, "../outside")
    }
  }

  @Test
  fun `session identifiers retain their capability specific constraints`() = withTemporaryDirectory { root ->
    val paths = AcquisitionPaths(root)

    assertThrows(IllegalArgumentException::class.java) { paths.ppgSessionDirectory("../outside") }
    assertThrows(IllegalArgumentException::class.java) { paths.ppgSessionDirectory("") }
    assertThrows(IllegalArgumentException::class.java) {
      paths.passiveVideoSessionDirectory("not-a-uuid")
    }
    assertThrows(IllegalArgumentException::class.java) {
      paths.rppgPartialSessionDirectory("../outside")
    }
    assertThrows(IllegalArgumentException::class.java) { paths.rppgSessionDirectory("") }
  }

  /** 在临时根目录中运行路径断言并清理测试数据。 */
  private inline fun withTemporaryDirectory(block: (File) -> Unit) {
    val root = Files.createTempDirectory("acquisition-paths").toFile()
    try {
      block(root)
    } finally {
      root.deleteRecursively()
    }
  }
}
