/** 合并 Nitro 实例创建与正尺寸布局，避免 Fabric 布局事件提前放行相机启动。 */

import type { LayoutChangeEvent } from 'react-native'

/** 只有真实 HybridView 和有效布局均已到达，才向消费者报告预览就绪。 */
export function createRPPGPreviewReadiness(onLayout: (event: LayoutChangeEvent) => void) {
  let hybridReady = false
  let latestLayout: LayoutChangeEvent | null = null

  return {
    /** Nitro 回传实例时，原生构造与预览注册已经完成。 */
    onHybridReady() {
      if (hybridReady) return
      hybridReady = true
      const layout = latestLayout
      latestLayout = null
      if (layout != null) onLayout(layout)
    },
    /** 布局计算可以早于实际原生挂载，因此单独到达时只暂存。 */
    onLayout(event: LayoutChangeEvent) {
      const { width, height } = event.nativeEvent.layout
      if (width <= 0 || height <= 0) return
      if (hybridReady) {
        onLayout(event)
      } else {
        // React Native 可能回收合成事件；等实例回传期间必须保留布局数据。
        event.persist()
        latestLayout = event
      }
    },
  }
}
