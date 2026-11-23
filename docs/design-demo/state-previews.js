/** 仅由状态设计侧栏切换异步预览，不向手机业务界面或外部操作区添加状态按钮。 */
import { escapeHtml } from './ui.js';

/** 首页保留局部刷新与 Toast；历史首次和刷新共用页面加载及失败。 */
const dataStates = [
  ['success', '成功'], ['loading', '首次加载'], ['empty', '暂无数据'],
  ['failed', '获取失败提示'], ['refreshing', '刷新中'], ['refresh-failed', '刷新失败提示'],
];
const historyDataStates = [
  ['success', '成功'], ['loading', '加载中'], ['empty', '暂无数据'], ['failed', '获取失败'],
];
/** 报告只存在成功、部分成功、加载和获取失败，不提供检测失败报告。 */
const reportStates = [
  ['success', '成功'], ['loading', '报告加载中'], ['partial', '部分成功'],
  ['partial-quality', '部分成功（质量不足）'], ['query-failed', '结果获取失败'],
  ['wave-loading', '波形加载中'], ['wave-failed', '波形读取失败'],
];
/** 质量不足是同一检测结果的原因样例，不是新增的业务结果类别。 */
const measurementStates = [
  ['success', '成功'], ['waiting', '等待结果'], ['partial', '部分成功'],
  ['partial-quality', '部分成功（质量不足）'], ['failed', '检测失败'],
  ['failed-quality', '检测失败（质量不足）'], ['query-failed', '结果获取失败'],
  ['task-failed', '任务创建失败'],
];

/** 每组保留原成功路由，其余状态使用可直接打开的独立地址。 */
export const previewGroups = [
  { route: 'home', title: '首页', states: dataStates },
  { route: 'history', title: '历史', states: historyDataStates },
  { route: 'fingertip-measurement', title: '指尖检测', states: measurementStates },
  { route: 'fingertip-results', title: '指尖详细结果', states: reportStates },
  { route: 'blood-pressure-measurement', title: '血压检测', states: measurementStates.filter(([state]) => !state.startsWith('partial')) },
  { route: 'blood-pressure-results', title: '血压详细结果', states: reportStates.filter(([state]) => !state.startsWith('partial')) },
];

/** 成功态继续使用既有页面；检测成功预览直接展开本轮结果。 */
export function statePreviewRoute(route, state) {
  if (route === 'home' && state === 'success') return 'home-logged-in';
  if (route.endsWith('-measurement') && state === 'success') return `${route}-success`;
  return state === 'success' ? route : `${route}-${state}`;
}

/** 路由元信息由预览目录一次生成，不另建与业务页面重复的页面模板。 */
export const statePreviews = Object.fromEntries(previewGroups.flatMap((group) => group.states
  .filter(([state]) => state !== 'success' || group.route.endsWith('-measurement'))
  .map(([state, label]) => {
    const dataPage = group.route === 'home' || group.route === 'history';
    const dataState = group.route === 'home' && (state === 'failed' || state === 'refresh-failed') ? 'empty' : state;
    const feedback = group.route === 'home' && state === 'failed'
      ? { message: '数据获取失败，请稍后重试', tone: 'error' }
      : group.route === 'home' && state === 'refresh-failed'
        ? { message: '刷新失败，请稍后重试', tone: 'error' } : null;
    return [statePreviewRoute(group.route, state), {
      route: group.route,
      ...(group.route === 'home' ? { loggedIn: true } : {}),
      ...(dataPage ? { dataState } : { resultState: state }),
      feedback, group: group.route, label,
    }];
  })));


/** 将衍生状态直接挂在对应的成功页面下，不再创建独立状态分组。 */
export function statePreviewChildren(route, extra = '') {
  const group = previewGroups.find((item) => item.route === route);
  const states = group?.states.filter(([state]) => state !== 'success') ?? [];
  if (states.length === 0 && !extra) return '';
  return `<ul class="demo-derived-views">${states.map(([state, label]) => `<li><a href="#${statePreviewRoute(route, state)}">${escapeHtml(label)}</a></li>`).join('')}${extra}</ul>`;
}
