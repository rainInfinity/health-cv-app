/** 指尖结果的固定样例、简要结果结构与独立报告；不调用算法或后端。 */
import { mountResultWave, processedPpgSamples, resultWaveCard } from './result-wave.js';
import { icon, qualityBadge } from './ui.js';
import { clearMissingResultDials, resultReportForState, resultSummaryForState } from './result-states.js';
import { formatRiskLevel } from './data.js';

/** 本轮展示用的处理结果；等级是固定文案，不由前端阈值推断。 */
const result = {
  /** 检测时间固定，不随预览时间漂移。 */
  time: '2026年10月31日 08:30',
  /** 三项生命体征的固定读数、各自算法的信号质量分及解读；参考区间不驱动前端分级。 */
  vitals: [
    { key: 'heart', label: '心率', value: 72, unit: '次/分', qualityScore: 92, reference: '60–80 次/分', status: '静息范围内', text: '心率反映每分钟心脏跳动的次数。本次静息心率处于常见成人参考范围。', advice: '建议在相近时间、安静休息后测量，结合多次记录观察变化。' },
    { key: 'breath', label: '呼吸率', value: 16, unit: '次/分', qualityScore: 86, reference: '12–20 次/分', status: '静息范围内', text: '呼吸率反映每分钟呼吸的次数。本次结果处于常见成人静息参考范围。', advice: '保持自然呼吸即可，不需要刻意深呼吸或憋气。' },
    { key: 'oxygen', label: '血氧饱和度', value: 98, unit: '%', qualityScore: 96, reference: '95–100%', status: '参考范围内', text: '血氧饱和度反映血液中血红蛋白与氧结合的比例。本次估计结果处于常见参考范围。', advice: '手指温度、移动和按压力度可能影响读数；如有不适，不应仅凭本次结果判断。' },
  ],
  /** 使用演示档位映射文案，不表示血糖值、患病概率或诊断。 */
  riskLevel: 0,
  /** 风险算法的信号质量分，与风险分类及患病概率无关。 */
  riskQualityScore: 76,
};

/** 血氧沿用旧项目矢量轮廓，其余指标由 app.js 同源装配首页 SVG。 */
function metricIcon(key) {
  if (key === 'oxygen') return `<svg class="icon" viewBox="0 0 1024 1024" aria-hidden="true"><path fill="currentColor" d="M512 15.875c274.01603906 0 496.125 222.10896094 496.125 496.125s-222.10896094 496.125-496.125 496.125S15.875 786.01603906 15.875 512 237.98396094 15.875 512 15.875z m0 232.24851563c-148.8375 128.43435938-223.25625001 232.37254688-223.25625001 311.84557031 0 119.22503906 99.9691875 215.87639062 223.25625001 215.87639063s223.25625001-96.65135156 223.25625001-215.87639063c0-79.47302345-74.41875001-183.41121094-223.25625001-311.81456249z m-52.77529687 211.96940624c28.5271875 0 51.50397657 9.11629687 69.05439843 28.12408594 17.17832813 18.6046875 25.92253125 42.38767969 25.92253125 71.62804688 0 28.83726563-8.74420311 52.58925001-25.5504375 70.85285156-17.55042188 18.97678125-40.9303125 28.49617969-69.42649218 28.49617969-28.83726563 0-51.87607031-9.51939844-69.39548438-28.5271875-17.17832813-18.23259375-25.58144531-41.98457813-25.58144531-70.85285157 0-29.20935937 8.37210938-52.96134375 25.92253125-71.62804687 17.17832813-18.97678125 40.186125-28.09307813 69.05439844-28.09307813z m164.15535937 75.78309375c11.19382031 0 20.46515625 3.2248125 27.783 9.73645313 7.13179687 6.51164063 10.69769531 14.75971875 10.69769531 25.17834375 0 10.04653125-3.90698437 19.13182031-11.34885937 27.44191406-4.55814844 4.86822656-12.68219531 11.03878125-24.03105469 18.66670313-10.38761719 6.82171875-17.14732031 12.86824219-20.40314064 18.20158593l-1.20930467 2.2325625h57.14739843v16.74421875h-80.83736718l0.21705468-4.96125c0.93023437-9.79846875 4.62016406-18.38763281 11.28684375-25.89152342 4.24807031-4.86822656 13.17832031-12.03103125 26.66671875-21.27135939 7.441875-5.2093125 12.6511875-9.58141406 15.876-12.99227344a27.41090625 27.41090625 0 0 0 7.65892968-18.356625c0-6.32559375-1.79845312-11.03878125-5.05427344-14.10855468-3.41085937-3.10078125-8.434125-4.55814844-15.10080467-4.55814844-7.13179687 0-12.49614844 2.44961719-16.06204688 7.31784375-2.97674999 3.78295313-4.83721875 9.27133594-5.58140625 16.24809375l-0.27907031 4.34109375h-18.97678125l0.27907031-5.39535938c1.02325781-10.48064062 4.65117187-19.1008125 11.06978906-25.92253124 7.62792187-8.434125 17.67445312-12.6511875 30.20160938-12.65118751z m-164.15535937-41.82953905c-17.51941406 0-30.69773437 6.57365625-40.186125 20.46515624-8.03102345 11.68994531-12.06203906 27.0388125-12.06203907 45.30241406 0 18.29460938 4.03101562 33.240375 12.09304688 44.96132813 9.48839062 13.48839844 22.63570313 20.46515625 40.15511719 20.46515625 17.17832813 0 30.69773437-6.97675781 40.186125-20.46515625 8.06203125-12.09304688 12.403125-27.06982031 12.403125-44.96132813 0-18.26360156-4.34109375-33.61246875-12.403125-45.27140625-9.48839062-13.92250781-23.00779689-20.46515625-40.186125-20.46515625z"/></svg>`;
  return `<span data-result-icon="${key}" aria-hidden="true"></span>`;
}


