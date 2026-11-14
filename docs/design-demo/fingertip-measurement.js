/** 指尖检测的纯本地流程演示；覆盖程度、取景和脉搏波均为模拟，不产生健康指标。 */
import { mountPulseWave } from './pulse-wave.js';

/** 背面沿用功能页的持机轮廓，正面补充稳定握持；插图不代表实时采集状态。 */
const fingertipInstructions = `<div class="finger-guidance" id="finger-guidance" role="group" aria-label="第 1 页，共 2 页：流程说明">
  <figure class="finger-step">
    <svg class="finger-step-art" viewBox="15 0 80 128" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="guide-back-skin" x1="440" y1="400" x2="700" y2="1540" gradientUnits="userSpaceOnUse"><stop stop-color="var(--illustration-skin-light)"/><stop offset="1" stop-color="var(--illustration-skin)"/></linearGradient>
        <linearGradient id="guide-back-phone" x2="1" y2="1"><stop stop-color="var(--illustration-teal-light)"/><stop offset="1" stop-color="var(--mint)"/></linearGradient>
      </defs>
      <ellipse cx="56" cy="122" rx="30" ry="3" fill="var(--brand-subtle)"/>
      <g transform="translate(18 -8) scale(.075)">
        <rect x="224" y="258" width="632" height="1200" rx="100" fill="var(--surface)"/>
        <rect x="235" y="270" width="610" height="1180" rx="90" fill="url(#guide-back-phone)" stroke="var(--illustration-camera-rim)" stroke-width="13"/>
        <rect x="350" y="350" width="390" height="390" rx="110" fill="var(--illustration-camera-rim)"/>
        <g fill="var(--illustration-camera)" stroke="var(--illustration-blue-light)" stroke-width="12"><circle cx="450" cy="450" r="55"/><circle cx="620" cy="480" r="55"/><circle cx="450" cy="620" r="55"/><circle cx="620" cy="620" r="55"/></g>
        <rect x="534" y="400" width="22" height="50" rx="11" fill="var(--illustration-flash)" stroke="var(--surface)" stroke-width="7"/>
        <circle class="finger-cover-feedback" cx="450" cy="450" r="90" stroke="var(--primary)" stroke-width="20"/>
        <g class="finger-back-hand">
          <path d="M110 1568c20-178 11-348 25-478 4-80 55-125 80-195 10-37 26-65 38-56 21 19 5 127 27 264 41-106 64-214 75-345l38-264c8-65 17-113 59-117 45-5 69 33 69 91l-8 387c-1 64 22 96 51 96 38-2 69-30 105-72l86-116c35-63 60-141 78-197 13-32 39-16 54 16 44 78 37 172-5 279 53 23 97 121 63 180 8 77-45 139-81 206-33 53-74 91-91 163l-42 158Z" fill="url(#guide-back-skin)" stroke="var(--surface)" stroke-width="24" stroke-linejoin="round"/>
          <rect x="431" y="394" width="70" height="95" rx="32" fill="var(--illustration-skin-light)" transform="rotate(-5 466 442)"/>
        </g>
      </g>
    </svg>
    <figcaption><h2>轻覆后置镜头</h2><p>指腹轻放，不要按压</p></figcaption>
  </figure>
  <figure class="finger-step">
    <svg class="finger-step-art" viewBox="15 0 80 128" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="guide-front-skin" x1="34" y1="54" x2="80" y2="120" gradientUnits="userSpaceOnUse"><stop stop-color="var(--illustration-skin-light)"/><stop offset="1" stop-color="var(--illustration-skin)"/></linearGradient>
        <linearGradient id="guide-front-phone" x2="1" y2="1"><stop stop-color="var(--illustration-teal-light)"/><stop offset="1" stop-color="var(--mint)"/></linearGradient>
      </defs>
      <ellipse cx="56" cy="122" rx="30" ry="3" fill="var(--brand-subtle)"/>
      <path d="M42 119c-2-9-16-18-16-29v-4c0-5 5-7 9-3l7 5 21-5c12-3 22 0 22 10 0 10-6 18-10 26Z" fill="url(#guide-front-skin)" stroke="var(--surface)" stroke-width="2" stroke-linejoin="round" transform="translate(120 0) scale(-1 1)"/>
      <path d="M26 86V72c0-8 8-9 10-2l5 18c2 7 1 12-2 17" fill="url(#guide-front-skin)" stroke="var(--surface)" stroke-width="2" stroke-linecap="round" transform="translate(120 0) scale(-1 1)"/>
      <rect x="33" y="12" width="54" height="96" rx="9" fill="var(--surface)"/>
      <rect x="35" y="14" width="50" height="92" rx="8" fill="url(#guide-front-phone)" stroke="var(--illustration-camera-rim)" stroke-width="1"/>
      <rect x="38" y="17" width="44" height="86" rx="6" fill="var(--surface)"/>
      <rect x="50" y="20" width="20" height="4" rx="2" fill="var(--illustration-camera)"/>
      <circle cx="60" cy="57" r="15" fill="var(--brand-subtle)"/>
      <circle class="finger-front-feedback" cx="60" cy="57" r="18" stroke="var(--primary)" stroke-width="2" stroke-dasharray="83 30" transform="rotate(-90 60 57)"/>
      <path d="M52 80h16m-12 5h8" stroke="var(--illustration-camera-rim)" stroke-width="2" stroke-linecap="round"/>
      <g fill="url(#guide-front-skin)" stroke="var(--surface)" stroke-width="1.6" transform="translate(120 0) scale(-1 1)">
        <rect x="80" y="58" width="12" height="18" rx="6" transform="rotate(12 86 67)"/>
        <rect x="80" y="75" width="12" height="17" rx="6" transform="rotate(12 86 83.5)"/>
        <rect x="78" y="91" width="12" height="15" rx="6" transform="rotate(12 84 98.5)"/>
      </g>
    </svg>
    <figcaption><h2>正面稳住手机</h2><p>自然呼吸，保持稳定</p></figcaption>
  </figure>
</div>`;

