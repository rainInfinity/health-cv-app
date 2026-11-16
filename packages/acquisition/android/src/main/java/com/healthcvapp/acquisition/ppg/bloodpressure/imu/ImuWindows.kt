/** 固定容量的真实事件时间滑窗；不按请求样本数计时，也不复制整段历史。 */
package com.healthcvapp.acquisition.ppg.bloodpressure.imu

import kotlin.math.max
import kotlin.math.min
import kotlin.math.sqrt

/** 保留窗口左边界之前的一个点，用线性片段积分处理非均匀事件间隔。 */
internal class ImuVectorWindow(private val capacity: Int) {
  private val times = LongArray(capacity)
  private val xs = DoubleArray(capacity)
  private val ys = DoubleArray(capacity)
  private val zs = DoubleArray(capacity)
  private var head = 0
  private var count = 0
  var centeredRms = Double.NaN
    private set
  var rawRms = Double.NaN
    private set

  fun clear() { head = 0; count = 0; centeredRms = Double.NaN; rawRms = Double.NaN }

  fun add(time: Long, x: Double, y: Double, z: Double) {
    // 两路事件不同步，评估终点取较早一路；额外保留新鲜度范围以覆盖共同窗口。
    val cutoff = time - WINDOW_NANOS - BloodPressureImuProcessor.FRESH_NANOS
    while (count > 1 && times[index(1)] <= cutoff) { head = index(1); count-- }
    if (count == capacity) { head = index(1); count-- }
    val slot = index(count++)
    times[slot] = time
    xs[slot] = x
    ys[slot] = y
    zs[slot] = z
  }

  fun evaluate(end: Long): Boolean {
    val start = end - WINDOW_NANOS
    if (count < 2 || times[head] > start || times[index(count - 1)] < end) return false
    var sumX = 0.0
    var sumY = 0.0
    var sumZ = 0.0
    var sumSquared = 0.0
    for (offset in 0 until count - 1) {
      val a = index(offset)
      val b = index(offset + 1)
      val left = max(start, times[a])
      val right = min(end, times[b])
      if (right <= left) continue
      val interval = (times[b] - times[a]).toDouble()
      val fractionA = (left - times[a]) / interval
      val fractionB = (right - times[a]) / interval
      val ax = xs[a] + (xs[b] - xs[a]) * fractionA
      val ay = ys[a] + (ys[b] - ys[a]) * fractionA
      val az = zs[a] + (zs[b] - zs[a]) * fractionA
      val bx = xs[a] + (xs[b] - xs[a]) * fractionB
      val by = ys[a] + (ys[b] - ys[a]) * fractionB
      val bz = zs[a] + (zs[b] - zs[a]) * fractionB
      val weight = (right - left).toDouble() / WINDOW_NANOS
      sumX += weight * (ax + bx) / 2.0
      sumY += weight * (ay + by) / 2.0
      sumZ += weight * (az + bz) / 2.0
      sumSquared += weight * (ax * ax + ax * bx + bx * bx + ay * ay + ay * by + by * by + az * az + az * bz + bz * bz) / 3.0
    }
    rawRms = sqrt(sumSquared.coerceAtLeast(0.0))
    centeredRms = sqrt((sumSquared - sumX * sumX - sumY * sumY - sumZ * sumZ).coerceAtLeast(0.0))
    return true
  }

  private fun index(offset: Int): Int = (head + offset) % capacity

  companion object { const val WINDOW_NANOS = 1_000_000_000L }
}

/**
 * 滤后能量保留 m²/s⁴；仅将包络插值到固定 50 Hz 网格以计算重复性。
 * 网格不生成或改写任何正式记录；无完整四秒或容量不足时不产生评估。
 */
internal class ScgObservationWindow {
  private val times = LongArray(CAPACITY)
  private val values = DoubleArray(CAPACITY)
  private val envelopes = DoubleArray(CAPACITY)
  private val grid = DoubleArray(GRID_COUNT)
  private val correlations = DoubleArray(MAX_LAG * 2 + 1)
  private val binEnergy = DoubleArray(4)
  private var head = 0
  private var count = 0
  var energyMeanSquare = Double.NaN
    private set
  var repetition = Double.NaN
    private set
  var passes = false
    private set

  fun clear() {
    head = 0
    count = 0
    energyMeanSquare = Double.NaN
    repetition = Double.NaN
    passes = false
  }

