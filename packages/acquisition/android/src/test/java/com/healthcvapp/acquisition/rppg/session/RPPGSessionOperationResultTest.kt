/** 验证命令错误与会话历史错误隔离，避免成功关闭后页面仍被永久阻断。 */
package com.healthcvapp.acquisition.rppg.session

import org.junit.Assert.assertNull
import org.junit.Assert.assertSame
import org.junit.Test

class RPPGSessionOperationResultTest {
  /** 已成功关闭的命令不重复抛出启动时的相机占用错误。 */
  @Test
  fun successfulCloseDoesNotRepeatHistoricalBusyError() {
    val result = RPPGSessionOperationResult(
      accepted = true,
      snapshot = RPPGSessionSnapshot(
        phase = RPPGSessionPhase.CLOSED,
        error = RPPGSessionFailure("CAMERA_BUSY", "相机由另一会话占用。"),
      ),
    )

    assertNull(result.commandError)
  }

  /** 被拒绝但未单独附错误的命令仍保留权威会话错误。 */
  @Test
  fun rejectedCommandRetainsSnapshotFailure() {
    val failure = RPPGSessionFailure("CAMERA_BUSY", "相机由另一会话占用。")
    val result = RPPGSessionOperationResult(
      accepted = false,
      snapshot = RPPGSessionSnapshot(phase = RPPGSessionPhase.FAILED, error = failure),
    )

    assertSame(failure, result.commandError)
  }

  /** 当前关闭错误不能被历史错误覆盖，也不能仅凭接受标记忽略。 */
  @Test
  fun explicitCloseFailureTakesPrecedenceForEitherAcceptanceFlag() {
    val history = RPPGSessionFailure("CAMERA_BUSY", "先前相机占用。")
    val failure = RPPGSessionFailure("CAMERA_CLOSE_FAILED", "本次关闭失败。")
    for (accepted in listOf(false, true)) {
      val result = RPPGSessionOperationResult(
        accepted = accepted,
        snapshot = RPPGSessionSnapshot(phase = RPPGSessionPhase.CLOSED, error = history),
        error = failure,
      )

      assertSame(failure, result.commandError)
    }
  }
}
