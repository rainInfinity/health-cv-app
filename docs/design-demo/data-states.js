/** 仅替换数据区域的展示状态；清理时恢复原节点，不接管页面路由和请求。 */
import { escapeHtml, icon, loadingIcon } from './ui.js';

const states = new Set(['loading', 'empty', 'failed', 'refreshing', 'refresh-failed']);
const noop = () => {};

/** 保留节点及属性，避免清理状态时丢失原有图表和事件。 */
function changes() {
  const undo = [];
  return {
    attribute(element, name, value) {
      if (!element) return;
      const previous = element.getAttribute(name);
      element.setAttribute(name, value);
      undo.push(() => previous === null ? element.removeAttribute(name) : element.setAttribute(name, previous));
    },
    replace(element, ...nodes) {
      if (!element) return;
      const previous = [...element.childNodes];
      element.replaceChildren(...nodes);
      undo.push(() => element.replaceChildren(...previous));
    },
    insert(parent, element, before = null) {
      if (!parent) return;
      parent.insertBefore(element, before);
      undo.push(() => element.remove());
    },
    dispose() {
      while (undo.length) undo.pop()();
    },
  };
}

function skeleton(kind = 'value') {
  const element = document.createElement('span');
  element.className = `ds-skeleton ds-skeleton-${kind}`;
  element.setAttribute('aria-hidden', 'true');
  return element;
}

function spinner() {
  const element = document.createElement('span');
  element.className = 'ds-spinner';
  element.setAttribute('aria-hidden', 'true');
  element.innerHTML = loadingIcon();
  return element;
}

/** 用原读数预留空间，只在数值位置旋转，不改变卡片尺寸。 */
function refreshingValue(value, patch) {
  if (!value) return;
  const unit = value.querySelector('small');
  const slot = document.createElement('span');
  slot.className = 'ds-value-loading';
  const reserve = document.createElement('span');
  reserve.className = 'ds-value-reserve';
  reserve.setAttribute('aria-hidden', 'true');
  reserve.textContent = [...value.childNodes].filter((node) => node !== unit).map((node) => node.textContent).join('').trim();
  slot.append(reserve, spinner());
  patch.replace(value, slot, ...(unit ? [document.createTextNode(' '), unit.cloneNode(true)] : []));
  const bounds = slot.getBoundingClientRect();
  const height = value.matches('.bp-last time, .revised-time') ? 18 : bounds.height;
  slot.style.setProperty('--ds-spinner-size', `${Math.min(bounds.width, height)}px`);
  patch.attribute(value, 'aria-label', '正在获取');
  patch.attribute(value, 'aria-busy', 'true');
}

/** 仪表刻度保持原样，加载圈只替换中央读数。 */
function refreshingDial(dial, patch) {
  if (!dial) return;
  const value = dial.querySelector('text');
  const bounds = value.getBBox();
  patch.attribute(dial, 'aria-label', '血氧饱和度，正在获取');
  patch.attribute(dial, 'aria-busy', 'true');
  patch.attribute(value, 'visibility', 'hidden');
  const template = document.createElement('template');
  template.innerHTML = loadingIcon();
  const ring = template.content.firstElementChild;
  const size = Math.min(bounds.width, 36);
  ring.setAttribute('x', String(bounds.x + (bounds.width - size) / 2));
  ring.setAttribute('y', String(bounds.y + (bounds.height - size) / 2));
  ring.setAttribute('width', String(size));
  ring.setAttribute('height', String(size));
  ring.style.width = `${size}px`;
  ring.style.height = `${size}px`;
  // 定位视口保持静止，只旋转内部图形，避免嵌套SVG的坐标与裁切影响加载圈。
  const rotor = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  rotor.setAttribute('class', 'ds-spinner-svg');
  rotor.append(...ring.querySelectorAll('circle, path'));
  ring.append(rotor);
  patch.insert(dial, ring);
}

function historyNotice({ title, failed = false }) {
  const element = document.createElement('div');
  element.className = 'ds-notice';
  element.setAttribute('role', failed ? 'alert' : 'status');
  element.innerHTML = `<div class="ds-notice-copy"><strong>${escapeHtml(title)}</strong>${failed ? '' : '<p>可切换日期查看，或开始一次新的检测。</p>'}</div>`;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'ds-state-link';
  button.dataset.action = failed ? 'state-retry' : 'navigate';
  if (!failed) button.dataset.route = 'functions';
  button.innerHTML = `${failed ? '重新获取' : '前往检测'} ${icon('arrow')}`;
  element.append(button);
  return element;
}

