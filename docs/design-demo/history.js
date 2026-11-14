/** 历史页的周期筛选、同源统计、趋势与逐条记录；不生成医学评估。 */
import { dates, records } from './data.js';
import { escapeHtml, icon } from './ui.js';
import { init } from '/vendor/echarts.esm.min.js';

/** 将日历日期转换为 UTC，避免夏令时改变周期天数。 */
function calendarDate(value) {
  return new Date(`${value}T00:00:00Z`);
}

/** 以日历日期格式输出周期边界。 */
function dateKey(value) {
  return value.toISOString().slice(0, 10);
}

/** 取得日、自然周或自然月边界；自然周从周一开始。 */
export function periodRange(period, anchor, offset = 0) {
  const start = calendarDate(anchor);
  if (period === 'month') {
    start.setUTCDate(1);
    start.setUTCMonth(start.getUTCMonth() + offset);
    const end = new Date(start);
    end.setUTCMonth(end.getUTCMonth() + 1);
    end.setUTCDate(0);
    return { from: dateKey(start), to: dateKey(end) };
  }
  if (period === 'week') start.setUTCDate(start.getUTCDate() - (start.getUTCDay() + 6) % 7 + offset * 7);
  else start.setUTCDate(start.getUTCDate() + offset);
  const end = new Date(start);
  if (period === 'week') end.setUTCDate(end.getUTCDate() + 6);
  return { from: dateKey(start), to: dateKey(end) };
}

/** 默认定位最近样例所在周，不把固定记录日期改成今天。 */
export function initialHistory() {
  return { metricIndex: 0, period: 'week', anchor: dates.at(-1), ...periodRange('week', dates.at(-1)) };
}

/** 输出用于周期导航的明确日期，不依赖浏览器当前时间。 */
export function rangeLabel(from, to) {
  const display = (date) => date.replaceAll('-', '.');
  return from === to ? display(from) : `${display(from)} — ${display(to)}`;
}

/** 按用户选择的日期范围取得样例下标，日期为空或反向时不返回记录。 */
export function selectedIndices(from, to) {
  if (!from || !to || from > to) return [];
  return dates.flatMap((date, index) => date >= from && date <= to ? [index] : []);
}

/** 从同一条样例取得所有分量，血压按收缩压、舒张压顺序展示。 */
export function reading(metricIndex, index) {
  return records[metricIndex].values.map((series) => series[index]).join(' / ');
}


/** 同一组区间记录计算各分量的均值和范围，不从读数推断健康等级。 */
function summary(metric, indices) {
  const parts = metric.values.map((series) => {
    const values = indices.map((index) => series[index]);
    return {
      average: Math.round(values.reduce((sum, value) => sum + value, 0) / values.length),
      minimum: Math.min(...values),
      maximum: Math.max(...values),
    };
  });
  return {
    average: parts.map((part) => part.average).join(' / '),
    range: parts.map((part, index) => `${parts.length > 1 ? `${metric.labels[index]} ` : ''}${part.minimum}–${part.maximum}`).join('　'),
  };
}

/** 统一主页面与全部记录的单条入口，读数保持中性、不附加医学判断。 */
function recordRow(metricIndex, index) {
  const metric = records[metricIndex];
  const [, month, day] = dates[index].split('-');
  return `<button type="button" class="record-row" data-action="record" data-index="${index}"><span class="record-date">${Number(month)}月${Number(day)}日<small>08:30</small></span><span class="record-reading"><strong>${reading(metricIndex, index)}</strong><small>${metric.unit}</small></span>${icon('chevron')}</button>`;
}

/** 以日历时钟显示图表日期；固定样例的测量时刻为 08:30。 */
function chartDate(value, timeOnly = false) {
  const date = new Date(value);
  const time = `${String(date.getUTCHours()).padStart(2, '0')}:${String(date.getUTCMinutes()).padStart(2, '0')}`;
  return timeOnly ? time : `${date.getUTCMonth() + 1}月${date.getUTCDate()}日 ${time}`;
}

