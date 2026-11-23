/** 面部心率检测的纯设计演示；照片、脉搏波和读数均不来自设备或算法。 */
import { mountPulseWave } from './pulse-wave.js';
import { loadingIcon } from './ui.js';

/** 检测页保留上方取景区，下方全宽面板集中展示读数、波形与操作。 */
export const faceMeasurementPage = `<div class="phone face-measurement" data-phase="ready">
  <div class="status"><span>9:41</span><span class="system" aria-hidden="true">▮▮▮ ▰</span></div>
  <header class="guide-topbar face-measure-topbar">
    <button type="button" class="guide-back" data-action="measurement-back" aria-label="返回功能页"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg></button>
    <h1 tabindex="-1">面部心率检测</h1><img src="/brand-assets/xinmu-logo.svg" width="28" height="28" alt="心沐">
  </header>
  <main class="face-measure-main">
    <section class="face-viewfinder" aria-label="前置摄像头预览区域">
      <div class="face-camera-space"><div class="face-camera">
        <div class="face-camera-placeholder" role="img" aria-label="相机待开启"><svg viewBox="0 0 80 80" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M13 24h13l6-9h16l6 9h13a6 6 0 0 1 6 6v30a6 6 0 0 1-6 6H13a6 6 0 0 1-6-6V30a6 6 0 0 1 6-6Z"/><circle cx="40" cy="44" r="15"/><circle cx="40" cy="44" r="9"/><path d="M60 33h3"/></svg></div>
        <svg class="face-camera-photo" hidden viewBox="60 0 840 1100" preserveAspectRatio="xMidYMid meet" role="img" aria-label="前摄取景构图，面部居中">
          <defs><clipPath id="face-preview-crop"><rect x="60" y="0" width="840" height="1100"/></clipPath></defs>
          <image href="/brand-assets/op3.png" width="1254" height="1254" clip-path="url(#face-preview-crop)"/>
        </svg>
        <span class="face-camera-label">前摄预览</span>
      </div></div>
      <p class="face-camera-hint" data-face-camera-hint>点击开始检测，保持面部完整入镜</p>
    </section>
    <section class="face-data" aria-label="心率、计时与脉搏波">
    <div class="face-readout">
      <div class="face-heart">
        <div class="face-heart-label"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/></svg><h2>平均心率</h2></div>
        <div class="face-heart-value"><strong data-face-heart>--</strong><span>次/分</span></div>
      </div>
      <div class="face-timer">
        <span class="face-timer-label">检测计时</span>
        <time class="face-elapsed" data-face-time aria-label="检测计时">00:00</time>
      </div>
      <div class="face-session">
        <div class="face-capture-status" role="status"><span class="face-status-indicator" aria-hidden="true">${loadingIcon()}</span><span data-face-status>待开始</span></div>
        <p class="face-heart-hint" data-face-hint>点击开始</p>
      </div>
    </div>
    <div class="face-wave-panel" aria-labelledby="face-wave-title">
      <div class="face-wave-heading"><h2 id="face-wave-title">脉搏波</h2><span class="wave-range" data-wave-range>0.0–6.0 秒</span></div>
      <div class="face-wave pulse-wave" role="group" tabindex="0" aria-label="脉搏波，每屏六秒；左右拖动或使用方向键回看，不能缩放"></div>
      <button type="button" class="wave-live" data-wave-live aria-label="回到最新" title="回到最新" hidden><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m8 6 6 6-6 6M18 5v14"/></svg></button>
    </div>
    <footer class="face-measure-footer"><button type="button" class="cta" data-action="face-measure-toggle">开始检测</button></footer>
    </section>
  </main>
  <div class="gesture"></div>
</div>`;

/** 脉搏轮廓采用圆滑主峰与重搏波，不使用心电图的尖峰形态。 */
function pulseAt(seconds) {
  const phase = ((seconds * 1.2) % 1 + 1) % 1;
  const peak = Math.exp(-(((phase - .24) / .105) ** 2));
  const rebound = .3 * Math.exp(-(((phase - .52) / .13) ** 2));
  return peak + rebound;
}

