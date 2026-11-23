/** 历史页的周期筛选、同源统计、趋势与逐条记录；不生成医学评估。 */
import { dates, records } from './data.js';
import { escapeHtml, icon } from './ui.js';
import { init, color as chartColor } from '/vendor/echarts.esm.min.js';

/** 将日历日期转换为 UTC，避免夏令时改变周期天数。 */
function calendarDate(value) {
  return new Date(`${value}T00:00:00Z`);
}

/** 以日历日期格式输出周期边界。 */
function dateKey(value) {
  return value.toISOString().slice(0, 10);
}

/** 按所选天数计算含基准日在内的连续区间，前后切换移动一个完整区间。 */
export function periodRange(period, anchor, offset = 0) {
  const days = Number(period);
  const end = calendarDate(anchor);
  end.setUTCDate(end.getUTCDate() + offset * days);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - days + 1);
  return { from: dateKey(start), to: dateKey(end) };
}

/** 固定以十月末为预览基准，默认展示截至该日的连续7天。 */
export function initialHistory() {
  return { metricIndex: 0, period: '7', anchor: '2026-10-31', ...periodRange('7', '2026-10-31') };
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
  return metric.values.map((series) => {
    const values = indices.map((index) => series[index]);
    return {
      average: Math.round(values.reduce((sum, value) => sum + value, 0) / values.length),
      minimum: Math.min(...values),
      maximum: Math.max(...values),
    };
  });
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

/** 按实际日期绘制平滑趋势和渐变面积；平滑仅影响连线，不改写读数或补零。 */
function chartOptions({ metric, indices, times, from, to, statistics }, plot) {
  const styles = getComputedStyle(plot);
  const color = (name) => styles.getPropertyValue(name).trim();
  const day = 86_400_000;
  return {
    animation: true,
    animationDuration: 350,
    animationDurationUpdate: 350,
    animationEasing: 'cubicOut',
    animationEasingUpdate: 'cubicOut',
    useUTC: true,
    textStyle: { fontFamily: styles.fontFamily },
    grid: { left: 0, right: 32, top: 52, bottom: 28 },
    legend: { show: false, data: metric.labels, selected: Object.fromEntries(metric.labels.map((label) => [label, true])) },
    tooltip: {
      trigger: 'axis', triggerOn: 'none', confine: true,
      renderMode: 'html', className: 'history-chart-tooltip', transitionDuration: 0,
      backgroundColor: color('--surface'), borderColor: color('--border'),
      textStyle: { color: color('--ink'), fontSize: 12 },
      axisPointer: { type: 'line', snap: true, animation: false, lineStyle: { color: color('--muted'), type: 'dashed' } },
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
        color: color('--muted'), fontSize: 12, hideOverlap: true, showMinLabel: true, alignMinLabel: 'left',
        formatter: (value) => from === to ? chartDate(value, true) : `${new Date(value).getUTCMonth() + 1}/${new Date(value).getUTCDate()}`,
      },
    },
    yAxis: {
      type: 'value', position: 'right', min: metric.domain[0], max: metric.domain.at(-1),
      interval: (metric.domain.at(-1) - metric.domain[0]) / (metric.domain.length - 1),
      axisLine: { show: false }, axisTick: { show: false },
      axisLabel: { color: color('--muted'), fontSize: 12 },
      splitLine: { lineStyle: { color: color('--border'), type: 'dashed' } },
    },
    series: metric.values.map((values, index) => {
      const seriesColor = color(index ? '--mint' : '--primary');
      const { minimum, maximum } = statistics[index];
      const labelAlign = (value) => {
        const position = indices.findIndex((sample) => values[sample] === value);
        return position === 0 ? 'left' : position >= indices.length - 2 ? 'right' : 'center';
      };
      return {
        id: `history-${index}`, name: metric.labels[index], type: 'line',
        data: indices.map((position, sample) => [times[sample], values[position]]),
        showSymbol: false, symbol: 'circle', symbolSize: 7, smooth: .3, smoothMonotone: 'x', connectNulls: false,
        lineStyle: { width: 2.5, type: index ? 'dashed' : 'solid', color: seriesColor },
        markPoint: {
          symbolSize: 0, silent: true,
          label: {
            show: true, color: color('--secondary'), fontSize: 11, distance: 6,
            backgroundColor: chartColor.modifyAlpha(color('--surface'), .9), padding: [3, 5], borderRadius: 5,
            rich: { icon: { color: seriesColor, fontSize: 10 } },
          },
          data: minimum === maximum
            ? [{ type: 'max', name: '最高 / 最低', label: { formatter: '{icon|▲▼} {c}', position: 'top', align: labelAlign(maximum) } }]
            : [
              { type: 'max', name: '最高', label: { formatter: '{icon|▲} {c}', position: 'top', align: labelAlign(maximum) } },
              { type: 'min', name: '最低', label: { formatter: '{icon|▼} {c}', position: 'bottom', align: labelAlign(minimum) } },
            ],
        },
        areaStyle: {
          origin: 'start', opacity: .28,
          color: {
            type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [{ offset: 0, color: seriesColor }, { offset: 1, color: chartColor.modifyAlpha(seriesColor, 0) }],
          },
        },
        itemStyle: { color: color('--surface'), borderWidth: 2, borderColor: seriesColor },
        emphasis: { scale: 1.5, itemStyle: { color: color('--surface'), borderColor: seriesColor } },
      };
    }),
  };
}