/** 使用实际日期坐标构建 ECharts 折线，不补零、不平滑或预测原始读数。 */
function chartOptions({ metric, indices, from, to }, plot) {
  const styles = getComputedStyle(plot);
  const color = (name) => styles.getPropertyValue(name).trim();
  const day = 86_400_000;
  return {
    animation: false,
    useUTC: true,
    textStyle: { fontFamily: styles.fontFamily },
    grid: { left: 32, right: 16, top: 16, bottom: 28 },
    legend: { show: false, data: metric.labels },
    tooltip: {
      trigger: 'axis', triggerOn: 'mousemove|click', confine: true,
      renderMode: 'html', className: 'history-chart-tooltip', transitionDuration: 0,
      backgroundColor: color('--surface'), borderColor: color('--border'),
      textStyle: { color: color('--ink'), fontSize: 12 },
      axisPointer: { type: 'line', snap: true, lineStyle: { color: color('--muted'), type: 'dashed' } },
      formatter: (items) => {
        if (!items.length) return '';
        return `<strong>${chartDate(items[0].value[0])}</strong>${items.map((item) => `<div><span>${escapeHtml(item.seriesName)}</span><b>${item.value[1]} ${metric.unit}</b></div>`).join('')}`;
      },
    },
    xAxis: {
      type: 'time', min: calendarDate(from).getTime(), max: calendarDate(to).getTime() + day - 1,
      splitNumber: from === to ? 4 : 3,
      axisLine: { show: false }, axisTick: { show: false }, splitLine: { show: false },
      axisLabel: {
        color: color('--muted'), fontSize: 12, hideOverlap: true,
        formatter: (value) => from === to ? chartDate(value, true) : `${new Date(value).getUTCMonth() + 1}/${new Date(value).getUTCDate()}`,
      },
    },
    yAxis: {
      type: 'value', min: metric.domain[0], max: metric.domain.at(-1),
      interval: (metric.domain.at(-1) - metric.domain[0]) / (metric.domain.length - 1),
      axisLine: { show: false }, axisTick: { show: false },
      axisLabel: { color: color('--muted'), fontSize: 12 },
      splitLine: { lineStyle: { color: color('--border'), type: 'dashed' } },
    },
    series: metric.values.map((values, index) => ({
      id: `${metric.key}-${index}`, name: metric.labels[index], type: 'line',
      data: indices.map((position) => [calendarDate(dates[position]).getTime() + 8.5 * 3_600_000, values[position]]),
      showSymbol: true, symbol: 'circle', symbolSize: 7, smooth: false, connectNulls: false,
      lineStyle: { width: 2.5, type: index ? 'dashed' : 'solid' },
      itemStyle: { color: index ? color('--secondary') : color('--history-series'), borderWidth: 2, borderColor: color('--surface') },
      emphasis: { scale: 1.5 },
    })),
  };
}

