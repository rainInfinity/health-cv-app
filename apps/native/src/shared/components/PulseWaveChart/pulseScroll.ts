/** 固定本轮采样坐标，只向原生动画提交绝对位移目标，不估算或回拨动画起点。 */

export const MAX_PULSE_SCROLL_MS = 200

/** 有限绘图画布与固定采样坐标之间的映射。 */
interface PulseCanvasGeometry {
  /** 包含原有左右留白的画布宽度，单位 dp。 */
  width: number
  /** 包含左侧预绘区的采集时间下界，单位毫秒。 */
  minimumTimeMs: number
  /** 本批次绘图时间上界，单位毫秒。 */
  maximumTimeMs: number
  /** 固定横向比例，单位 dp/ms；样本不会因批次更新改变坐标。 */
  pixelsPerMs: number
  /** 与 SVG 同批提交的静态位置补偿，单位 dp；与绝对动画位移相加。 */
  originOffset: number
}

/** 只绘制六秒附近数据；坐标补偿抵消批次横轴变化，历史样点位置保持不变。 */
export function createPulseCanvas(width: number, windowMillis: number, endTimeMs: number): PulseCanvasGeometry {
  const pixelsPerMs = Math.max(0, width - 16) / windowMillis
  const guardWidth = MAX_PULSE_SCROLL_MS * pixelsPerMs
  return {
    width: width + guardWidth,
    minimumTimeMs: endTimeMs - windowMillis - MAX_PULSE_SCROLL_MS,
    maximumTimeMs: endTimeMs,
    pixelsPerMs,
    originOffset: endTimeMs * pixelsPerMs - guardWidth,
  }
}

/** 下一批的绝对原生位移与衔接时长。 */
interface PulseScrollTarget {
  /** 固定采样坐标相对当前视窗的位移，单位 dp。 */
  position: number
  /** 原生动画时长，单位毫秒；零表示直接定位。 */
  durationMs: number
}

/** 动画从原生当前值继续；首帧、回看、终态和跳时直接定位。 */
export function planPulseScroll(previousTimeMs: number | null, timeMs: number, pixelsPerMs: number, enabled: boolean): PulseScrollTarget {
  const elapsed = previousTimeMs === null ? 0 : timeMs - previousTimeMs
  // 浮点采集毫秒保留 1 ms 容差，不将正常整批误判为跳时。
  const continuous = enabled && previousTimeMs !== null && elapsed > 0 && elapsed <= MAX_PULSE_SCROLL_MS + 1
  return { position: -timeMs * pixelsPerMs, durationMs: continuous ? Math.min(elapsed, MAX_PULSE_SCROLL_MS) : 0 }
}