/** 挂载稳定的历史面板；切换筛选复用 ECharts 实例，离页统一释放。 */
export function mountHistoryPanel(panel) {
  panel.innerHTML = `
    <section class="hist-trend">
      <div class="hist-trend-heading"><h2></h2><span></span></div>
      <div class="hist-chart-stage">
        <div class="hist-chart" role="img"></div>
        <div class="hist-legend" role="group" aria-label="显示或隐藏趋势曲线"></div>
      </div>
      <div class="empty-history" hidden>
        <span class="hist-empty-mark">${icon('heart')}</span><strong></strong><span class="hist-empty-hint"></span>
      </div>
    </section>
    <div class="hist-stat-cards" role="group" aria-label="当前区间平均数据"></div>
    <div class="records-title"><h3></h3><button type="button" data-action="all-records">查看全部 ${icon('chevron')}</button></div>
    <ul class="history-records"></ul><div class="history-records-empty" hidden></div>`;
  const stage = panel.querySelector('.hist-chart-stage');
  const plot = panel.querySelector('.hist-chart');
  const legend = panel.querySelector('.hist-legend');
  const statisticsCards = panel.querySelector('.hist-stat-cards');
  let chart;
  let current;
  /** 手势只选择记录，不改变坐标范围；松手后保留最后一条。 */
  let pointer;
  let lastPoint = null;

  /** 在容器可见且尺寸有效后创建实例；空态不生成图表数据。 */
  function renderChart() {
    if (!current.indices.length || !plot.clientWidth || !plot.clientHeight) return;
    if (!chart) {
      chart = init(plot, null, { renderer: 'svg' });
      chart.on('legendselectchanged', (event) => {
        legend.querySelectorAll('button').forEach((button) => {
          button.setAttribute('aria-pressed', String(event.selected[button.textContent]));
        });
        lastPoint = null;
        chart.dispatchAction({ type: 'hideTip' });
      });
    }
    chart.resize();
    chart.setOption(chartOptions(current, plot), { replaceMerge: ['series'] });
  }

  /** 图例只改变曲线可见性，区间统计与记录不随显隐变化。 */
  function toggleSeries(event) {
    const button = event.target.closest('[data-series]');
    if (button) chart.dispatchAction({ type: 'legendToggleSelect', name: button.textContent });
  }

  /** 按横向坐标查找最近实际记录，只在跨过记录位置时更新提示。 */
  function showReading(clientX) {
    if (!chart || !current?.indices.length) return;
    const seriesIndex = [...legend.querySelectorAll('button')].findIndex((button) => button.getAttribute('aria-pressed') === 'true');
    if (seriesIndex < 0) return;
    const timestamp = chart.convertFromPixel({ xAxisIndex: 0 }, clientX - plot.getBoundingClientRect().left);
    if (!Number.isFinite(timestamp)) return;
    let nearest = 0;
    for (let index = 1; index < current.times.length; index += 1) {
      if (Math.abs(current.times[index] - timestamp) < Math.abs(current.times[nearest] - timestamp)) nearest = index;
    }
    if (nearest === lastPoint) return;
    if (lastPoint !== null) chart.dispatchAction({ type: 'downplay', dataIndex: lastPoint });
    lastPoint = nearest;
    chart.dispatchAction({ type: 'highlight', dataIndex: nearest });
    chart.dispatchAction({ type: 'showTip', seriesIndex, dataIndex: nearest });
  }

  /** 鼠标与触摸共用按下查看，纵向触摸仍交给页面滚动。 */
  function pointerDown(event) {
    if (!event.isPrimary || event.button !== 0) return;
    pointer = { id: event.pointerId, x: event.clientX, y: event.clientY, horizontal: false };
    showReading(event.clientX);
  }

  /** 明确横向移动后捕获指针，离开图表边缘仍可连续选点。 */
  function pointerMove(event) {
    if (!pointer || event.pointerId !== pointer.id) return;
    if (!pointer.horizontal) {
      const dx = Math.abs(event.clientX - pointer.x);
      const dy = Math.abs(event.clientY - pointer.y);
      if (dy > 6 && dy >= dx) { pointer = undefined; return; }
      if (dx <= 6 || dx <= dy) return;
      pointer.horizontal = true;
      plot.setPointerCapture(event.pointerId);
    }
    showReading(event.clientX);
  }

  /** 松手或取消只结束手势，保留最后一次查看，不延续到新筛选。 */
  function pointerEnd(event) {
    if (!pointer || event.pointerId !== pointer.id) return;
    pointer = undefined;
    if (plot.hasPointerCapture(event.pointerId)) plot.releasePointerCapture(event.pointerId);
  }

  /** 统计、图表和记录从同一组区间下标派生，保持画布节点不变。 */
  function update({ metricIndex, from, to }) {
    const metric = records[metricIndex];
    const indices = metric.values.length ? selectedIndices(from, to) : [];
    const available = indices.length > 0;
    const statistics = available ? summary(metric, indices) : [];
    const emptyMessage = metricIndex === 4 ? '暂无评估记录' : '这个区间还没有测量记录';
    current = { metric, indices, times: indices.map((position) => calendarDate(dates[position]).getTime() + 8.5 * 3_600_000), from, to, statistics };
    pointer = undefined;
    lastPoint = null;
    panel.querySelector('.hist-trend-heading h2').textContent = metricIndex === 4 ? '评估记录' : `${metricIndex === 2 ? '呼吸率' : metric.name}趋势`;
    panel.querySelector('.hist-trend-heading > span').textContent = `${indices.length} 条记录`;
    statisticsCards.hidden = !available;
    statisticsCards.innerHTML = statistics.map((part, index) => `
      <article class="hist-stat-card">
        <h3>平均${metric.labels[index]}</h3>
        <div class="hist-average"><b>${part.average}</b><small>${metric.unit}</small></div>
        <dl class="hist-extremes">
          <div><dt><span class="hist-extreme-mark" aria-hidden="true">▲</span>最高</dt><dd>${part.maximum}<small>${metric.unit}</small></dd></div>
          <div><dt><span class="hist-extreme-mark" aria-hidden="true">▼</span>最低</dt><dd>${part.minimum}<small>${metric.unit}</small></dd></div>
        </dl>
      </article>`).join('');
    panel.querySelector('.empty-history').hidden = available;
    panel.querySelector('.empty-history strong').textContent = emptyMessage;
    panel.querySelector('.hist-empty-hint').textContent = metricIndex === 4 ? '完成评估后，可在这里回看结果' : '试试其他日期，或完成一次检测';
    stage.hidden = !available;
    plot.setAttribute('aria-label', `${metric.title}，${from}至${to}，${indices.length}条记录趋势，具体数值见下方测量记录`);
    legend.innerHTML = available ? metric.labels.map((label, index) => `<button type="button" data-series="${index}" aria-pressed="true">${label}</button>`).join('') : '';
    panel.querySelector('.records-title h3').textContent = metricIndex === 4 ? '最近评估记录' : '最近测量记录';
    panel.querySelector('[data-action="all-records"]').disabled = !available;
    const list = panel.querySelector('.history-records');
    list.hidden = !available;
    list.innerHTML = indices.slice(-10).reverse().map((index) => `<li>${recordRow(metricIndex, index)}</li>`).join('');
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
  plot.addEventListener('pointerdown', pointerDown);
  plot.addEventListener('pointermove', pointerMove);
  plot.addEventListener('pointerup', pointerEnd);
  plot.addEventListener('pointercancel', pointerEnd);
  plot.addEventListener('lostpointercapture', pointerEnd);

  /** 移除图例监听、尺寸观察及 ECharts 实例，不保留跨页面资源。 */
  function dispose() {
    observer.disconnect();
    legend.removeEventListener('click', toggleSeries);
    plot.removeEventListener('pointerdown', pointerDown);
    plot.removeEventListener('pointermove', pointerMove);
    plot.removeEventListener('pointerup', pointerEnd);
    plot.removeEventListener('pointercancel', pointerEnd);
    plot.removeEventListener('lostpointercapture', pointerEnd);
    pointer = undefined;
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
