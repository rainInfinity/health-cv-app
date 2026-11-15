/** 面部与指尖共用的历史波形：追加采样、固定六秒平移窗口与实时跟随。 */
import { init, color as echartsColor } from '/vendor/echarts.esm.min.js';

/** 保留本次检测的全部采样；仅允许平移，不对曲线做形状插值或缩放。 */
export function mountPulseWave(plot, pulseAt) {
  const chart = init(plot, null, { renderer: 'svg' });
  const panel = plot.parentElement;
  const range = panel.querySelector('[data-wave-range]');
  const liveButton = panel.querySelector('[data-wave-live]');
  const colors = getComputedStyle(plot);
  const tone = colors.getPropertyValue('--primary').trim();
  // 模拟幅度上界取 1.01，通过固定纵轴范围将数据放在坐标高度的 10%–85%（底边为 0%）。
  const amplitudeSpan = 1.01 / (.85 - .1);
  // 每项为 [采样开始后的秒数, 模拟幅度]；历史项一经追加便不再改写。
  const samples = [];
  let latest = 0;
  let viewStart = -6;
  let following = true;
  chart.setOption({
    animation: false,
    grid: { left: 4, right: 12, top: 8, bottom: 8 },
    tooltip: { show: false },
    xAxis: {
      type: 'value', min: -6, max: 0,
      axisLine: { show: false },
      axisTick: { show: false }, axisLabel: { show: false }, splitLine: { show: false },
    },
    yAxis: { type: 'value', min: -.1 * amplitudeSpan, max: .9 * amplitudeSpan, show: false },
    dataZoom: [{
      id: 'history', type: 'inside', xAxisIndex: 0,
      rangeMode: ['value', 'value'], startValue: -6, endValue: 0,
      minValueSpan: 6, maxValueSpan: 6, filterMode: 'none',
      zoomLock: true, zoomOnMouseWheel: false,
      moveOnMouseMove: true, moveOnMouseWheel: false, throttle: 0,
    }],
    series: [{
      id: 'pulse', type: 'line', data: [], showSymbol: false, silent: true,
      lineStyle: {
        width: 1.5, cap: 'round', join: 'round',
        color: {
          type: 'linear', x: 0, y: 0, x2: 1, y2: 0, global: true,
          colorStops: [{ offset: 0, color: echartsColor.modifyAlpha(tone, 0) }, { offset: .14, color: tone }, { offset: 1, color: tone }],
        },
      },
      emphasis: { disabled: true },
    }],
  });

  /** 标注当前时间范围；回看历史时才显示右侧的回到最新浮层。 */
  function updateControls() {
    const text = `${Math.max(0, viewStart).toFixed(1)}–${(viewStart + 6).toFixed(1)} 秒`;
    if (range.textContent !== text) range.textContent = text;
    liveButton.hidden = following || latest <= 6;
  }

  /** 最新样点始终位于右侧，未满六秒时仅在左侧留空，历史幅度保持不变。 */
  function render(dataChanged = false) {
    if (following) viewStart = latest - 6;
    const option = {
      xAxis: { min: Math.min(0, latest - 6), max: latest },
      dataZoom: [{ id: 'history', rangeMode: ['value', 'value'], startValue: viewStart, endValue: viewStart + 6 }],
    };
    if (dataChanged) option.series = [{ id: 'pulse', data: samples }];
    chart.setOption(option);
    updateControls();
  }

  /** 只补入新到达的 30Hz 样点，渲染窗口可按屏幕帧率独立平移。 */
  function update(seconds) {
    latest = Math.max(0, seconds);
    const count = Math.floor(latest * 30) + 1;
    const dataChanged = count > samples.length;
    while (samples.length < count) {
      const sampleTime = samples.length / 30;
      samples.push([sampleTime, pulseAt(sampleTime)]);
    }
    render(dataChanged);
  }

  /** 用户平移后保持当前绝对时间段，采样仍在后台继续追加。 */
  function onPan() {
    if (latest <= 6) return;
    viewStart = chart.getOption().dataZoom[0].startValue;
    following = false;
    updateControls();
  }

  /** 返回本次检测的最新窗口，运行中恢复自动跟随。 */
  function followLatest() {
    following = true;
    render();
  }

  /** 方向键每次平移一秒，首尾键跳到历史起点或最新位置。 */
  function onKeydown(event) {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    event.stopPropagation();
    if (latest <= 6) return;
    if (event.key === 'End') {
      followLatest();
      return;
    }
    following = false;
    viewStart = event.key === 'Home' ? 0 : Math.min(Math.max(0, latest - 6), Math.max(0, viewStart + (event.key === 'ArrowLeft' ? -1 : 1)));
    render();
  }

  /** 新一轮检测清空历史及回看位置，不复用上一轮采样。 */
  function reset() {
    samples.length = 0;
    latest = 0;
    viewStart = -6;
    following = true;
    render(true);
  }

  /** 同步图表尺寸与浮层中心，渐隐以窗口宽度而非整段历史为基准。 */
  function resize() {
    liveButton.style.top = `${plot.offsetTop + plot.clientHeight / 2}px`;
    chart.resize();
    chart.setOption({ series: [{ id: 'pulse', lineStyle: { color: {
      type: 'linear', x: 4, y: 0, x2: Math.max(5, plot.clientWidth - 12), y2: 0, global: true,
      colorStops: [{ offset: 0, color: echartsColor.modifyAlpha(tone, 0) }, { offset: .14, color: tone }, { offset: 1, color: tone }],
    } } }] });
  }

  /** 离开检测页时释放图表与交互监听。 */
  function dispose() {
    liveButton.removeEventListener('click', followLatest);
    plot.removeEventListener('keydown', onKeydown);
    chart.off('datazoom', onPan);
    chart.dispose();
  }

  chart.on('datazoom', onPan);
  liveButton.addEventListener('click', followLatest);
  plot.addEventListener('keydown', onKeydown);
  updateControls();
  resize();
  return { update, reset, resize, dispose };
}
