/** 覆盖 Fabric 布局先到和 Native 实例先到时的真实启动门槛。 */

const assert = require('node:assert/strict')
const { test } = require('node:test')
const { createRPPGPreviewReadiness } = require('../../../packages/acquisition/src/react/RPPGPreview/previewReadiness.ts')

/** 构造消费者需要的布局尺寸，不引入原生视图运行环境。 */
function layout(width, height) {
  let persistent = false
  return {
    nativeEvent: { layout: { x: 0, y: 0, width, height } },
    persist() { persistent = true },
    isPersistent() { return persistent },
  }
}

test('布局先到不能提前启动尚未注册的原生预览', () => {
  let nativeAvailable = false
  let phase = 'waiting'
  const readiness = createRPPGPreviewReadiness((event) => {
    if (!nativeAvailable) throw new Error('PREVIEW_UNAVAILABLE')
    assert.equal(event.nativeEvent.layout.width, 300)
    phase = 'preview'
  })

  const event = layout(300, 240)
  readiness.onLayout(event)
  if (!event.isPersistent()) event.nativeEvent = null
  assert.equal(phase, 'waiting')
  nativeAvailable = true
  readiness.onHybridReady()
  assert.equal(phase, 'preview')
})

test('实例先到仍须等待正尺寸布局，不能用零尺寸放行', () => {
  let phase = 'waiting'
  const readiness = createRPPGPreviewReadiness(() => { phase = 'preview' })

  readiness.onHybridReady()
  readiness.onLayout(layout(0, 240))
  readiness.onLayout(layout(300, 0))
  assert.equal(phase, 'waiting')
  readiness.onLayout(layout(300, 240))
  assert.equal(phase, 'preview')
})