/** 挂载稳定的历史面板；切换筛选复用 ECharts 实例，离页统一释放。 */
export function mountHistoryPanel(panel) {
  panel.innerHTML = `
    <section class="hist-chart-card">
      <div class="hist-card-heading"><h2></h2><span></span></div>
      <div class="hist-summary-label"></div>
      <div class="hist-latest"><b></b><small></small></div>
      <p class="hist-range"></p>
      <div class="hist-chart" role="img"></div>
      <div class="empty-history" hidden>
        <span class="hist-empty-mark">${icon('heart')}</span><strong></strong><span class="hist-empty-hint"></span>
      </div>
      <div class="hist-legend" role="group" aria-label="显示或隐藏趋势曲线"></div>
    </section>
    <div class="records-title"><h3></h3><button type="button" data-action="all-records">查看全部 ${icon('chevron')}</button></div>
    <ul class="history-records"></ul><div class="history-records-empty" hidden></div>`;
  const card = panel.querySelector('.hist-chart-card');
  const plot = panel.querySelector('.hist-chart');
  const legend = panel.querySelector('.hist-legend');
  let chart;
  let current;

  /** 在容器可见且尺寸有效后创建实例；空态不生成图表数据。 */
  function renderChart() {
    if (!current.indices.length || !plot.clientWidth || !plot.clientHeight) return;
    if (!chart) {
      chart = init(plot, null, { renderer: 'svg' });
      chart.on('legendselectchanged', (event) => {
        legend.querySelectorAll('button').forEach((button) => {
          button.setAttribute('aria-pressed', String(event.selected[button.textContent]));
        });
      });
    }
    chart.resize();
    chart.setOption(chartOptions(current, plot), { notMerge: true });
  }

  /** 图例只改变曲线可见性，区间统计与记录不随显隐变化。 */
  function toggleSeries(event) {
    const button = event.target.closest('[data-series]');
    if (button) chart.dispatchAction({ type: 'legendToggleSelect', name: button.textContent });
  }

  /** 统计、图表和记录从同一组区间下标派生，保持画布节点不变。 */
  function update({ metricIndex, from, to }) {
    const metric = records[metricIndex];
    const indices = metric.values.length ? selectedIndices(from, to) : [];
    const available = indices.length > 0;
    const statistics = available ? summary(metric, indices) : null;
    const emptyMessage = metricIndex === 4 ? '暂无评估记录' : '这个区间还没有测量记录';
    current = { metric, indices, from, to };
    card.dataset.metric = metric.key;
    panel.querySelector('.hist-card-heading h2').textContent = metricIndex === 4 ? '评估记录' : `${metricIndex === 2 ? '呼吸率' : metric.name}趋势`;
    panel.querySelector('.hist-card-heading > span').textContent = `${indices.length} 条记录`;
    panel.querySelector('.hist-summary-label').textContent = metricIndex === 4 ? '评估结果' : '区间平均';
    panel.querySelector('.hist-latest b').textContent = statistics?.average ?? '—';
    panel.querySelector('.hist-latest small').textContent = metric.unit;
    panel.querySelector('.hist-range').textContent = statistics ? `${statistics.range} ${metric.unit}` : '暂无数据';
    panel.querySelector('.empty-history').hidden = available;
    panel.querySelector('.empty-history strong').textContent = emptyMessage;
    panel.querySelector('.hist-empty-hint').textContent = metricIndex === 4 ? '完成评估后，可在这里回看结果' : '试试其他日期，或完成一次检测';
    plot.hidden = !available;
    plot.setAttribute('aria-label', `${metric.title}，${from}至${to}，${indices.length}条记录趋势，具体数值见下方测量记录`);
    legend.hidden = !available;
    legend.innerHTML = available ? metric.labels.map((label, index) => `<button type="button" data-series="${index}" aria-pressed="true">${label}</button>`).join('') : '';
    panel.querySelector('.records-title h3').textContent = metricIndex === 4 ? '评估记录' : '测量记录';
    panel.querySelector('[data-action="all-records"]').disabled = !available;
    const list = panel.querySelector('.history-records');
    list.hidden = !available;
    list.innerHTML = indices.slice(-3).reverse().map((index) => `<li>${recordRow(metricIndex, index)}</li>`).join('');
    const emptyRecords = panel.querySelector('.history-records-empty');
    emptyRecords.hidden = available;
    emptyRecords.textContent = emptyMessage;
    chart?.dispatchAction({ type: 'hideTip' });
    if (available) renderChart();
    else chart?.clear();
  }

  const observer = new ResizeObserver(() => {
    if (!current?.indices.length || !plot.clientWidth || !plot.clientHeight) return;
    if (chart) chart.resize();
    else renderChart();
  });
  observer.observe(plot);
  legend.addEventListener('click', toggleSeries);

  /** 移除图例监听、尺寸观察及 ECharts 实例，不保留跨页面资源。 */
  function dispose() {
    observer.disconnect();
    legend.removeEventListener('click', toggleSeries);
    chart?.dispose();
  }

  return { update, dispose };
}

/** 展示当前指标与区间的完整倒序列表，复用主页面的记录详情入口。 */
export function allRecords({ metricIndex, from, to }) {
  const metric = records[metricIndex];
  const indices = metric.values.length ? selectedIndices(from, to).reverse() : [];
  if (!indices.length) return '<p>此期间暂无记录。</p>';
  return `<p class="scope-note">${escapeHtml(rangeLabel(from, to))}，共 ${indices.length} 条记录</p><ul class="history-records">${indices.map((index) => `<li>${recordRow(metricIndex, index)}</li>`).join('')}</ul>`;
}
