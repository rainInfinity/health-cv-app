/** 指尖与血压检测的本地覆盖、分页和计时演示；不产生健康指标。 */
import { mountPulseWave } from './pulse-wave.js';
import { chestInstructions, fingertipInstructions, rearCameraIllustration } from './contact-illustrations.js';


/** 共用预览与覆盖环；血压第二页展示贴胸动作，不挂载脉搏波。 */
function contactMeasurementPage(isBloodPressure) {
  return `<div class="phone contact-measurement ${isBloodPressure ? 'blood-pressure-measurement' : 'fingertip-measurement'}" data-phase="ready">
  <div class="status"><span>9:41</span><span class="system" aria-hidden="true">▮▮▮ ▰</span></div>
  <header class="guide-topbar face-measure-topbar">
    <button type="button" class="guide-back" data-action="navigate" data-route="measure-${isBloodPressure ? 'chest' : 'fingertip'}" aria-label="返回${isBloodPressure ? '血压' : '指尖'}检测引导"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg></button>
    <h1 tabindex="-1">${isBloodPressure ? '血压检测' : '指尖检测'}</h1><img src="/brand-assets/xinmu-logo.svg" width="28" height="28" alt="心沐">
  </header>
  <main class="finger-main">
    <section class="finger-viewfinder" aria-label="模拟后置摄像头预览">
      <div class="finger-camera-wrap">
        <div class="finger-camera">
          <div class="finger-camera-covered" aria-hidden="true"></div>
          <div class="finger-camera-description" role="img" aria-label="模拟后摄预览，等待指尖覆盖"></div>
          <p class="finger-camera-notice"><span data-finger-camera-hint>手指未完全覆盖镜头，请调整位置</span></p>
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
      <div class="finger-carousel" role="region" aria-label="${isBloodPressure ? '指尖覆盖与贴靠胸口指引' : '流程说明与脉搏波'}">
        <div class="finger-panel-slot" tabindex="0" aria-label="左右滑动或使用方向键切换内容">
          ${fingertipInstructions}
          ${isBloodPressure ? chestInstructions : `<div class="finger-wave-panel" id="finger-wave-panel" role="group" aria-label="第 2 页，共 2 页：脉搏波" inert><div class="face-wave-heading"><h2>脉搏波</h2><span class="wave-range" data-wave-range>0.0–6.0 秒</span></div><div class="finger-wave pulse-wave" role="group" tabindex="0" aria-label="模拟脉搏波，每屏六秒；左右拖动或使用方向键回看，不能缩放"></div><button type="button" class="wave-live" data-wave-live aria-label="回到最新" title="回到最新" hidden><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m8 6 6 6-6 6M18 5v14"/></svg></button></div>`}
        </div>
        <div class="finger-pagination" role="group" aria-label="切换底部内容">
          <button type="button" data-finger-page="0" aria-label="查看${isBloodPressure ? '指尖放置' : '流程说明'}" aria-controls="finger-guidance" aria-current="true" title="${isBloodPressure ? '指尖放置' : '流程说明'}"></button>
          <button type="button" data-finger-page="1" aria-label="查看${isBloodPressure ? '贴胸指引' : '脉搏波'}" aria-controls="${isBloodPressure ? 'chest-guidance' : 'finger-wave-panel'}" title="${isBloodPressure ? '贴胸指引' : '脉搏波'}"></button>
        </div>
      </div>
    </section>
  </main>
  <div class="gesture"></div>
</div>`;
}

/** 指尖保留说明与实时脉搏波两页。 */
export const fingertipMeasurementPage = contactMeasurementPage(false);
/** 血压以指尖放置与手机贴胸作为两个操作阶段。 */
export const bloodPressureMeasurementPage = contactMeasurementPage(true);

/** 以平滑主峰和重搏波呈现 PPG 轮廓，沿用面部检测的波形风格。 */
function pulseAt(seconds) {
  const phase = ((seconds * 1.2) % 1 + 1) % 1;
  return Math.exp(-(((phase - .24) / .105) ** 2)) + .3 * Math.exp(-(((phase - .52) / .13) ** 2));
}

/** 共用覆盖确认与倒计时；血压覆盖丢失时退回指尖放置并复位本轮。 */
export function mountContactMeasurement(root, showMissingFingerGuide) {
  const phone = root.querySelector('.contact-measurement');
  const isBloodPressure = phone.classList.contains('blood-pressure-measurement');
  const coverage = phone.querySelector('.finger-coverage');
  const coverageValue = phone.querySelector('[data-finger-coverage]');
  const ring = phone.querySelector('.finger-ring-fill');
  const camera = phone.querySelector('.finger-camera-description');
  const cameraHint = phone.querySelector('[data-finger-camera-hint]');
  const status = phone.querySelector('[data-finger-status]');
  const time = phone.querySelector('[data-finger-time]');
  const button = root.ownerDocument.querySelector('[data-finger-toggle]');
  const missingButton = root.ownerDocument.querySelector('[data-finger-missing]');
  const uncoverButton = root.ownerDocument.querySelector('[data-finger-uncover]');
  const chestButton = root.ownerDocument.querySelector('[data-chest-contact]');
  const carousel = phone.querySelector('.finger-carousel');
  const panelSlot = phone.querySelector('.finger-panel-slot');
  const panels = [...panelSlot.children];
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
    panels.forEach((panel, index) => { panel.inert = selectedPage !== index; });
    pageButtons.forEach((control, index) => {
      if (index === selectedPage) control.setAttribute('aria-current', 'true');
      else control.removeAttribute('aria-current');
    });
    if (selectedPage === 1 && plot) {
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
        cameraHint.textContent = isBloodPressure ? '已完全覆盖，请保持稳定' : '已完全覆盖，即将开始检测';
        status.textContent = isBloodPressure ? '准备贴靠' : '准备开始';
        statusHint.textContent = isBloodPressure ? '指尖覆盖稳定后，请贴靠胸口' : '保持轻覆，检测即将开始';
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

  /** 指尖稳定后等待贴胸，不消耗正式检测时长。 */
  function awaitChestContact() {
    phase = 'awaiting-chest';
    phone.dataset.phase = phase;
    showPage(1);
    cameraHint.textContent = '保持手指覆盖，将手机轻贴胸口';
    status.textContent = '贴靠胸口';
    statusHint.textContent = '靠近心脏，轻贴并保持稳定';
    chestButton.disabled = false;
  }

  /** 血压需指尖稳定并确认贴胸后开始，指尖检测沿用覆盖后自动开始。 */
  function startMeasurement(now) {
    phase = 'running';
    phone.dataset.phase = phase;
    startedAt = now;
    elapsed = 0;
    showPage(1);
    camera.setAttribute('aria-label', '模拟后摄预览，指尖已完整覆盖镜头');
    cameraHint.textContent = isBloodPressure ? '正在检测，保持手指覆盖和贴胸稳定' : '正在检测，请勿移动手指';
    status.textContent = '检测中';
    statusHint.textContent = isBloodPressure ? '保持贴胸，自然呼吸' : '自然呼吸，保持手指稳定';
    chestButton.disabled = true;
    if (plot) {
      ensureChart();
      chart.resize();
      draw();
    }
  }

  /** 外部贴胸操作仅在指尖稳定后有效，从本次操作开始完整计时。 */
  function simulateChestContact() {
    if (!isBloodPressure || phase !== 'awaiting-chest') return;
    startMeasurement(performance.now());
    frame = requestAnimationFrame(tick);
  }

  /** 完成后冻结本轮展示，不生成指标结果。 */
  function completeMeasurement() {
    phase = 'completed';
    phone.dataset.phase = phase;
    status.textContent = '检测完成';
    cameraHint.textContent = '检测完成，可以移开手指';
    statusHint.textContent = '本次检测已结束';
    button.disabled = false;
    uncoverButton.disabled = true;
    draw();
  }

  /** 覆盖确认保留短暂停顿，血压随后等待贴胸，指尖直接开始计时。 */
  function tick(now) {
    if (phase === 'covering') {
      const coveringTime = now - startedAt;
      setCoverage(Math.min(100, Math.floor(coveringTime / 24)));
      if (coveringTime >= 2800) {
        if (isBloodPressure) {
          awaitChestContact();
          return;
        }
        startMeasurement(now);
      }
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

  /** 血压流程失去覆盖即退回第一阶段，重新完成覆盖和贴胸后开始完整一轮。 */
  function simulateUncoveredFinger() {
    if (!isBloodPressure || (phase !== 'covering' && phase !== 'awaiting-chest' && phase !== 'running')) return;
    cancelAnimationFrame(frame);
    phase = 'ready';
    phone.dataset.phase = phase;
    elapsed = 0;
    hiddenAt = null;
    setCoverage(0);
    time.textContent = '00:30';
    camera.setAttribute('aria-label', '模拟后摄预览，等待指尖重新覆盖');
    cameraHint.textContent = '手指覆盖不足，请重新轻覆镜头';
    status.textContent = '调整手指';
    statusHint.textContent = '完整覆盖后，再将手机贴靠胸口';
    showPage(0);
    button.disabled = false;
    missingButton.disabled = false;
    uncoverButton.disabled = true;
    chestButton.disabled = true;
  }

  /** 外部入口预览长时间未放置的指导，不自动超时或启动检测。 */
  function simulateMissingFinger() {
    if (phase !== 'ready') return;
    cameraHint.textContent = '未检测到手指，请按示例放置手指，或切换摄像头';
    statusHint.textContent = '请调整手指放置的镜头';
    showMissingFingerGuide('未检测到手指', `<div class="finger-missing-guide">
      <p>请按示例放置；若已放好仍无反应，试着换一颗后置镜头。</p>
      <div class="finger-missing-examples">
        <figure class="finger-step">${rearCameraIllustration('missing-place')}<figcaption><h3>轻覆后置镜头</h3><p>指腹贴合，不要按压</p></figcaption></figure>
        <figure class="finger-step">${rearCameraIllustration('missing-switch', true)}<figcaption><h3>换一颗后置镜头</h3><p>移到另一颗镜头上轻覆</p></figcaption></figure>
      </div>
      <button type="button" class="cta" data-action="close-sheet">我已知晓</button>
    </div>`);
  }

  /** 重测清空本轮展示；每次均需再次模拟覆盖确认。 */
  function toggleMeasurement() {
    if (phase === 'completed') {
      phase = 'ready';
      phone.dataset.phase = phase;
      setCoverage(0);
      camera.setAttribute('aria-label', '模拟后摄预览，等待指尖覆盖');
      cameraHint.textContent = '手指未完全覆盖镜头，请调整位置';
      status.textContent = '准备检测';
      time.textContent = '00:30';
      showPage(0);
      statusHint.textContent = '指腹轻放，不要按压';
      missingButton.disabled = false;
      elapsed = 0;
      chart?.reset();
      return;
    }
    if (phase !== 'ready') return;
    phase = 'covering';
    phone.dataset.phase = phase;
    cameraHint.textContent = '手指未完全覆盖镜头，请调整位置';
    missingButton.disabled = true;
    status.textContent = '准备检测';
    statusHint.textContent = '指腹轻放，不要按压';
    button.disabled = true;
    uncoverButton.disabled = !isBloodPressure;
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
  if (plot) observer.observe(plot);
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
  uncoverButton.hidden = !isBloodPressure;
  uncoverButton.disabled = true;
  uncoverButton.addEventListener('click', simulateUncoveredFinger);
  chestButton.hidden = !isBloodPressure;
  chestButton.disabled = true;
  chestButton.addEventListener('click', simulateChestContact);
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
    uncoverButton.removeEventListener('click', simulateUncoveredFinger);
    uncoverButton.hidden = true;
    chestButton.removeEventListener('click', simulateChestContact);
    chestButton.hidden = true;
    document.removeEventListener('visibilitychange', visibilityChanged);
    motion.removeEventListener('change', draw);
    chart?.dispose();
  };
}
