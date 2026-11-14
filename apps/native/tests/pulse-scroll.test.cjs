// 验证批次坐标补偿不改变历史样点位置，以及原生目标只按绝对时间向左推进。

const assert = require('node:assert/strict');
const test = require('node:test');
const scrollModule = import('../src/shared/components/PulseWaveChart/pulseScroll.ts');

test('新旧 SVG 批次在同一个原生位移下投影一致，不在交接时左右校正历史波峰', async () => {
  const { createPulseCanvas } = await scrollModule;
  const worldX = (sampleTimeMs, canvas) => 4
    + (sampleTimeMs - canvas.minimumTimeMs) / (canvas.maximumTimeMs - canvas.minimumTimeMs) * (canvas.width - 16)
    + canvas.originOffset;
  for (const endTimeMs of [1_000, 6_000, 19_750]) {
    const previous = createPulseCanvas(376, 6_000, endTimeMs);
    const next = createPulseCanvas(376, 6_000, endTimeMs + 50);
    const nativePosition = -(endTimeMs - 25) * previous.pixelsPerMs;
    for (const sampleTimeMs of [endTimeMs - 500, endTimeMs - 50]) {
      assert.ok(Math.abs((worldX(sampleTimeMs, previous) + nativePosition)
        - (worldX(sampleTimeMs, next) + nativePosition)) < 1e-9);
    }
  }
});

test('连续批次只提交向左的绝对目标，不用 JS 时钟重建或回拨动画起点', async () => {
  const { planPulseScroll } = await scrollModule;
  const first = planPulseScroll(null, 1_000, 0.06, true);
  const next = planPulseScroll(1_000, 1_200, 0.06, true);
  const interrupted = planPulseScroll(1_200, 1_250, 0.06, true);
  assert.equal(first.durationMs, 0);
  assert.equal(next.durationMs, 200);
  assert.equal(interrupted.durationMs, 50);
  assert.ok(first.position > next.position);
  assert.ok(next.position > interrupted.position);
  assert.equal(interrupted.position, -75);
  assert.ok(planPulseScroll(1_000, 1_200.000001, 0.06, true).durationMs > 0);
  assert.equal(planPulseScroll(1_200, 1_200, 0.06, true).durationMs, 0);
});

test('起始右对齐和六秒窗口不变，回看、结束及跳时直接定位', async () => {
  const { createPulseCanvas, planPulseScroll } = await scrollModule;
  const width = 376;
  for (const endTimeMs of [0, 2_000, 30_000]) {
    const canvas = createPulseCanvas(width, 6_000, endTimeMs);
    const position = planPulseScroll(null, endTimeMs, canvas.pixelsPerMs, false).position;
    const screenX = (time) => 4 + (time - canvas.minimumTimeMs) * canvas.pixelsPerMs + canvas.originOffset + position;
    assert.ok(Math.abs(screenX(endTimeMs) - (width - 12)) < 1e-9);
    assert.ok(Math.abs(screenX(endTimeMs - 6_000) - 4) < 1e-9);
  }
  assert.equal(planPulseScroll(1_000, 1_200, 0.06, false).durationMs, 0);
  assert.equal(planPulseScroll(1_200, 0, 0.06, true).durationMs, 0);
  assert.equal(planPulseScroll(1_200, 2_000, 0.06, true).durationMs, 0);
});