/** 启动局部演示生命周期；结束、切页和隐藏页面时不继续绘制。 */
export function mountFaceMeasurement(root) {
  const phone = root.querySelector('.face-measurement');
  const plot = phone.querySelector('.face-wave');
  const chart = mountPulseWave(plot, pulseAt);
  const heart = phone.querySelector('[data-face-heart]');
  const hint = phone.querySelector('[data-face-hint]');
  const time = phone.querySelector('[data-face-time]');
  const status = phone.querySelector('[data-face-status]');
  const toggle = phone.querySelector('[data-action="face-measure-toggle"]');
  const photo = phone.querySelector('.face-camera-photo');
  const placeholder = phone.querySelector('.face-camera-placeholder');
  const cameraHint = phone.querySelector('[data-face-camera-hint]');
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const readings = [72, 72, 73, 72, 71, 72, 73, 74, 73, 72];
  let phase = 'ready';
  let startedAt = performance.now();
  let hiddenAt = document.hidden ? startedAt : null;
  let elapsed = 0;
  let frame = 0;
  let lastDraw = -Infinity;
  let lastSecond = -1;
  let readingCount = 0;
  let readingTotal = 0;

  /** 追加已产生的采样；获取信号前保持空白，历史采样不再改写。 */
  function draw() {
    if (elapsed >= 3) chart.update(elapsed - 3);
  }

  /** 容器缩放时由 ECharts 同步坐标系和渲染尺寸。 */
  function resize() {
    chart.resize();
  }

  /** 每两秒纳入读数；窗口按屏幕帧率刷新，减少动态效果时每秒刷新。 */
  function tick(now) {
    elapsed = (now - startedAt) / 1000;
    const second = Math.floor(elapsed);
    if (second !== lastSecond) {
      lastSecond = second;
      time.textContent = `${String(Math.floor(second / 60)).padStart(2, '0')}:${String(second % 60).padStart(2, '0')}`;
      const availableReadings = second < 3 ? 0 : Math.floor((second - 3) / 2) + 1;
      while (readingCount < availableReadings) {
        readingTotal += readings[readingCount % readings.length];
        readingCount += 1;
      }
      heart.textContent = readingCount ? String(Math.round(readingTotal / readingCount)) : '--';
      hint.textContent = second < 3 ? '获取信号中' : '保持稳定';
    }
    if (now - lastDraw >= (motion.matches ? 1000 : 0)) {
      draw();
      lastDraw = now;
    }
    frame = requestAnimationFrame(tick);
  }

  /** 初始态等待点击；结束冻结均值，重新检测清空读数与波形。 */
  function toggleMeasurement() {
    phase = phase === 'running' ? 'ended' : 'running';
    phone.dataset.phase = phase;
    status.textContent = phase === 'running' ? '检测中' : '已结束';
    toggle.textContent = phase === 'running' ? '结束检测' : '重新检测';
    if (phase === 'ended') {
      cancelAnimationFrame(frame);
      hint.textContent = '检测已结束';
      draw();
      return;
    }
    photo.removeAttribute('hidden');
    placeholder.hidden = true;
    cameraHint.textContent = '面部完整入镜，保持自然静止';
    startedAt = performance.now();
    hiddenAt = document.hidden ? startedAt : null;
    elapsed = 0;
    lastSecond = -1;
    lastDraw = -Infinity;
    readingCount = 0;
    readingTotal = 0;
    heart.textContent = '--';
    time.textContent = '00:00';
    hint.textContent = '获取信号中';
    chart.reset();
    draw();
    if (!document.hidden) frame = requestAnimationFrame(tick);
  }

  /** 页面隐藏时暂停时钟，重新可见后从原进度继续。 */
  function visibilityChanged() {
    if (document.hidden) {
      hiddenAt = performance.now();
      cancelAnimationFrame(frame);
    } else if (hiddenAt !== null) {
      startedAt += performance.now() - hiddenAt;
      hiddenAt = null;
      if (phase === 'running') frame = requestAnimationFrame(tick);
    }
  }

  const observer = new ResizeObserver(resize);
  observer.observe(plot);
  toggle.addEventListener('click', toggleMeasurement);
  document.addEventListener('visibilitychange', visibilityChanged);
  motion.addEventListener('change', draw);
  phone.querySelector('h1').focus({ preventScroll: true });
  return () => {
    cancelAnimationFrame(frame);
    observer.disconnect();
    toggle.removeEventListener('click', toggleMeasurement);
    document.removeEventListener('visibilitychange', visibilityChanged);
    motion.removeEventListener('change', draw);
    chart.dispose();
  };
}
