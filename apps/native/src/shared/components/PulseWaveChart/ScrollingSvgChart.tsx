/** 固定采样坐标的 SVG 提交层，原生动画只更新绝对位移，不在批次之间回拨。 */

import { forwardRef, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react'
import { Animated, Easing } from 'react-native'
import SvgChart from '@wuba/react-native-echarts/svgChart'
import type { ChartElement, SVGVNode } from '@wuba/react-native-echarts/svgChart'
import { planPulseScroll } from './pulseScroll'
import { ChartClip, ChartOrigin, MovingChart } from './styles'

/** 适配库 SVG 宿主提供的绘图桥；所有绘制仍委托现有适配器。 */
interface SvgHost extends ChartElement {
  /** 由 ECharts SVG painter 调用的提交入口。 */
  elm: {
    patch: (previous: SVGVNode, next: SVGVNode) => void
    setAttribute: (name: string, value: unknown) => void
    setAttributeNS: (name: string, value: unknown) => void
    removeAttribute: (name: string) => void
    setZrenderId: (id: number) => void
  }
  /** 当前原生 SVG 画布尺寸。 */
  getChartSize: () => { width: number; height: number }
}

/** 为一次 ECharts 更新绑定对应的坐标补偿，不读取尚未提交的后续 React props。 */
export interface ScrollingSvgHandle extends HTMLElement {
  /** 在调用 init／resize／setOption 之前锁定本次绘图参数。 */
  prepareUpdate: () => void
}

/** 当前画布几何和采集目标，只有 SVG 真正提交后才用于平移。 */
interface ScrollingSvgProps {
  /** 包含左侧预绘区的有限画布宽度，单位 dp。 */
  width: number
  /** 画布高度，单位 dp。 */
  height: number
  /** 与当前已提交 SVG 对应的静态采样坐标补偿，单位 dp。 */
  originOffset: number
  /** 每采集毫秒对应的水平距离，单位 dp/ms。 */
  pixelsPerMs: number
  /** 当前视窗右端的相对采集时刻，单位毫秒。 */
  endTimeMs: number
  /** 当前是否允许自动跟随平移；回看、后台及终态为 false。 */
  scrolling: boolean
  /** 产品画布按原有左 4／右 12／上下 8 dp 坐标边界裁切。 */
  product: boolean
}

/** 批次只改变原生动画目标；实际起点由同一个原生动画值继续维护。 */
export const ScrollingSvgChart = forwardRef<ScrollingSvgHandle, ScrollingSvgProps>(function ScrollingSvgChart(props, ref) {
  const surface = useRef<SvgHost | null>(null)
  const pending = useRef(props)
  pending.current = props
  const submitted = useRef(props)
  const [committed, setCommitted] = useState<ScrollingSvgProps | null>(null)
  const previousFrame = useRef<ScrollingSvgProps | null>(null)
  const translation = useRef(new Animated.Value(0)).current
  const animation = useRef<Animated.CompositeAnimation | null>(null)
  const alive = useRef(true)
  const rendered = committed ?? props

  useImperativeHandle(ref, () => {
    const host = surface.current!
    return {
      ...host,
      getChartSize: () => ({ width: pending.current.width, height: pending.current.height }),
      prepareUpdate: () => { submitted.current = { ...pending.current } },
      elm: {
        ...host.elm,
        patch: (previous: SVGVNode, next: SVGVNode) => {
          host.elm.patch(previous, next)
          // 与新 SVG 同批通知目标，历史点的固定坐标不随批次提交改变。
          if (alive.current) setCommitted(submitted.current)
        },
      },
    } as unknown as ScrollingSvgHandle
  }, [])

  useLayoutEffect(() => {
    if (!committed) return
    const previous = previousFrame.current
    const sameGeometry = previous !== null && previous.width === committed.width && previous.height === committed.height && previous.pixelsPerMs === committed.pixelsPerMs && previous.product === committed.product
    previousFrame.current = committed
    // 重复 SVG 提交不得打断尚在运行的原生动画。
    if (sameGeometry && previous.endTimeMs === committed.endTimeMs && previous.scrolling === committed.scrolling) return
    const next = planPulseScroll(sameGeometry ? previous.endTimeMs : null, committed.endTimeMs, committed.product ? committed.pixelsPerMs : 0, committed.scrolling && sameGeometry)
    animation.current?.stop()
    if (next.durationMs === 0) {
      translation.setValue(next.position)
      return
    }
    animation.current = Animated.timing(translation, {
      toValue: next.position,
      duration: next.durationMs,
      easing: Easing.linear,
      useNativeDriver: true,
      isInteraction: false,
    })
    animation.current.start()
  }, [committed, translation])

  useLayoutEffect(() => {
    if (props.scrolling) return
    animation.current?.stop()
    translation.setValue(props.product ? -props.endTimeMs * props.pixelsPerMs : 0)
    previousFrame.current = null
  }, [props.scrolling, props.endTimeMs, props.pixelsPerMs, props.product, translation])

  useLayoutEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
      animation.current?.stop()
    }
  }, [])

  return (
    <ChartClip style={props.product ? { left: 4, right: 12, top: 8, bottom: 8 } : { left: 0, right: 0, top: 0, bottom: 0 }}>
      <ChartOrigin style={{ width: props.width, height: props.height, transform: [{ translateX: rendered.originOffset }] }}>
        <MovingChart style={{ left: props.product ? -4 : 0, top: props.product ? -8 : 0, width: props.width, height: props.height, transform: [{ translateX: translation }] }}>
          <SvgChart ref={surface} style={{ width: props.width, height: props.height }} handleGesture={false} />
        </MovingChart>
      </ChartOrigin>
    </ChartClip>
  )
})
