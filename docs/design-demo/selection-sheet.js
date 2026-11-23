/** 底部单选菜单内容；宿主负责窗口与动画，组件只管理独立草稿及显式提交。 */
import { escapeHtml, icon } from './ui.js';

/** 挂载固定操作栏和滚动单选列表，关闭时释放事件，不保存未确认选择。 */
export function mountSelectionSheet(root, { title, cancelLabel, confirmLabel, value, options, onCancel, onConfirm }) {
  let draft = value;
  let finished = false;
  root.classList.add('selection-menu');
  root.innerHTML = `<div class="selection-menu-header"><button type="button" data-selection-action="cancel">${escapeHtml(cancelLabel)}</button><h2>${escapeHtml(title)}</h2><button type="button" data-selection-action="confirm">${escapeHtml(confirmLabel)}</button></div>
    <div class="selection-menu-scroll" role="radiogroup" aria-label="${escapeHtml(title)}">${options.map((option) => `<button type="button" role="radio" aria-checked="${option.value === draft}" data-selection-value="${escapeHtml(option.value)}"><span>${escapeHtml(option.label)}</span><span class="selection-menu-check" aria-hidden="true">${icon('check')}</span></button>`).join('')}</div>`;

  /** 选项只更新草稿及勾选外观，不关闭窗口或触碰业务状态。 */
  function select(nextValue) {
    draft = nextValue;
    root.querySelectorAll('[data-selection-value]').forEach((button) => {
      button.setAttribute('aria-checked', String(button.dataset.selectionValue === draft));
    });
  }

  /** 取消与确认各只执行一次，提交时传回最后选择。 */
  function click(event) {
    if (finished) return;
    const option = event.target.closest('[data-selection-value]');
    if (option && root.contains(option)) { select(option.dataset.selectionValue); return; }
    const action = event.target.closest('[data-selection-action]')?.dataset.selectionAction;
    if (!action) return;
    finished = true;
    if (action === 'confirm') onConfirm(draft);
    else onCancel();
  }

  /** 方向键与首尾键移动单选草稿，Enter 或空格仍使用按钮原生行为。 */
  function keydown(event) {
    if (finished || !event.target.matches('[data-selection-value]')) return;
    if (!['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const buttons = [...root.querySelectorAll('[data-selection-value]')];
    const index = buttons.indexOf(event.target);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : Math.max(0, Math.min(buttons.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1)));
    select(buttons[next].dataset.selectionValue);
    buttons[next].focus();
  }

  root.addEventListener('click', click);
  root.addEventListener('keydown', keydown);
  return () => {
    finished = true;
    root.removeEventListener('click', click);
    root.removeEventListener('keydown', keydown);
  };
}