/** 圆形取景延续引导页构图，覆盖环与检测倒计时各自表达独立状态。 */
export const fingertipMeasurementPage = `<div class="phone fingertip-measurement" data-phase="ready">
  <div class="status"><span>9:41</span><span class="system" aria-hidden="true">▮▮▮ ▰</span></div>
  <header class="guide-topbar face-measure-topbar">
    <button type="button" class="guide-back" data-action="navigate" data-route="measure-fingertip" aria-label="返回指尖检测引导"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg></button>
    <h1 tabindex="-1">指尖检测</h1><img src="/brand-assets/xinmu-logo.svg" width="28" height="28" alt="心沐">
  </header>
  <main class="finger-main">
    <section class="finger-viewfinder" aria-label="模拟后置摄像头预览">
      <div class="finger-camera-wrap">
        <div class="finger-camera">
          <div class="finger-camera-covered" aria-hidden="true"></div>
          <div class="finger-camera-description" role="img" aria-label="模拟后摄预览，等待指尖覆盖"></div>
          <p class="finger-camera-notice"><span data-finger-camera-hint>请将指腹轻覆后置摄像头</span></p>
        </div>
        <svg class="finger-coverage-ring" viewBox="0 0 300 300" aria-hidden="true">
          <defs><linearGradient id="finger-coverage-gradient" x1="0" y1=".37" x2="1" y2=".63" gradientTransform="rotate(90 .5 .5)"><stop stop-color="var(--primary)"/><stop offset="1" stop-color="var(--mint)"/></linearGradient></defs>
          <circle class="finger-ring-track" cx="150" cy="150" r="143"/>
          <circle class="finger-ring-fill" cx="150" cy="150" r="143" pathLength="100" stroke="url(#finger-coverage-gradient)" stroke-dasharray="100" stroke-dashoffset="100"/>
        </svg>
        <div class="finger-coverage" role="progressbar" aria-label="模拟指尖覆盖程度" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><strong data-finger-coverage>0%</strong></div>
      </div>
    </section>
    <section class="finger-data" aria-label="操作提示与检测进度">
      <div class="finger-session"><div class="finger-status-group"><div class="face-capture-status finger-state" role="status"><span class="face-status-indicator" aria-hidden="true"></span><span data-finger-status>准备检测</span></div><p class="finger-status-hint" data-finger-status-hint>指腹轻放，不要按压</p></div><div class="finger-countdown"><span>剩余时间</span><time data-finger-time>00:30</time></div></div>
      <div class="finger-carousel" role="region" aria-label="流程说明与脉搏波">
        <div class="finger-panel-slot" tabindex="0" aria-label="左右滑动或使用方向键切换内容">
          ${fingertipInstructions}
          <div class="finger-wave-panel" id="finger-wave-panel" role="group" aria-label="第 2 页，共 2 页：脉搏波" inert><div class="face-wave-heading"><h2>脉搏波</h2><span class="wave-range" data-wave-range>0.0–6.0 秒</span></div><div class="finger-wave pulse-wave" role="group" tabindex="0" aria-label="模拟脉搏波，每屏六秒；左右拖动或使用方向键回看，不能缩放"></div><button type="button" class="wave-live" data-wave-live aria-label="回到最新" title="回到最新" hidden><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m8 6 6 6-6 6M18 5v14"/></svg></button></div>
        </div>
        <div class="finger-pagination" role="group" aria-label="切换底部内容">
          <button type="button" data-finger-page="0" aria-label="查看流程说明" aria-controls="finger-guidance" aria-current="true" title="流程说明"></button>
          <button type="button" data-finger-page="1" aria-label="查看脉搏波" aria-controls="finger-wave-panel" title="脉搏波"></button>
        </div>
      </div>
    </section>
  </main>
  <div class="gesture"></div>
</div>`;

