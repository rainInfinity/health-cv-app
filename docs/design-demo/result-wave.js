/** 结果报告共用的处理后波形卡与六秒回看交互，仅展示固定设计样例。 */
import { init } from '/vendor/echarts.esm.min.js';

/** 三十秒、30Hz 的处理后 PPG 样例，独立于检测页实时波形。 */
export const processedPpgSamples = Array.from({ length: 901 }, (_, index) => {
  const seconds = index / 30;
  const phase = (seconds * 1.2) % 1;
  const pulse = Math.exp(-(((phase - .22) / .09) ** 2)) + .28 * Math.exp(-(((phase - .5) / .12) ** 2));
  return [seconds, pulse * (.94 + .05 * Math.sin(seconds * .8))];
});

/** 生成报告波形卡；标识和标题只接受页面定义的静态内容。 */
export function resultWaveCard(id, title) {
  return `<section id="${id}" class="result-wave-card" aria-labelledby="${id}-title"><div class="result-section-heading result-wave-heading"><div><h2 id="${id}-title">${title}</h2><span class="result-processing-tag">处理后</span></div><span>左右滑动查看</span></div><div class="result-wave pulse-wave" tabindex="0" role="group" aria-label="处理后${title}，每屏六秒，可横向拖动或使用方向键查看本轮三十秒数据"></div><div class="result-wave-navigation"><span data-result-range>0–6 秒</span><span>共 30 秒</span></div></section>`;
}

/** 挂载完整三十秒记录，以固定纵轴和六秒窗口独立平移，不缩放或自动滚动。 */
export function mountResultWave(card, samples, min, max) {
  const plot = card.querySelector('.result-wave');
  const range = card.querySelector('[data-result-range]');
  const colors = getComputedStyle(plot);
  const chart = init(plot, null, { renderer: 'svg' });
  let start = 0;
  chart.setOption({
    animation: false,
    grid: { left: 4, right: 12, top: 8, bottom: 8 },
    xAxis: { type: 'value', min: 0, max: 30, show: false },
    yAxis: { type: 'value', min, max, show: false },
    dataZoom: [{ type: 'inside', xAxisIndex: 0, filterMode: 'none', startValue: 0, endValue: 6, minValueSpan: 6, maxValueSpan: 6, zoomOnMouseWheel: false, moveOnMouseWheel: false, moveOnMouseMove: true, preventDefaultMouseMove: true }],
    series: [{ type: 'line', data: samples, showSymbol: false, smooth: false, clip: true, lineStyle: { width: 1.5, color: colors.getPropertyValue('--primary').trim() }, emphasis: { disabled: true } }],
  });

  /** 范围文字跟随实际窗口，拖动不修改原有采样值。 */
  function syncControls() {
    const zoom = chart.getOption().dataZoom[0];
    start = Math.max(0, Math.min(24, zoom.startValue));
    range.textContent = `${start.toFixed(1)}–${(start + 6).toFixed(1)} 秒`;
  }

  /** 定位六秒视窗，首尾限制于本轮三十秒记录。 */
  function seek(value) {
    const next = Math.max(0, Math.min(24, value));
    chart.dispatchAction({ type: 'dataZoom', startValue: next, endValue: next + 6 });
    syncControls();
  }

  /** 方向键逐秒移动，Home 和 End 分别跳到本轮首尾。 */
  function onKeydown(event) {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    seek(event.key === 'Home' ? 0 : event.key === 'End' ? 24 : start + (event.key === 'ArrowLeft' ? -1 : 1));
  }

  const observer = new ResizeObserver(() => chart.resize());
  observer.observe(plot);
  chart.on('datazoom', syncControls);
  plot.addEventListener('keydown', onKeydown);
  syncControls();
  return () => {
    observer.disconnect();
    plot.removeEventListener('keydown', onKeydown);
    chart.dispose();
  };
}