/** 首次失败沿用空态；刷新仅更新数据位置，不添加页面通知。 */
function homeState(root, state, patch) {
  const home = root.querySelector('.home');
  if (!home) return;
  const displayState = state === 'failed' || state === 'refresh-failed' ? 'empty' : state;
  patch.attribute(home, 'data-ds-state', displayState);
  if (displayState === 'refreshing') {
    home.querySelectorAll('.pressure-number, .lively-number strong, .risk-body .empty-state, .bp-last time, .revised-time').forEach((value) => refreshingValue(value, patch));
    refreshingDial(home.querySelector('.oxygen-dial'), patch);
    return;
  }
  const loading = displayState === 'loading';
  const timeLabel = '暂无记录';
  home.querySelectorAll('.pressure-number, .lively-number strong').forEach((value) => {
    const unit = value.querySelector('small')?.cloneNode(true);
    patch.replace(value, loading ? skeleton() : document.createTextNode('-- '), ...(unit ? [unit] : []));
  });
  const risk = home.querySelector('.risk-body .empty-state');
  patch.replace(risk, loading ? skeleton() : document.createTextNode('--'));
  home.querySelectorAll('.bp-last time, .revised-time').forEach((time) => {
    patch.replace(time, loading ? skeleton('time') : document.createTextNode(timeLabel));
  });
  const dial = home.querySelector('.oxygen-dial');
  if (dial) {
    patch.attribute(dial, 'aria-label', loading ? '血氧饱和度，正在获取' : `血氧饱和度，${timeLabel}`);
    const value = dial.querySelector('text');
    patch.replace(value, document.createTextNode('--'));
    dial.querySelectorAll('.dial-segment').forEach((segment) => {
      patch.attribute(segment, 'data-filled', 'false');
      patch.attribute(segment, 'stroke', 'var(--border)');
      patch.attribute(segment, 'stroke-opacity', '1');
    });
    if (loading) {
      patch.attribute(dial, 'data-ds-loading', 'true');
      patch.attribute(value, 'visibility', 'hidden');
    }
  }
  home.querySelectorAll('.source-tag').forEach((tag) => patch.attribute(tag, 'hidden', ''));
  if (loading) {
    patch.attribute(home.querySelector('.revised-bp'), 'aria-busy', 'true');
    patch.attribute(home.querySelector('.revised-grid'), 'aria-busy', 'true');
  }
}

/** 加载不展示趋势、统计、记录与声明，指标和日期筛选仍可操作。 */
function historyState(root, state, patch) {
  const panel = root.querySelector('#history-panel');
  if (!panel) return;
  patch.attribute(panel, 'data-ds-state', state);
  patch.attribute(root.querySelector('.history'), 'data-ds-state', state);
  [...panel.children].forEach((element) => patch.attribute(element, 'hidden', ''));
  if (state === 'loading') {
    patch.attribute(root.querySelector('.history'), 'data-ds-state', 'loading');
    patch.attribute(panel, 'aria-busy', 'true');
    patch.attribute(root.querySelector('.hist-disclaimer'), 'hidden', '');
    const stage = document.createElement('div');
    stage.className = 'ds-history-loading';
    stage.setAttribute('role', 'status');
    stage.setAttribute('aria-label', '正在获取当前区间的记录');
    stage.append(spinner());
    patch.insert(panel, stage);
    return;
  }
  if (state === 'failed') patch.attribute(root.querySelector('.hist-disclaimer'), 'hidden', '');
  const metric = root.querySelector('[data-history-metric-label]')?.textContent.trim() || '测量';
  patch.insert(panel, historyNotice({
    title: state === 'failed' ? '历史数据获取失败' : `当前区间暂无${metric}记录`,
    failed: state === 'failed',
  }));
}

/** 挂载首页或历史页的数据状态；成功态不修改原有 DOM。 */
export function applyDataState(root, { page, state }) {
  if (state === 'success' || !states.has(state) || !['home', 'history'].includes(page)) return noop;
  const patch = changes();
  if (page === 'home') homeState(root, state, patch);
  else historyState(root, state, patch);
  return patch.dispose;
}
