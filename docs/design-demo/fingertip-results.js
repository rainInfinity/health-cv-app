/** 指尖结果的固定样例、简要结果结构与独立报告；不调用算法或后端。 */
import { init } from '/vendor/echarts.esm.min.js';
import { icon } from './ui.js';

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
  /** 风险只展示分类，不表示血糖值、患病概率或诊断。 */
  risk: '较低风险',
  /** 风险算法的信号质量分，与风险分类及患病概率无关。 */
  riskQualityScore: 76,
};

/** 血氧沿用旧项目矢量轮廓，其余指标由 app.js 同源装配首页 SVG。 */
function metricIcon(key) {
  if (key === 'oxygen') return `<svg class="icon" viewBox="0 0 1024 1024" aria-hidden="true"><path fill="currentColor" d="M512 15.875c274.01603906 0 496.125 222.10896094 496.125 496.125s-222.10896094 496.125-496.125 496.125S15.875 786.01603906 15.875 512 237.98396094 15.875 512 15.875z m0 232.24851563c-148.8375 128.43435938-223.25625001 232.37254688-223.25625001 311.84557031 0 119.22503906 99.9691875 215.87639062 223.25625001 215.87639063s223.25625001-96.65135156 223.25625001-215.87639063c0-79.47302345-74.41875001-183.41121094-223.25625001-311.81456249z m-52.77529687 211.96940624c28.5271875 0 51.50397657 9.11629687 69.05439843 28.12408594 17.17832813 18.6046875 25.92253125 42.38767969 25.92253125 71.62804688 0 28.83726563-8.74420311 52.58925001-25.5504375 70.85285156-17.55042188 18.97678125-40.9303125 28.49617969-69.42649218 28.49617969-28.83726563 0-51.87607031-9.51939844-69.39548438-28.5271875-17.17832813-18.23259375-25.58144531-41.98457813-25.58144531-70.85285157 0-29.20935937 8.37210938-52.96134375 25.92253125-71.62804687 17.17832813-18.97678125 40.186125-28.09307813 69.05439844-28.09307813z m164.15535937 75.78309375c11.19382031 0 20.46515625 3.2248125 27.783 9.73645313 7.13179687 6.51164063 10.69769531 14.75971875 10.69769531 25.17834375 0 10.04653125-3.90698437 19.13182031-11.34885937 27.44191406-4.55814844 4.86822656-12.68219531 11.03878125-24.03105469 18.66670313-10.38761719 6.82171875-17.14732031 12.86824219-20.40314064 18.20158593l-1.20930467 2.2325625h57.14739843v16.74421875h-80.83736718l0.21705468-4.96125c0.93023437-9.79846875 4.62016406-18.38763281 11.28684375-25.89152342 4.24807031-4.86822656 13.17832031-12.03103125 26.66671875-21.27135939 7.441875-5.2093125 12.6511875-9.58141406 15.876-12.99227344a27.41090625 27.41090625 0 0 0 7.65892968-18.356625c0-6.32559375-1.79845312-11.03878125-5.05427344-14.10855468-3.41085937-3.10078125-8.434125-4.55814844-15.10080467-4.55814844-7.13179687 0-12.49614844 2.44961719-16.06204688 7.31784375-2.97674999 3.78295313-4.83721875 9.27133594-5.58140625 16.24809375l-0.27907031 4.34109375h-18.97678125l0.27907031-5.39535938c1.02325781-10.48064062 4.65117187-19.1008125 11.06978906-25.92253124 7.62792187-8.434125 17.67445312-12.6511875 30.20160938-12.65118751z m-164.15535937-41.82953905c-17.51941406 0-30.69773437 6.57365625-40.186125 20.46515624-8.03102345 11.68994531-12.06203906 27.0388125-12.06203907 45.30241406 0 18.29460938 4.03101562 33.240375 12.09304688 44.96132813 9.48839062 13.48839844 22.63570313 20.46515625 40.15511719 20.46515625 17.17832813 0 30.69773437-6.97675781 40.186125-20.46515625 8.06203125-12.09304688 12.403125-27.06982031 12.403125-44.96132813 0-18.26360156-4.34109375-33.61246875-12.403125-45.27140625-9.48839062-13.92250781-23.00779689-20.46515625-40.186125-20.46515625z"/></svg>`;
  return `<span data-result-icon="${key}" aria-hidden="true"></span>`;
}

/** 将看板中的风险等级与“风险”二字分成两行，不用于指标解读。 */
function riskValue(value) {
  return `<span>${value.replace(/风险$/, '')}</span><span>风险</span>`;
}

/** 将 70–100 分的质量展示样例映射为角标色阶，90 与 80 归入较高一档。 */
function qualityBadge(score) {
  const tone = score >= 90 ? 'high' : score >= 80 ? 'medium' : 'low';
  return `<span class="result-quality-badge ${tone}" role="img" aria-label="信号质量 ${score} 分，满分 100 分" title="信号质量 ${score} 分 / 100 分"><strong>${score}</strong></span>`;
}

