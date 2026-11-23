/** 历史日期选择的独立草稿与年月日面板；确认前不改变页面筛选。 */
import { escapeHtml, icon } from './ui.js';

/** 以 UTC 日历构造固定六行网格，空格占位避免切月时高度跳变。 */
function monthCells(month) {
  const first = new Date(`${month}-01T00:00:00Z`);
  const length = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  const cells = Array(first.getUTCDay()).fill(null);
  for (let day = 1; day <= length; day += 1) cells.push(`${month}-${String(day).padStart(2, '0')}`);
  while (cells.length < 42) cells.push(null);
  return cells;
}

/** 挂载受控日历，返回离开弹层时释放事件的清理函数。 */
export function mountHistoryDatePicker(root, range, { onConfirm, onCancel }) {
  /** 起止日期只存在于当前弹层，取消直接丢弃。 */
  const draft = { from: range.from, to: range.to };
  let field = 'from';
  let month = draft.from.slice(0, 7);
  let mode = 'day';
  let yearPage = Math.floor(Number(month.slice(0, 4)) / 12) * 12;
  let invalid = false;
  let dateSelected = false;

  /** 标记当前状态并输出独立点击区；高亮只绘制在内部背景层。 */
  function option(action, value, label, selected = false, inside = false) {
    return `<button type="button" data-calendar-action="${action}" data-value="${escapeHtml(value)}" aria-pressed="${selected}"${action === 'date' ? ` aria-label="${value}"` : ''}><span class="calendar-highlight${selected ? ' is-selected' : ''}${inside ? ' is-inside' : ''}" aria-hidden="true"></span><span>${label}</span></button>`;
  }

  /** 面板切换只替换日历内容，不触碰弹层生命周期和已提交筛选。 */
  function render() {
    const year = month.slice(0, 4);
    const monthNumber = month.slice(5);
    const heading = mode === 'year'
      ? `<button type="button" data-calendar-action="year" aria-label="选择年份" aria-pressed="true">${yearPage}至${yearPage + 11}</button>`
      : `<button type="button" data-calendar-action="year" aria-label="选择年份" aria-pressed="false">${year}年</button><button type="button" data-calendar-action="month" aria-label="选择月份" aria-pressed="${mode === 'month'}">${monthNumber}月</button>`;
    const cells = mode === 'day'
      ? `<div class="calendar-weekdays">${['日', '一', '二', '三', '四', '五', '六'].map((day) => `<span>${day}</span>`).join('')}</div><div class="calendar-days">${monthCells(month).map((date) => date ? option('date', date, Number(date.slice(-2)), date === draft.from || date === draft.to, date > draft.from && date < draft.to) : '<span></span>').join('')}</div>`
      : `<div class="calendar-options">${Array.from({ length: 12 }, (_, index) => {
        const value = mode === 'year' ? yearPage + index : index + 1;
        const selected = value === Number(mode === 'year' ? year : monthNumber);
        return option('choose', value, `${value}${mode === 'month' ? '月' : ''}`, selected);
      }).join('')}</div>`;
    root.innerHTML = `<form class="history-calendar">
      <div class="calendar-fields">${['from', 'to'].map((name) => `<button type="button" data-calendar-action="field" data-value="${name}" aria-pressed="${field === name}"><span>${name === 'from' ? '起始日期' : '结束日期'}</span><strong>${draft[name]}</strong></button>`).join('')}</div>
      <div class="calendar-navigation"><button type="button" data-calendar-action="move" data-value="-1" aria-label="${mode === 'day' ? '上个月' : mode === 'month' ? '上一年' : '上十二年'}">${icon('arrow')}</button><div class="calendar-heading">${heading}</div><button type="button" data-calendar-action="move" data-value="1" aria-label="${mode === 'day' ? '下个月' : mode === 'month' ? '下一年' : '下十二年'}">${icon('arrow')}</button></div>
      ${cells}
      ${invalid ? '<p class="error-date" role="alert">开始日期不能晚于结束日期</p>' : ''}
      <div class="calendar-actions"><button type="button" class="sheet-secondary" data-calendar-action="cancel">取消</button><button type="submit" class="cta">确认</button></div>
    </form>`;
  }

  /** 日、月、年切换都只更新草稿；选开始日期后自动转到结束日期。 */
  function click(event) {
    const control = event.target.closest('[data-calendar-action]');
    if (!control || !root.contains(control)) return;
    const { calendarAction: action, value } = control.dataset;
    if (action === 'cancel') return onCancel();
    if (action === 'field') { field = value; month = draft[field].slice(0, 7); mode = 'day'; }
    if (action === 'year') {
      yearPage = Math.floor(Number(month.slice(0, 4)) / 12) * 12;
      mode = mode === 'year' ? 'day' : 'year';
    }
    if (action === 'month') mode = mode === 'month' ? 'day' : 'month';
    if (action === 'move') {
      const direction = Number(value);
      if (mode === 'year') yearPage += direction * 12;
      else if (mode === 'month') month = `${Number(month.slice(0, 4)) + direction}${month.slice(4)}`;
      else {
        const date = new Date(`${month}-01T00:00:00Z`);
        month = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + direction, 1)).toISOString().slice(0, 7);
      }
    }
    if (action === 'choose') {
      month = mode === 'year' ? `${value}${month.slice(4)}` : `${month.slice(0, 4)}-${String(value).padStart(2, '0')}`;
      mode = mode === 'year' ? 'month' : 'day';
    }
    if (action === 'date') { draft[field] = value; dateSelected = true; invalid = false; if (field === 'from') field = 'to'; }
    render();
    const selector = `[data-calendar-action="${action}"]${value !== undefined ? `[data-value="${value}"]` : ''}`;
    (root.querySelector(selector) || root.querySelector('.calendar-options [aria-pressed="true"]') || root.querySelector('[data-calendar-action="month"]') || root.querySelector('[data-calendar-action="year"]')).focus();
  }

  /** 未点选日期时原样返回；反向范围留在弹层反馈，合法选择一次性提交。 */
  function submit(event) {
    event.preventDefault();
    if (!dateSelected) { onCancel(); return; }
    invalid = draft.from > draft.to;
    if (invalid) { render(); root.querySelector('[data-calendar-action="field"][data-value="to"]').focus(); return; }
    onConfirm({ ...draft });
  }

  root.addEventListener('click', click);
  root.addEventListener('submit', submit);
  render();
  root.querySelector('button').focus();
  return () => { root.removeEventListener('click', click); root.removeEventListener('submit', submit); };
}