/** 简要结果与报告共用首页式四卡看板，读数与图形只维护一套。 */
function metricDashboard() {
  return `<section class="result-dashboard" aria-label="本次检测结果">
    ${result.vitals.slice(0, 2).map((item) => `<div class="revised-metric result-metric-card">${qualityBadge(item.qualityScore)}<h3>${item.label}</h3><div class="result-card-body"><div class="result-card-reading"><strong>${item.value}</strong><span>${item.unit}</span></div><span class="result-card-art ${item.key}" aria-hidden="true">${metricIcon(item.key)}</span></div><div class="result-card-reference"><span>参考区间</span><span>${item.reference}</span></div></div>`).join('')}
    <div class="revised-metric result-metric-card">${qualityBadge(result.vitals[2].qualityScore)}<h3>血氧饱和度</h3><div class="result-card-dial" data-result-dial aria-label="血氧饱和度 ${result.vitals[2].value}%" role="img"></div><div class="result-card-reference"><span>参考区间</span><span>${result.vitals[2].reference}</span></div></div>
    <div class="revised-metric result-metric-card">${qualityBadge(result.riskQualityScore)}<h3>糖尿病风险</h3><div class="result-card-body"><strong class="result-card-risk">${formatRiskLevel(result.riskLevel)}</strong><span class="result-card-art risk" aria-hidden="true">${metricIcon('risk')}</span></div><div class="result-card-reference"><span>仅供参考</span></div></div>
  </section>`;
}


/** 原底部面板展开后显示的简要结果；关闭和重测由检测页管理。 */
export const fingertipSummary = `<div class="finger-result-content" hidden>
  <button type="button" class="result-close" data-result-close aria-label="收起检测结果">${icon('caret')}</button>
  <div class="result-body">
  <header class="result-completion"><div class="result-completion-title"><span class="result-complete-mark" data-result-success aria-hidden="true"></span><h2 id="finger-result-title">检测完成</h2></div><p>可以移开手指，查看本次结果</p><time>${result.time}</time></header>
  ${metricDashboard()}
  <p class="result-disclaimer">检测结果仅供健康管理参考，不能替代医学诊断。</p>
  <div class="result-actions"><button type="button" class="cta" data-result-details>查看详细结果 ${icon('arrow')}</button><button type="button" class="result-text-button" data-result-restart>重新检测</button></div>
  </div>
</div>`;

/** 独立于检测页的报告路由，无检测计时、镜头和产品底栏。 */
export const fingertipResultsPage = `<div class="phone fingertip-results">
  <div class="status"><span>9:41</span><span class="system" aria-hidden="true">▮▮▮ ▰</span></div>
  <header class="guide-topbar result-topbar"><button type="button" class="guide-back" data-action="navigate" data-route="fingertip-measurement" aria-label="返回本次检测结果"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg></button><h1 tabindex="-1">详细结果</h1><img src="/brand-assets/xinmu-logo.svg" width="28" height="28" alt="心沐"></header>
  <main class="result-report">
    <header class="result-report-heading result-section-heading"><h2>结果总览</h2><time>${result.time}</time></header>
    <p class="result-disclaimer">检测结果仅供健康管理参考，不能替代医学诊断。如有持续不适，请及时就医。</p>
    ${metricDashboard()}
    <p class="result-quality-note">指标右上角信号质量评分，满分100，分数越高，代表本次检测结果相对较准确。</p>
    ${resultWaveCard('result-wave', '脉搏波')}
    <section class="result-interpretations" aria-labelledby="result-interpretation-title"><div class="result-section-heading"><h2 id="result-interpretation-title">指标解读</h2><span>结合静息状态参考</span></div>
      ${result.vitals.map((item) => `<article class="result-interpretation"><div class="result-interpretation-main"><div class="result-interpretation-identity"><h3>${item.label}</h3><span class="result-metric-icon ${item.key}">${metricIcon(item.key)}</span></div><div class="result-interpretation-content"><header><div class="result-interpretation-reading"><strong>${item.value}</strong><span>${item.unit}</span></div><span class="result-assessment">${item.status}</span></header><p>${item.text}</p></div></div><p class="result-advice">${item.advice}</p></article>`).join('')}
      <article class="result-interpretation result-risk-interpretation"><div class="result-interpretation-main"><div class="result-interpretation-identity"><h3>糖尿病风险</h3><span class="result-metric-icon risk">${metricIcon('risk')}</span></div><div class="result-interpretation-content"><header><strong class="result-risk-reading">${formatRiskLevel(result.riskLevel, false)}</strong></header><p>本次筛查提示较低风险，不表示没有糖尿病，也不是血糖检测结果。</p></div></div><div class="result-risk-guidance"><h4>如何看待这项结果</h4><p>风险评估用于健康管理参考。若有糖尿病家族史，或出现多饮、多尿、体重不明原因下降等情况，建议咨询医生，通过血糖或糖化血红蛋白等检查进一步评估。</p></div></article>
    </section>
  </main><div class="gesture"></div>
</div>`;

