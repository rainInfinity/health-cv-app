/** 血压简要结果与详细报告的固定设计样例，不调用算法或医学分级。 */
import { icon } from './ui.js';
import { mountResultWave, processedPpgSamples, resultWaveCard } from './result-wave.js';
import { resultReportForState, resultSummaryForState } from './result-states.js';

/** 本轮固定展示内容；参考区间和分段条不驱动前端判定。 */
const result = {
  /** 检测日期与时间，不随预览时间漂移。 */
  time: '2026年10月31日 08:30',
  /** 固定评估文案，不根据读数计算。 */
  assessment: '血压正常',
  /** 血压算法的信号质量，满分 100 分，不表示医学准确率。 */
  qualityScore: 82,
  /** 两项估计血压及参考区间，单位均为 mmHg。 */
  readings: [
    { label: '收缩压', value: 118, reference: '90–139', text: '心脏收缩时，血液对动脉血管壁产生的压力。本次估计收缩压处于参考范围内。' },
    { label: '舒张压', value: 73, reference: '60–89', text: '心脏舒张时，动脉血管内维持的压力。本次估计舒张压处于参考范围内。' },
  ],
};

/** 两处结果共用同一主卡；标记固定在正常区，不模拟连续医学刻度。 */
function pressureOverview() {
  return `<section class="pressure-result-card" aria-label="本次血压估计结果">
    <div class="pressure-result-scale" role="img" aria-label="血压分为偏低、正常、偏高三个参考区间，本次固定样例位于正常区间">
      <div class="pressure-scale-reference">
        <div class="pressure-scale-limits">
          <div class="pressure-scale-limit"><span><strong>90/60</strong></span></div>
          <div class="pressure-scale-limit"><span><strong>140/90</strong></span></div>
        </div>
        <div class="pressure-scale-labels"><span>偏低</span><span>正常</span><span>偏高</span></div>
      </div>
      <div class="pressure-scale-bands"><span></span><span></span><span></span></div>
      <div class="pressure-scale-marker"><span>本次结果</span></div>
    </div>
    <p class="pressure-result-assessment">${result.assessment}</p>
    <div class="pressure-reading-heading"><span>估计血压值</span><span>信号质量 ${result.qualityScore} 分</span></div>
    <div class="pressure-result-readings">${result.readings.map((item) => `<div><h4>${item.label}<span>mmHg</span></h4><strong>${item.value}</strong><p>正常区间 ${item.reference}</p></div>`).join('')}</div>
  </section>`;
}

/** 沿用接触式检测的底部结果面板和操作入口。 */
export const bloodPressureSummary = `<div class="finger-result-content" hidden>
  <button type="button" class="result-close" data-result-close aria-label="收起检测结果">${icon('caret')}</button>
  <div class="result-body">
    <header class="result-completion"><div class="result-completion-title"><span class="result-complete-mark" data-result-success aria-hidden="true"></span><h2 id="pressure-result-title">检测完成</h2></div><p>可以移开手指，将手机放下</p><time>${result.time}</time></header>
    ${pressureOverview()}
    <p class="result-disclaimer">检测结果仅供健康管理参考，不能替代医学诊断。</p>
    <div class="result-actions"><button type="button" class="cta" data-result-details>查看详细结果 ${icon('arrow')}</button><button type="button" class="result-text-button" data-result-restart>重新检测</button></div>
  </div>
</div>`;

/** 独立血压报告沿用指尖的总览和解读层级，展示处理后 PPG 与 SCG，不提供校准。 */
export const bloodPressureResultsPage = `<div class="phone blood-pressure-results">
  <div class="status"><span>9:41</span><span class="system" aria-hidden="true">▮▮▮ ▰</span></div>
  <header class="guide-topbar result-topbar"><button type="button" class="guide-back" data-action="navigate" data-route="blood-pressure-measurement" aria-label="返回本次检测结果"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg></button><h1 tabindex="-1">详细结果</h1><img src="/brand-assets/xinmu-logo.svg" width="28" height="28" alt="心沐"></header>
  <main class="result-report">
    <header class="result-report-heading result-section-heading"><h2>结果总览</h2><time>${result.time}</time></header>
    <p class="result-disclaimer">检测结果仅供健康管理参考，不能替代医学诊断。如有持续不适，请及时就医。</p>
    ${pressureOverview()}
    <p class="result-quality-note">信号质量评分满分 100 分，用于反映本次采集信号的质量，不代表血压估计的准确率。</p>
    ${resultWaveCard('pressure-ppg', 'PPG 脉搏波')}
    ${resultWaveCard('pressure-scg', 'SCG 心震波')}
    <section class="result-interpretations" aria-labelledby="pressure-interpretation-title">
      <div class="result-section-heading"><h2 id="pressure-interpretation-title">结果解读</h2><span>结合静息状态参考</span></div>
      <article class="result-interpretation pressure-interpretation"><h3>${result.assessment}</h3><p>本次估计血压为 ${result.readings.map((item) => item.value).join('/')} mmHg，处于参考范围内。单次结果不能反映长期血压状况，建议结合多次测量观察变化。</p></article>
      ${result.readings.map((item) => `<article class="result-interpretation"><div class="pressure-interpretation-heading"><h3>${item.label}</h3><div class="result-interpretation-reading"><strong>${item.value}</strong><span>mmHg</span></div></div><p>${item.text}</p></article>`).join('')}
      <article class="result-interpretation"><h3>日常建议</h3><p>保持规律作息、适量运动和均衡饮食，减少高盐食物，避免过度劳累。</p><p>建议在相近时间、安静休息后测量。如需确认血压情况，请使用经过验证的上臂式血压计；不要依据本次估计自行调整用药。</p></article>
    </section>
  </main><div class="gesture"></div>
</div>`;

