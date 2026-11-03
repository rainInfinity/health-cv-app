/** 固定样例的日期过滤、趋势与记录展示；没有预测、阈值推断或缺失补零。 */
import { dates, records, tokens } from './data.js';
import { escapeHtml } from './ui.js';

/** 按用户选择的日期范围取得样例下标，日期为空或反向时不返回记录。 */
export function selectedIndices(from, to) {
  if (!from || !to || from > to) return [];
  return dates.flatMap((date, index) => date >= from && date <= to ? [index] : []);
}

/** 从同一条样例取得所有分量，血压按收缩压、舒张压顺序展示。 */
export function reading(metricIndex, index) {
  return records[metricIndex].values.map((series) => series[index]).join(' / ');
}

/** 根据真实日期位置绘制折线；单点只画圆点，不制造趋势。 */
function chart(metric, indices) {
  const minimum = metric.domain[0];
  const maximum = metric.domain.at(-1);
  const x = (position) => indices.length === 1 ? 146 : 34 + position * 224 / (indices.length - 1);
  const y = (value) => 106 - (value - minimum) / (maximum - minimum) * 88;
  const grid = metric.domain.map((value) => `<line x1="32" y1="${y(value)}" x2="270" y2="${y(value)}" stroke="${tokens.border}" stroke-dasharray="3 4"/><text x="24" y="${y(value) + 4}" text-anchor="end">${value}</text>`).join('');
  const series = metric.values.map((values, seriesIndex) => {
    const color = seriesIndex === 0 ? tokens.brand.action : tokens.text.secondary;
    const points = indices.map((index, position) => `${x(position)},${y(values[index])}`).join(' ');
    const line = indices.length > 1 ? `<polyline points="${points}" fill="none" stroke="${color}" stroke-width="2" ${seriesIndex ? 'stroke-dasharray="4 3"' : ''}/>` : '';
    const dots = indices.map((index, position) => `<circle cx="${x(position)}" cy="${y(values[index])}" r="3" fill="white" stroke="${color}" stroke-width="2"/>`).join('');
    return line + dots;
  }).join('');
  const endpoints = indices.length === 1 ? [indices[0]] : [indices[0], indices.at(-1)];
  const labels = endpoints.map((index) => `<text x="${x(indices.indexOf(index))}" y="134" text-anchor="middle">10/${25 + index}</text>`).join('');
  return `<svg class="hist-chart" viewBox="0 0 294 140" role="img" aria-label="${metric.title}所选日期内的${indices.length}条示例记录趋势，具体数值见历史记录">${grid}${series}${labels}</svg>`;
}

/** 日期和指标的唯一展示派生，列表与趋势始终使用同一组记录。 */
export function historyPanel({ metricIndex, from, to }) {
  const metric = records[metricIndex];
  const invalid = !from || !to || from > to;
  const indices = selectedIndices(from, to);
  const available = !invalid && indices.length > 0 && metric.values.length > 0;
  const count = available ? indices.length : 0;
  const value = available ? reading(metricIndex, indices.at(-1)) : '—';
  const emptyMessage = invalid ? '请重新选择有效的日期范围' : metricIndex === 4 ? '此期间暂无评估记录<br>有结果后展示历次评估' : '此期间暂无测量记录<br>换个日期范围看看';
  const legend = metricIndex === 0 && available
    ? '<span><i></i>收缩压</span><span><i class="dash"></i>舒张压</span>'
    : `<span>${metricIndex === 4 ? '按次展示评估结果' : '每个圆点代表一次记录'}</span>`;
  const last = indices.at(-1);
  const row = available
    ? `<button type="button" class="record-row" data-action="record" data-index="${last}"><span>10月${25 + last}日 <small>08:30</small></span><span>${value} <small>${metric.unit}</small></span></button>`
    : '<div class="record-row"><small>所选日期范围暂无记录</small></div>';
  return {
    invalid,
    html: `<section class="hist-chart-card"><h2>${metric.title}<span>${available ? '最近结果' : '尚无记录'}</span></h2><div class="hist-latest"><b>${value}</b><small>${metric.unit}</small></div>${available ? chart(metric, indices) : `<div class="empty-history">${emptyMessage}</div>`}<div class="hist-legend"><span class="keys">${legend}</span><span>${count} 条记录</span></div></section><div class="records-title"><h3>历史记录</h3><button type="button" data-action="all-records">查看全部</button></div>${row}`,
  };
}

/** 提供可逐条点击的数值列表，作为趋势图的文字替代。 */
export function allRecords({ metricIndex, from, to }) {
  const metric = records[metricIndex];
  if (!metric.values.length) return '<p>此期间暂无评估记录。</p>';
  const indices = selectedIndices(from, to).reverse();
  if (!indices.length) return '<p>此期间暂无记录。</p>';
  return `<p class="scope-note">固定示例数据，${escapeHtml(from)} 至 ${escapeHtml(to)}</p><ul class="sheet-list">${indices.map((index) => `<li><button type="button" class="record-row" data-action="record" data-index="${index}"><span>${dates[index]}<br><small>08:30</small></span><span>${reading(metricIndex, index)} <small>${metric.unit}</small></span></button></li>`).join('')}</ul>`;
}
