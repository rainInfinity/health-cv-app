/** 保存有限长度的规则采样 RGB 序列，并提供复用读取目标。 */
package com.healthcvapp.acquisition.rppg.signal

/** 可复用的采样读取容器，避免按点读取时持续创建对象。 */
internal class RppgResampledRgb {
  /** 所属会话中的连续片段序号，从 0 开始。 */
  var segmentIndex: Long = 0L
    private set
  /** 所属会话中的全局单调样本序号，从 0 开始。 */
  var sampleIndex: Long = 0L
    private set
  /** 规则网格采集时间，单位纳秒。 */
  var timestampNanos: Long = 0L
    private set
  /** 规则网格红色通道均值，范围 0–255。 */
  var red: Double = 0.0
    private set
  /** 规则网格绿色通道均值，范围 0–255。 */
  var green: Double = 0.0
    private set
  /** 规则网格蓝色通道均值，范围 0–255。 */
  var blue: Double = 0.0
    private set

  /** 用环形缓冲区中的一条样本覆盖此复用容器。 */
  internal fun set(
    segmentIndex: Long,
    sampleIndex: Long,
    timestampNanos: Long,
    red: Double,
    green: Double,
    blue: Double,
  ) {
    this.segmentIndex = segmentIndex
    this.sampleIndex = sampleIndex
    this.timestampNanos = timestampNanos
    this.red = red
    this.green = green
    this.blue = blue
  }
}

/** 存放最近固定数量重采样点的环形缓冲区。 */
internal class RppgRgbRingBuffer(
  /** 环形缓冲区的固定容量，单位为样本。 */
  val capacity: Int,
) {
  private val segmentIndices: LongArray
  private val sampleIndices: LongArray
  private val timestampsNanos: LongArray
  private val red: DoubleArray
  private val green: DoubleArray
  private val blue: DoubleArray
  private var writePosition = 0
  private var storedCount = 0

  /** 当前保留的样本数，不超过固定容量。 */
  val size: Int
    get() = storedCount

  init {
    require(capacity > 0) { "RGB ring buffer capacity must be positive" }
    segmentIndices = LongArray(capacity)
    sampleIndices = LongArray(capacity)
    timestampsNanos = LongArray(capacity)
    red = DoubleArray(capacity)
    green = DoubleArray(capacity)
    blue = DoubleArray(capacity)
  }

  /** 追加一个已校验的重采样点；容量满时覆盖最旧点。 */
  internal fun append(
    segmentIndex: Long,
    sampleIndex: Long,
    timestampNanos: Long,
    red: Double,
    green: Double,
    blue: Double,
  ) {
    segmentIndices[writePosition] = segmentIndex
    sampleIndices[writePosition] = sampleIndex
    timestampsNanos[writePosition] = timestampNanos
    this.red[writePosition] = red
    this.green[writePosition] = green
    this.blue[writePosition] = blue

    writePosition++
    if (writePosition == capacity) writePosition = 0
    if (storedCount < capacity) storedCount++
  }

  /** 清空逻辑内容但复用已分配的底层数组。 */
  internal fun clear() {
    writePosition = 0
    storedCount = 0
  }

  /** 将从最旧点起算的样本复制到复用目标，不分配新对象。 */
  internal fun copyAt(indexFromOldest: Int, target: RppgResampledRgb) {
    if (indexFromOldest < 0 || indexFromOldest >= storedCount) {
      throw IndexOutOfBoundsException("RGB ring index $indexFromOldest is outside $storedCount samples")
    }
    val firstPosition = if (writePosition >= storedCount) {
      writePosition - storedCount
    } else {
      capacity - (storedCount - writePosition)
    }
    var position = firstPosition + indexFromOldest
    if (position >= capacity) position -= capacity
    target.set(
      segmentIndices[position],
      sampleIndices[position],
      timestampsNanos[position],
      red[position],
      green[position],
      blue[position],
    )
  }
}
