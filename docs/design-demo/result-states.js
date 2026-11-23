/** 报告与简要结果共用的加载及失败展示，不改变成功样例。 */
import { loadingIcon } from './ui.js';

/** 复用现有加载与错误图形，不将未知结果画成检测成功。 */
export function resultStateIcon(state) {
  if (state === 'loading') return loadingIcon();
  return '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="currentColor" stroke="none"/><path d="m8.5 8.5 7 7m0-7-7 7" stroke="var(--surface)" stroke-width="2"/></svg>';
}

/** 直接面向用户的状态反馈，查询失败不解释成检测失败。 */
export function resultStateNotice(state) {
  const content = {
    failed: ['检测失败', '本次检测未能生成有效结果，请重新检测'],
    'query-failed': ['结果获取失败', '结果查询失败，请稍后重新获取'],
    'task-failed': ['任务创建失败', '由于未知错误，任务创建失败，请重新检测'],
  }[state === 'failed-quality' ? 'failed' : state];
  return `<section class="result-state-notice error" role="alert"><div class="result-state-heading"><span class="result-state-icon">${resultStateIcon(state)}</span><h2>${content[0]}</h2></div><p>${content[1]}</p></section>`;
}

/** 波形局部加载或获取失败只影响原画布，不生成替代样例。 */
export function resultStateWaveCard(card, state) {
  const plot = card.querySelector('.result-wave');
  const loading = state === 'wave-loading';
  const text = loading ? '正在获取波形' : '波形暂时无法获取';
  card.dataset.waveState = state;
  card.querySelector('.result-wave-heading > span')?.remove();
  plot.removeAttribute('tabindex');
  plot.setAttribute('role', 'status');
  plot.setAttribute('aria-label', text);
  if (loading) plot.setAttribute('aria-busy', 'true');
  plot.classList.add('result-wave-placeholder');
  plot.innerHTML = `${loading ? `<span class="result-state-icon loading">${resultStateIcon('loading')}</span>` : ''}<span>${text}</span>`;
  card.querySelector('.result-wave-navigation').innerHTML = '<span>--</span><span>时长 --</span>';
}

/** 清空失败血氧读数与亮格，保留同源半圆仪表和底轨。 */
export function clearMissingResultDials(root) {
  root.querySelectorAll('[data-result-dial-empty]').forEach((slot) => {
    slot.querySelectorAll('.dial-segment').forEach((segment) => {
      segment.dataset.filled = 'false';
      segment.setAttribute('stroke', 'var(--border)');
      segment.removeAttribute('stroke-opacity');
    });
    const reading = slot.querySelector('text');
    if (reading) reading.textContent = '--';
  });
}

/** 有效报告保留声明与解读；加载时保留标题栏，仅在内容区显示居中加载圈。 */
export function resultReportForState(successHtml, previewState, { measurementRoute, overview, interpretations }) {
  if (previewState === 'success') return successHtml;
  const template = document.createElement('template');
  template.innerHTML = successHtml;
  const phone = template.content.querySelector('.phone');
  phone.dataset.previewState = previewState;
  if (previewState === 'loading') {
    const loading = phone.querySelector('.result-report');
    loading.classList.add('result-report-loading');
    loading.setAttribute('role', 'status');
    loading.setAttribute('aria-label', '正在获取结果');
    loading.setAttribute('aria-busy', 'true');
    loading.innerHTML = `<span class="result-state-icon loading">${resultStateIcon('loading')}</span>`;
    return template.innerHTML;
  }
  const report = phone.querySelector('.result-report');
  const partial = previewState === 'partial' || previewState === 'partial-quality';
  phone.querySelector('.guide-back').dataset.route = measurementRoute + (partial || previewState === 'query-failed' ? `-${previewState}` : '');
  if (previewState === 'query-failed') {
    report.innerHTML = `${resultStateNotice(previewState)}<button type="button" class="cta result-state-retry" data-action="state-retry">重新获取结果</button>`;
  } else if (partial && overview && interpretations) {
    report.querySelector('.result-dashboard').outerHTML = overview;
    report.querySelector('.result-interpretations').outerHTML = interpretations;
  } else if (previewState === 'wave-loading' || previewState === 'wave-failed') {
    report.querySelectorAll('.result-wave-card').forEach((card) => resultStateWaveCard(card, previewState));
  } else {
    throw new RangeError(`不支持的报告预览状态：${previewState}`);
  }
  return template.innerHTML;
}

/** 部分成功只替换失败指标；检测、查询和任务失败各保留必要操作。 */
export function resultSummaryForState(successHtml, state, overview) {
  if (state === 'success') return successHtml;
  const template = document.createElement('template');
  template.innerHTML = successHtml;
  const body = template.content.querySelector('.result-body');
  if (state === 'partial' || state === 'partial-quality') {
    body.querySelector('.result-dashboard').outerHTML = overview;
    return template.innerHTML;
  }
  if (!['failed', 'failed-quality', 'query-failed', 'task-failed'].includes(state)) {
    throw new RangeError(`不支持的简要结果预览状态：${state}`);
  }
  const titleId = body.querySelector('h2').id;
  const time = body.querySelector('time').outerHTML;
  const queryFailed = state === 'query-failed';
  body.innerHTML = `${resultStateNotice(state)}${queryFailed ? '' : time}${overview || ''}<div class="result-actions">${queryFailed ? '<button type="button" class="cta" data-action="state-retry">重新获取结果</button>' : '<button type="button" class="cta" data-result-restart>重新检测</button>'}</div>`;
  body.querySelector('h2').id = titleId;
  body.classList.add('result-state-summary');
  return template.innerHTML;
}
