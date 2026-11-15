/** 页面私有的本轮真实脉搏历史；接收与绘图订阅独立，不修补漏批。 */

import type { FingertipPulseBatch } from '@health-cv-app/acquisition'

/** 图表只读取当前六秒附近的坐标，完整本轮历史留在页面内存。 */
export interface FingertipWaveformSnapshot {
  /** 正式首帧相对毫秒坐标及真实幅值；空值只表示断线。 */
  points: [number, number | null][]
  /** 最新实际样点时间，不以 JS 时钟追加。 */
  latestTimeMs: number
  /** 每次实际接收的修订，供只读绘图消费者刷新。 */
  revision: number
}

/** 本轮历史的唯一消费接口。 */
export interface FingertipWaveform {
  /** 接纳真实批次，返回是否追加。 */
  append(batch: FingertipPulseBatch): boolean
  /** 返回当前消费快照。 */
  getSnapshot(): FingertipWaveformSnapshot
  /** 仅订阅绘图刷新，不控制原生接收。 */
  subscribe(listener: (next: FingertipWaveformSnapshot) => void): () => void
  /** 释放本轮局部内存。 */
  dispose(): void
}

/** 创建严格绑定 captureId 的历史；重测使用新实例，迟到批次不能重置它。 */
export function createFingertipWaveform(captureId: string, durationMillis = 30_000): FingertipWaveform {
  let snapshot: FingertipWaveformSnapshot = { points: [], latestTimeMs: 0, revision: 0 }
  let previous: { sessionId: string; segmentId: number; sequence: number; time: number } | null = null
  let disposed = false
  const listeners = new Set<(next: FingertipWaveformSnapshot) => void>()
  return {
    /** 只追加真实有效且时间递增的同轮有界批次，缺失位置留空不补点。 */
    append(batch: FingertipPulseBatch): boolean {
      if (disposed || batch.captureId !== captureId || batch.values.length === 0 || batch.values.length > 64 || batch.values.length !== batch.timesMillis.length) return false
      if (previous != null && batch.sequence <= previous.sequence) return false
      let lastTime = previous?.time ?? -Infinity
      for (let index = 0; index < batch.values.length; index += 1) {
        const time = batch.timesMillis[index]
        if (!Number.isFinite(time) || time < 0 || time > durationMillis || time <= lastTime || !Number.isFinite(batch.values[index])) return false
        lastTime = time
      }
      for (let index = 0; index < batch.values.length; index += 1) {
        const time = batch.timesMillis[index]
        const value = batch.values[index]
        if (previous != null && (
          previous.sessionId !== batch.sessionId || previous.segmentId !== batch.segmentId
          || (index === 0 && previous.sequence + 1 !== batch.sequence) || time - previous.time > 200
        )) snapshot.points.push([(previous.time + time) / 2, null])
        snapshot.points.push([time, value])
        previous = { sessionId: batch.sessionId, segmentId: batch.segmentId, sequence: batch.sequence, time }
      }
      snapshot = {
        ...snapshot, latestTimeMs: lastTime,
        revision: snapshot.revision + 1,
      }
      for (const listener of listeners) listener(snapshot)
      return true
    },
    /** 不复制整轮历史；消费者只能读取，不得改写 points。 */
    getSnapshot: () => snapshot,
    /** 隐藏时可解除绘图订阅；原生批次仍由页面订阅并持续 append。 */
    subscribe(listener: (next: FingertipWaveformSnapshot) => void) {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    /** 离页释放消费者与历史引用，并拒绝迟到批次。 */
    dispose() {
      disposed = true
      listeners.clear()
      snapshot = { points: [], latestTimeMs: 0, revision: snapshot.revision + 1 }
    },
  }
}