/** 以平滑主峰和重搏波呈现 PPG 轮廓，沿用面部检测的波形风格。 */
function pulseAt(seconds) {
  const phase = ((seconds * 1.2) % 1 + 1) % 1;
  return Math.exp(-(((phase - .24) / .105) ** 2)) + .3 * Math.exp(-(((phase - .52) / .13) ** 2));
}

/** 管理放置、覆盖确认、30 秒检测与完成；离页释放，隐藏时暂停。 */
export function mountFingertipMeasurement(root) {
  const phone = root.querySelector('.fingertip-measurement');
  const coverage = phone.querySelector('.finger-coverage');
  const coverageValue = phone.querySelector('[data-finger-coverage]');
  const ring = phone.querySelector('.finger-ring-fill');
  const camera = phone.querySelector('.finger-camera-description');
  const cameraHint = phone.querySelector('[data-finger-camera-hint]');
  const status = phone.querySelector('[data-finger-status]');
  const time = phone.querySelector('[data-finger-time]');
  const button = root.ownerDocument.querySelector('[data-finger-toggle]');
  const missingButton = root.ownerDocument.querySelector('[data-finger-missing]');
  const guidance = phone.querySelector('.finger-guidance');
  const wavePanel = phone.querySelector('.finger-wave-panel');
  const carousel = phone.querySelector('.finger-carousel');
  const panelSlot = phone.querySelector('.finger-panel-slot');
  const pageButtons = [...phone.querySelectorAll('[data-finger-page]')];
  const statusHint = phone.querySelector('[data-finger-status-hint]');
  const plot = phone.querySelector('.finger-wave');
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  let phase = 'ready';
  let startedAt = 0;
  let hiddenAt = null;
  let elapsed = 0;
  let frame = 0;
  let lastDraw = -Infinity;
  let lastCoverage = -1;
  let chart;
  let selectedPage = 0;

  /** 原生横向滚动同时支持触摸和触控板；减少动态效果时直接定位。 */
  function showPage(index) {
    panelSlot.scrollTo({ left: index * panelSlot.clientWidth, behavior: motion.matches ? 'instant' : 'smooth' });
  }

  /** 选中标识跟随实际滚动位置，非当前页仅隔离交互和读屏，不隐藏滑动中的内容。 */
  function syncPage() {
    const nextPage = Math.round(panelSlot.scrollLeft / panelSlot.clientWidth);
    if (nextPage === selectedPage) return;
    selectedPage = nextPage;
    guidance.inert = selectedPage !== 0;
    wavePanel.inert = selectedPage !== 1;
    pageButtons.forEach((control, index) => {
      if (index === selectedPage) control.setAttribute('aria-current', 'true');
      else control.removeAttribute('aria-current');
    });
    if (selectedPage === 1) {
      ensureChart();
      draw();
    }
  }

  /** 分页标识提供滑动之外的点击入口。 */
  function selectPage(event) {
    const control = event.target.closest('[data-finger-page]');
    if (control) showPage(Number(control.dataset.fingerPage));
  }

  /** 方向键和首尾键切页；在分页按钮上操作时保持焦点与目标页一致。 */
  function pageKeydown(event) {
    let index;
    if (event.key === 'ArrowLeft') index = Math.max(0, selectedPage - 1);
    else if (event.key === 'ArrowRight') index = Math.min(1, selectedPage + 1);
    else if (event.key === 'Home') index = 0;
    else if (event.key === 'End') index = 1;
    else return;
    event.preventDefault();
    showPage(index);
    if (event.target.matches('[data-finger-page]')) pageButtons[index].focus({ preventScroll: true });
  }

  /** 图表按需初始化；完整历史及六秒回看窗口由共用控制器维护。 */
  function ensureChart() {
    if (chart) return;
    chart = mountPulseWave(plot, pulseAt);
  }

  /** 按检测时钟追加模拟采样，不改写已有样点。 */
  function draw() {
    if (!chart) return;
    if (phase === 'running' || phase === 'completed') chart.update(elapsed);
  }

  /** 外环始终只代表覆盖程度，不复用为检测耗时进度。 */
  function setCoverage(value) {
    if (value === lastCoverage) return;
    if (phase === 'covering') {
      if (value === 100) {
        cameraHint.textContent = '已完全覆盖，即将开始检测';
        status.textContent = '准备开始';
        statusHint.textContent = '保持轻覆，检测即将开始';
      } else if (value > 0 && lastCoverage <= 0) {
        cameraHint.textContent = '手指未完全覆盖镜头，请调整位置';
        status.textContent = '调整手指';
        statusHint.textContent = '让指腹完整覆盖后置镜头';
      }
    }
    lastCoverage = value;
    coverage.setAttribute('aria-valuenow', String(value));
    coverageValue.textContent = `${value}%`;
    ring.style.strokeDashoffset = String(100 - value);
    phone.style.setProperty('--finger-cover-opacity', String(value / 100));
  }

  /** 覆盖填满后进入检测态，计时从此刻开始，不包含放置等待。 */
  function startMeasurement(now) {
    phase = 'running';
    phone.dataset.phase = phase;
    startedAt = now;
    elapsed = 0;
    showPage(1);
    camera.setAttribute('aria-label', '模拟后摄预览，指尖已完整覆盖镜头');
    cameraHint.textContent = '正在检测，请勿移动手指';
    status.textContent = '检测中';
    statusHint.textContent = '自然呼吸，保持手指稳定';
    ensureChart();
    chart.resize();
    draw();
  }

  /** 完成后保留满覆盖环、零秒计时与最后的波形，不生成指标结果。 */
  function completeMeasurement() {
    phase = 'completed';
    phone.dataset.phase = phase;
    status.textContent = '检测完成';
    cameraHint.textContent = '检测完成，可以移开手指';
    statusHint.textContent = '本次检测已结束';
    button.disabled = false;
    draw();
  }

  /** 覆盖确认保留短暂停顿，确保 100% 可见后再开始独立的 30 秒计时。 */
  function tick(now) {
    if (phase === 'covering') {
      const coveringTime = now - startedAt;
      setCoverage(Math.min(100, Math.floor(coveringTime / 24)));
      if (coveringTime >= 2800) startMeasurement(now);
    } else if (phase === 'running') {
      elapsed = Math.min(30, (now - startedAt) / 1000);
      time.textContent = `00:${String(Math.ceil(30 - elapsed)).padStart(2, '0')}`;
      if (elapsed >= 30) {
        completeMeasurement();
        return;
      }
      if (now - lastDraw >= (motion.matches ? 1000 : 0)) {
        draw();
        lastDraw = now;
      }
    }
    frame = requestAnimationFrame(tick);
  }

  /** 在等待阶段预览未识别到手指的提示，不自动超时或启动检测。 */
  function simulateMissingFinger() {
    if (phase !== 'ready') return;
    cameraHint.textContent = '未检测到手指，请按示例放置手指，或切换摄像头';
    statusHint.textContent = '按下方示例调整手指位置';
  }

  /** 重测回到放置步骤，清空旧波形；每次均需再次模拟覆盖确认。 */
  function toggleMeasurement() {
    if (phase === 'completed') {
      phase = 'ready';
      phone.dataset.phase = phase;
      setCoverage(0);
      camera.setAttribute('aria-label', '模拟后摄预览，等待指尖覆盖');
      cameraHint.textContent = '请将指腹轻覆后置摄像头';
      status.textContent = '准备检测';
      time.textContent = '00:30';
      showPage(0);
      statusHint.textContent = '指腹轻放，不要按压';
      missingButton.disabled = false;
      elapsed = 0;
      chart.reset();
      return;
    }
    if (phase !== 'ready') return;
    phase = 'covering';
    phone.dataset.phase = phase;
    cameraHint.textContent = '请将指腹轻覆后置摄像头';
    missingButton.disabled = true;
    status.textContent = '准备检测';
    statusHint.textContent = '指腹轻放，不要按压';
    button.disabled = true;
    startedAt = performance.now();
    hiddenAt = document.hidden ? startedAt : null;
    lastDraw = -Infinity;
    if (!document.hidden) frame = requestAnimationFrame(tick);
  }

  /** 隐藏标签页时暂停覆盖和检测时钟，返回后从原进度继续。 */
  function visibilityChanged() {
    if (document.hidden) {
      hiddenAt = performance.now();
      cancelAnimationFrame(frame);
    } else if (hiddenAt !== null) {
      startedAt += performance.now() - hiddenAt;
      hiddenAt = null;
      if (phase === 'covering' || phase === 'running') frame = requestAnimationFrame(tick);
    }
  }

  /** 容器可见且尺寸变化时同步调整图表。 */
  function resize() {
    panelSlot.scrollTo({ left: selectedPage * panelSlot.clientWidth, behavior: 'instant' });
    chart?.resize();
  }

  const observer = new ResizeObserver(resize);
  observer.observe(plot);
  observer.observe(panelSlot);
  panelSlot.addEventListener('scroll', syncPage, { passive: true });
  carousel.addEventListener('click', selectPage);
  carousel.addEventListener('keydown', pageKeydown);
  button.hidden = false;
  button.disabled = false;
  button.addEventListener('click', toggleMeasurement);
  missingButton.hidden = false;
  missingButton.disabled = false;
  missingButton.addEventListener('click', simulateMissingFinger);
  document.addEventListener('visibilitychange', visibilityChanged);
  motion.addEventListener('change', draw);
  phone.querySelector('h1').focus({ preventScroll: true });
  return () => {
    cancelAnimationFrame(frame);
    observer.disconnect();
    panelSlot.removeEventListener('scroll', syncPage);
    carousel.removeEventListener('click', selectPage);
    carousel.removeEventListener('keydown', pageKeydown);
    button.removeEventListener('click', toggleMeasurement);
    button.hidden = true;
    missingButton.removeEventListener('click', simulateMissingFinger);
    missingButton.hidden = true;
    document.removeEventListener('visibilitychange', visibilityChanged);
    motion.removeEventListener('change', draw);
    chart?.dispose();
  };
}
