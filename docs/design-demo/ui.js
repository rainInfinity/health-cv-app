/** 对动态文本进行 HTML 转义，防止账户和表单内容进入模板结构。 */
export function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
}

/** 弹层使用的本地线性图标，不依赖网络资源。 */
export function icon(name) {
  const paths = {
    arrow: '<path d="M5 12h14m-6-6 6 6-6 6"/>',
    chevron: '<path d="m9 6 6 6-6 6"/>',
    caret: '<path d="M6 9l4.6 4.6q1.4 1.4 2.8 0L18 9"/>',
    heart: '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
  };
  return `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.chevron}</svg>`;
}

let loadingSequence = 0;

/** 复用原生加载圈的24画布、半径9与线宽2，白色按钮前景不使用品牌渐变。 */
export function loadingIcon({ className = '', foreground = false, hidden = false } = {}) {
  const gradientId = `demo-loading-${++loadingSequence}`;
  const stroke = foreground ? 'currentColor' : `url(#${gradientId})`;
  const track = foreground ? 'currentColor' : 'var(--primary)';
  return `<svg class="icon loading-spinner ${escapeHtml(className)}" viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" aria-hidden="true"${hidden ? ' hidden' : ''}>${foreground ? '' : `<defs><linearGradient id="${gradientId}" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0" stop-color="var(--primary)"/><stop offset="1" stop-color="var(--mint)"/></linearGradient></defs>`}<circle cx="12" cy="12" r="9" stroke="${track}" stroke-opacity=".18"/><path d="M12 3a9 9 0 1 1-9 9" stroke="${stroke}"/></svg>`;
}


/** 将质量展示样例映射为既有角标色阶，90 与 80 归入较高一档。 */
export function qualityBadge(score) {
  const tone = score >= 90 ? 'high' : score >= 80 ? 'medium' : 'low';
  return `<span class="result-quality-badge ${tone}" role="img" aria-label="信号质量 ${score} 分，满分 100 分" title="信号质量 ${score} 分 / 100 分"><strong>${score}</strong></span>`;
}