/** 无有效结果时不展示正常评估；低质量变体只保留固定的质量分。 */
function missingPressureOverview(previewState) {
  const qualityFailed = previewState === 'failed-quality';
  return `<section class="pressure-result-card pressure-result-missing" aria-label="本次血压估计结果未生成"><div class="pressure-reading-heading"><span>估计血压值</span>${qualityFailed ? '<span>信号质量 62 分</span>' : ''}</div><div class="pressure-result-readings">${result.readings.map((item) => `<div><h4>${item.label}<span>mmHg</span></h4><strong>--</strong><p>${qualityFailed ? '信号质量过低' : '未能生成结果'}</p></div>`).join('')}</div></section>`;
}

/** 默认直接返回既有成功报告，其他状态独立衍生。 */
export function bloodPressureResultsForState(previewState = 'success') {
  if (previewState === 'success') return bloodPressureResultsPage;
  return resultReportForState(bloodPressureResultsPage, previewState, {
    measurementRoute: 'blood-pressure-measurement',
  });
}

/** 血压失败仅允许重测，不创建失败报告或拆分双读数。 */
export function bloodPressureSummaryForState(previewState = 'success') {
  return resultSummaryForState(bloodPressureSummary, previewState, ['failed', 'failed-quality'].includes(previewState) ? missingPressureOverview(previewState) : '');
}

/** 生成独立的三十秒归一化 SCG 展示样例，不读取或处理真实加速度。 */
function createProcessedScg() {
  const samples = [];
  let minimum = Infinity;
  let maximum = -Infinity;
  for (let index = 0; index <= 3000; index += 1) {
    const seconds = index / 100;
    const phase = (seconds * 1.2) % 1;
    const systolic = Math.exp(-(((phase - .28) / .12) ** 2)) * Math.sin((phase - .28) * Math.PI * 12);
    const diastolic = .3 * Math.exp(-(((phase - .65) / .11) ** 2)) * Math.sin((phase - .65) * Math.PI * 14);
    const value = (systolic + diastolic) * (.94 + .05 * Math.sin(seconds * .8));
    samples.push([seconds, value]);
    minimum = Math.min(minimum, value);
    maximum = Math.max(maximum, value);
  }
  const span = (maximum - minimum) / .75;
  return {
    /** 三十秒、100Hz 的正负振动样例，与 PPG 的形态和数组独立。 */
    samples,
    /** 固定纵轴下界，使最小样本位于绘图区高度的 10%。 */
    min: minimum - span * .1,
    /** 固定纵轴上界，使最大样本位于绘图区高度的 85%。 */
    max: maximum + span * .15,
  };
}

/** 仅在可用报告首次挂载时生成，失败或缺失波形不创建样例。 */
let processedScg;

/** 挂载两张独立回看的处理后波形，离开报告时一起释放。 */
export function mountBloodPressureResults(root, { previewState = 'success' } = {}) {
  const disposers = [];
  if (previewState === 'success') {
    const ppg = root.querySelector('#pressure-ppg:not([data-wave-state])');
    const scg = root.querySelector('#pressure-scg:not([data-wave-state])');
    if (ppg) disposers.push(mountResultWave(ppg, processedPpgSamples, -.135, 1.212));
    if (scg) {
      processedScg ??= createProcessedScg();
      disposers.push(mountResultWave(scg, processedScg.samples, processedScg.min, processedScg.max));
    }
  }
  root.querySelector('h1')?.focus({ preventScroll: true });
  return () => disposers.forEach((dispose) => dispose());
}
