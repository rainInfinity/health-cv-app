/** 验证通用 CSV writer 的顺序、流所有权与关闭边界。 */

package com.healthcvapp.acquisition.storage.csv

import java.io.ByteArrayOutputStream
import java.io.IOException
import org.junit.Assert.assertEquals
import org.junit.Assert.assertSame
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

/** 覆盖批次顺序、表头失败收尾及关闭后的拒写行为。 */
class CsvBatchWriterTest {
  @Test
  fun `writes rows in order across batches without retaining batch contents`() = kotlinx.coroutines.runBlocking {
    val output = TrackingOutputStream()
    val writer = CsvBatchWriter(output, TextEncoder)
    val firstBatch = mutableListOf("first", "second")

    writer.writeBatch(firstBatch)
    firstBatch.clear()
    writer.writeBatch(listOf("third"))
    writer.close()

    assertEquals("value${System.lineSeparator()}first${System.lineSeparator()}second${System.lineSeparator()}third${System.lineSeparator()}", output.toString(Charsets.UTF_8.name()))
    assertEquals(1, output.closeCount)
  }

  @Test
  fun `writes each record row before advancing to the next record`() = kotlinx.coroutines.runBlocking {
    val output = TrackingOutputStream()
    val encoder = object : CsvRowEncoder<Pair<String, List<Int>>> {
      override val header = "frame,block"

      override fun rowCount(record: Pair<String, List<Int>>): Int = record.second.size

      override fun appendRow(
        record: Pair<String, List<Int>>,
        rowIndex: Int,
        destination: StringBuilder,
      ) {
        destination.append(record.first).append(',').append(record.second[rowIndex])
      }
    }
    val writer = CsvBatchWriter(output, encoder)

    writer.writeBatch(listOf("frame-0" to listOf(0, 1, 2), "frame-1" to listOf(0)))
    writer.close()

    assertEquals(
      "frame,block${System.lineSeparator()}frame-0,0${System.lineSeparator()}frame-0,1${System.lineSeparator()}frame-0,2${System.lineSeparator()}frame-1,0${System.lineSeparator()}",
      output.toString(Charsets.UTF_8.name()),
    )
  }

  @Test
  fun `rejects a record with no encoded rows`() = kotlinx.coroutines.runBlocking {
    val output = TrackingOutputStream()
    val encoder = object : CsvRowEncoder<String> {
      override val header = "value"
      override fun rowCount(record: String): Int = 0
      override fun appendRow(record: String, rowIndex: Int, destination: StringBuilder) {
        destination.append(record)
      }
    }
    val writer = CsvBatchWriter(output, encoder)

    assertThrows(IOException::class.java) {
      kotlinx.coroutines.runBlocking { writer.writeBatch(listOf("empty")) }
    }
    writer.close()
    assertEquals("value${System.lineSeparator()}", output.toString(Charsets.UTF_8.name()))
  }

  @Test
  fun `header failure closes the owned stream and preserves the original failure`() {
    val headerFailure = IOException("header failed")
    val output = TrackingOutputStream(closeFailure = IOException("close failed"))
    val encoder = object : CsvRowEncoder<String> {
      override val header: String
        get() = throw headerFailure

      override fun rowCount(record: String): Int = 1
      override fun appendRow(record: String, rowIndex: Int, destination: StringBuilder) {
        destination.append(record)
      }
    }

    val thrown = assertThrows(IOException::class.java) { CsvBatchWriter(output, encoder) }

    assertSame(headerFailure, thrown)
    assertEquals(1, output.closeCount)
    assertTrue(output.isClosed)
    assertEquals("close failed", thrown.suppressed.single().message)
  }

  @Test
  fun `close is idempotent and closed writer rejects further writes`() = kotlinx.coroutines.runBlocking {
    val output = TrackingOutputStream()
    val writer = CsvBatchWriter(output, TextEncoder)

    writer.close()
    writer.close()

    assertEquals(1, output.closeCount)
    assertThrows(IOException::class.java) { kotlinx.coroutines.runBlocking { writer.writeBatch(listOf("late")) } }
    Unit
  }

  private object TextEncoder : CsvRowEncoder<String> {
    override val header: String = "value"

    override fun rowCount(record: String): Int = 1

    override fun appendRow(record: String, rowIndex: Int, destination: StringBuilder) {
      require(rowIndex == 0)
      destination.append(record)
    }
  }

  private class TrackingOutputStream(
    private val closeFailure: IOException? = null,
  ) : ByteArrayOutputStream() {
    var closeCount = 0
      private set
    var isClosed = false
      private set

    override fun close() {
      closeCount += 1
      isClosed = true
      closeFailure?.let { throw it }
    }
  }
}