  fun add(time: Long, value: Double, envelope: Double) {
    val cutoff = time - WINDOW_NANOS
    while (count > 1 && times[index(1)] <= cutoff) { head = index(1); count-- }
    if (count == CAPACITY) { head = index(1); count-- }
    val slot = index(count++)
    times[slot] = time
    values[slot] = value
    envelopes[slot] = envelope
  }

  fun evaluate(end: Long, config: BloodPressureImuConfig): Boolean {
    val start = end - WINDOW_NANOS
    if (count < 2 || times[head] > start || times[index(count - 1)] < end) return false
    binEnergy.fill(0.0)
    for (offset in 0 until count - 1) {
      val a = index(offset)
      val b = index(offset + 1)
      var left = max(start, times[a])
      val right = min(end, times[b])
      while (left < right) {
        val bin = ((left - start) / 1_000_000_000L).toInt().coerceAtMost(3)
        val partEnd = min(right, start + (bin + 1) * 1_000_000_000L)
        val duration = (times[b] - times[a]).toDouble()
        val av = values[a] + (values[b] - values[a]) * ((left - times[a]) / duration)
        val bv = values[a] + (values[b] - values[a]) * ((partEnd - times[a]) / duration)
        binEnergy[bin] += (partEnd - left) / 1e9 * (av * av + av * bv + bv * bv) / 3.0
        left = partEnd
      }
    }
    energyMeanSquare = (binEnergy[0] + binEnergy[1] + binEnergy[2] + binEnergy[3]) / 4.0
    val minimumEnergy = config.scgNoiseReferenceRms * config.scgNoiseReferenceRms * config.scgEnergyAboveNoiseFactor
    var activeBins = 0
    for (energy in binEnergy) if (energy >= minimumEnergy) activeBins++
    passes = false
    repetition = 0.0
    if (energyMeanSquare < minimumEnergy || activeBins < 3) return true

    var pair = 0
    var mean = 0.0
    for (i in grid.indices) {
      val time = start + i * GRID_NANOS
      while (pair + 1 < count - 1 && times[index(pair + 1)] < time) pair++
      val a = index(pair)
      val b = index(pair + 1)
      val fraction = (time - times[a]).toDouble() / (times[b] - times[a])
      grid[i] = envelopes[a] + (envelopes[b] - envelopes[a]) * fraction
      mean += grid[i]
    }
    mean /= GRID_COUNT
    var variance = 0.0
    for (i in grid.indices) { grid[i] -= mean; variance += grid[i] * grid[i] }
    if (mean <= 0.0 || sqrt(variance / GRID_COUNT) < mean * config.scgMinimumEnvelopeVariation) return true

    // 同时验证一个周期和两个周期，并要求首峰为局部最大值，避免将单次缓慢变化当作节律。
    for (lag in MIN_LAG - 1..MAX_LAG * 2) {
      var product = 0.0
      var leftSquared = 0.0
      var rightSquared = 0.0
      for (i in 0 until GRID_COUNT - lag) {
        product += grid[i] * grid[i + lag]
        leftSquared += grid[i] * grid[i]
        rightSquared += grid[i + lag] * grid[i + lag]
      }
      val denominator = sqrt(leftSquared * rightSquared)
      correlations[lag] = if (denominator > 1e-24) (product / denominator).coerceIn(-1.0, 1.0) else 0.0
    }
    for (lag in MIN_LAG..MAX_LAG) {
      val correlation = correlations[lag]
      repetition = max(repetition, correlation)
      if (correlation >= config.scgEnvelopeCorrelationThreshold &&
        correlation >= correlations[lag - 1] && correlation > correlations[lag + 1] &&
        correlations[lag * 2] >= config.scgSecondRepetitionThreshold) {
        passes = true
      }
    }
    return true
  }

  private fun index(offset: Int): Int = (head + offset) % CAPACITY

  companion object {
    const val WINDOW_NANOS = 4_000_000_000L
    private const val CAPACITY = 4096
    private const val GRID_NANOS = 20_000_000L
    private const val GRID_COUNT = 201
    // 包络节律的工程搜索范围为 40–180 次／分，不输出心率或健康指标。
    private const val MIN_LAG = 17
    private const val MAX_LAG = 75
  }
}