/** 简要结果与报告共用首页式四卡看板，读数与图形只维护一套。 */
function metricDashboard() {
  return `<section class="result-dashboard" aria-label="本次检测结果">
    ${result.vitals.slice(0, 2).map((item) => `<div class="revised-metric result-metric-card">${qualityBadge(item.qualityScore)}<h3>${item.label}</h3><div class="result-card-body"><div class="result-card-reading"><strong>${item.value}</strong><span>${item.unit}</span></div><span class="result-card-art ${item.key}" aria-hidden="true">${metricIcon(item.key)}</span></div><div class="result-card-reference"><span>参考区间</span><span>${item.reference}</span></div></div>`).join('')}
    <div class="revised-metric result-metric-card">${qualityBadge(result.vitals[2].qualityScore)}<h3>血氧饱和度</h3><div class="result-card-dial" data-result-dial aria-label="血氧饱和度 ${result.vitals[2].value}%" role="img"></div><div class="result-card-reference"><span>参考区间</span><span>${result.vitals[2].reference}</span></div></div>
    <div class="revised-metric result-metric-card">${qualityBadge(result.riskQualityScore)}<h3>糖尿病风险</h3><div class="result-card-body"><strong class="result-card-risk">${riskValue(result.risk)}</strong><span class="result-card-art risk" aria-hidden="true">${metricIcon('risk')}</span></div><div class="result-card-reference"><span>仅供参考</span></div></div>
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
    <section class="result-wave-card" aria-labelledby="result-wave-title"><div class="result-section-heading result-wave-heading"><div><h2 id="result-wave-title">脉搏波</h2><span class="result-processing-tag">处理后</span></div><span>左右滑动查看</span></div><div class="result-wave pulse-wave" tabindex="0" role="group" aria-label="处理后脉搏波，每屏六秒，可横向拖动或使用方向键查看本轮三十秒数据"></div><div class="result-wave-navigation"><span data-result-range>0–6 秒</span><span>共 30 秒</span></div></section>
    <section class="result-interpretations" aria-labelledby="result-interpretation-title"><div class="result-section-heading"><h2 id="result-interpretation-title">指标解读</h2><span>结合静息状态参考</span></div>
      ${result.vitals.map((item) => `<article class="result-interpretation"><div class="result-interpretation-main"><div class="result-interpretation-identity"><h3>${item.label}</h3><span class="result-metric-icon ${item.key}">${metricIcon(item.key)}</span></div><div class="result-interpretation-content"><header><div class="result-interpretation-reading"><strong>${item.value}</strong><span>${item.unit}</span></div><span class="result-assessment">${item.status}</span></header><p>${item.text}</p></div></div><p class="result-advice">${item.advice}</p></article>`).join('')}
      <article class="result-interpretation result-risk-interpretation"><div class="result-interpretation-main"><div class="result-interpretation-identity"><h3>糖尿病风险</h3><span class="result-metric-icon risk">${metricIcon('risk')}</span></div><div class="result-interpretation-content"><header><strong class="result-risk-reading">${result.risk}</strong></header><p>本次筛查提示较低风险，不表示没有糖尿病，也不是血糖检测结果。</p></div></div><div class="result-risk-guidance"><h4>如何看待这项结果</h4><p>风险评估用于健康管理参考。若有糖尿病家族史，或出现多饮、多尿、体重不明原因下降等情况，建议咨询医生，通过血糖或糖化血红蛋白等检查进一步评估。</p></div></article>
    </section>
  </main><div class="gesture"></div>
</div>`;

/** 预先生成整轮处理后样例，独立于采集页实时波形，不冒充后端响应。 */
const processedSamples = Array.from({ length: 901 }, (_, index) => {
  const seconds = index / 30;
  const phase = (seconds * 1.2) % 1;
  const pulse = Math.exp(-(((phase - .22) / .09) ** 2)) + .28 * Math.exp(-(((phase - .5) / .12) ** 2));
  return [seconds, pulse * (.94 + .05 * Math.sin(seconds * .8))];
});

/** 展示完整处理后记录；六秒窗口只平移，支持手势回看与键盘操作。 */
export function mountFingertipResults(root) {
  const plot = root.querySelector('.result-wave');
  const range = root.querySelector('[data-result-range]');
  const colors = getComputedStyle(plot);
  const chart = init(plot, null, { renderer: 'svg' });
  let start = 0;
  chart.setOption({
    animation: false,
    grid: { left: 4, right: 12, top: 8, bottom: 8 },
    xAxis: { type: 'value', min: 0, max: 30, show: false },
    yAxis: { type: 'value', min: -.135, max: 1.212, show: false },
    dataZoom: [{ type: 'inside', xAxisIndex: 0, filterMode: 'none', startValue: 0, endValue: 6, minValueSpan: 6, maxValueSpan: 6, zoomOnMouseWheel: false, moveOnMouseWheel: false, moveOnMouseMove: true, preventDefaultMouseMove: true }],
    series: [{ type: 'line', data: processedSamples, showSymbol: false, smooth: false, clip: true, lineStyle: { width: 1.5, color: colors.getPropertyValue('--primary').trim() }, emphasis: { disabled: true } }],
  });

  /** 范围文字跟随手势实际窗口，不重新生成或修改采样值。 */
  function syncControls() {
    const zoom = chart.getOption().dataZoom[0];
    start = Math.max(0, Math.min(24, zoom.startValue));
    range.textContent = `${start.toFixed(1)}–${(start + 6).toFixed(1)} 秒`;
  }

  /** 显式跳到指定六秒区间，缩放始终关闭。 */
  function seek(value) {
    const next = Math.max(0, Math.min(24, value));
    chart.dispatchAction({ type: 'dataZoom', startValue: next, endValue: next + 6 });
    syncControls();
  }

  /** 方向键逐秒移动，首尾键跳到整轮记录两端。 */
  function onKeydown(event) {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    seek(event.key === 'Home' ? 0 : event.key === 'End' ? 24 : start + (event.key === 'ArrowLeft' ? -1 : 1));
  }

  const observer = new ResizeObserver(() => chart.resize());
  observer.observe(plot);
  chart.on('datazoom', syncControls);
  plot.addEventListener('keydown', onKeydown);
  root.querySelector('h1').focus({ preventScroll: true });
  syncControls();
  return () => {
    observer.disconnect();
    plot.removeEventListener('keydown', onKeydown);
    chart.dispose();
  };
}
