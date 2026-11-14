/** 对动态文本进行 HTML 转义，防止账户和表单内容进入模板结构。 */
export function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
}

/** 弹层使用的本地线性图标，不依赖网络资源。 */
export function icon(name) {
  const paths = {
    arrow: '<path d="M5 12h14m-6-6 6 6-6 6"/>',
    chevron: '<path d="m9 6 6 6-6 6"/>',
    heart: '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
  };
  return `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.chevron}</svg>`;
}

/** 按实际经过的分钟、小时或整天显示间隔；无记录或时钟早于记录时不虚构检测。 */
export function measurementRecency(measuredAt, now = Date.now()) {
  if (!measuredAt) return '尚未检测';
  const elapsed = now - Date.parse(measuredAt);
  if (elapsed < 0) return '检测时间待核对';
  if (elapsed < 60_000) return '刚刚检测';
  if (elapsed < 3_600_000) return `已 ${Math.floor(elapsed / 60_000)} 分钟未检测`;
  if (elapsed < 86_400_000) return `已 ${Math.floor(elapsed / 3_600_000)} 小时未检测`;
  return `已 ${Math.floor(elapsed / 86_400_000)} 天未检测`;
}