/** 失败指标只清空结果；低质量变体保留固定质量样例，不推导拒绝阈值。 */
function stateDashboard(previewState) {
  const template = document.createElement('template');
  template.innerHTML = metricDashboard();
  const partial = previewState === 'partial' || previewState === 'partial-quality';
  const qualityFailed = previewState === 'partial-quality' || previewState === 'failed-quality';
  const cards = [...template.content.querySelectorAll('.result-metric-card')];
  cards.forEach((card, index) => {
    if (partial && index < 2) return;
    card.classList.add('result-metric-missing');
    card.querySelector('.result-quality-badge').remove();
    if (qualityFailed) card.insertAdjacentHTML('afterbegin', qualityBadge(62));
    if (index === 2) {
      const dial = card.querySelector('[data-result-dial]');
      dial.setAttribute('data-result-dial-empty', '');
      dial.setAttribute('aria-label', '血氧饱和度未能生成结果');
    } else {
      card.querySelector('.result-card-reading strong, .result-card-risk').textContent = '--';
    }
    card.querySelector('.result-card-reference').innerHTML = `<span>${qualityFailed ? '信号质量过低' : '未能生成结果'}</span>`;
  });
  return template.innerHTML;
}

/** 有效项目保留原有解读，失败项目不附加正常结论与建议。 */
function stateInterpretations(previewState) {
  const qualityFailed = previewState === 'partial-quality';
  return `<section class="result-interpretations" aria-labelledby="result-interpretation-title"><div class="result-section-heading"><h2 id="result-interpretation-title">指标解读</h2><span>结合静息状态参考</span></div>
    ${result.vitals.map((item, index) => index < 2
      ? `<article class="result-interpretation"><div class="result-interpretation-main"><div class="result-interpretation-identity"><h3>${item.label}</h3><span class="result-metric-icon ${item.key}">${metricIcon(item.key)}</span></div><div class="result-interpretation-content"><header><div class="result-interpretation-reading"><strong>${item.value}</strong><span>${item.unit}</span></div><span class="result-assessment">${item.status}</span></header><p>${item.text}</p></div></div><p class="result-advice">${item.advice}</p></article>`
      : `<article class="result-interpretation"><div class="pressure-interpretation-heading"><h3>${item.label}</h3><div class="result-interpretation-reading"><strong>--</strong><span>${item.unit}</span></div></div><p>${qualityFailed ? '信号质量过低，未能生成结果。' : `本次信号未能生成有效${item.label}结果。`}</p></article>`).join('')}
    <article class="result-interpretation"><div class="pressure-interpretation-heading"><h3>糖尿病风险</h3><strong class="result-risk-reading">--</strong></div><p>${qualityFailed ? '信号质量过低，未能生成风险评估，不代表风险高低。' : '本次未能生成风险评估，不代表风险高低。'}</p></article>
  </section>`;
}

/** 默认成功 HTML 保持不变，衍生状态不补造缺失结果。 */
export function fingertipResultsForState(previewState = 'success') {
  if (previewState === 'success') return fingertipResultsPage;
  return resultReportForState(fingertipResultsPage, previewState, {
    measurementRoute: 'fingertip-measurement',
    overview: ['partial', 'partial-quality'].includes(previewState) ? stateDashboard(previewState) : '',
    interpretations: ['partial', 'partial-quality'].includes(previewState) ? stateInterpretations(previewState) : '',
  });
}

/** 检测页沿用同源看板，查询或任务失败不伪装检测读数。 */
export function fingertipSummaryForState(previewState = 'success') {
  return resultSummaryForState(fingertipSummary, previewState, ['partial', 'partial-quality', 'failed', 'failed-quality'].includes(previewState) ? stateDashboard(previewState) : '');
}

/** 展示指尖处理后 PPG，离开报告时释放图表和交互。 */
export function mountFingertipResults(root, { previewState = 'success' } = {}) {
  clearMissingResultDials(root);
  const card = root.querySelector('.result-wave-card:not([data-wave-state])');
  const dispose = ['success', 'partial', 'partial-quality'].includes(previewState) && card
    ? mountResultWave(card, processedPpgSamples, -.135, 1.212)
    : () => {};
  root.querySelector('h1')?.focus({ preventScroll: true });
  return dispose;
}
