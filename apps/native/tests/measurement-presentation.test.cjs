// 在最小原生宿主中消费真实报告组件，检查可见读数、声明、失败操作及空仪表。
const assert = require('node:assert/strict');
const test = require('node:test');
const Module = require('node:module');
const path = require('node:path');
const root = path.resolve(__dirname, '../node_modules/.cache/native-test');
const copy = require('../src/app/i18n/locales/zh-CN.json');
let reportState, theme;
const Value = class { interpolate() { return 0; } };
const react = {
  useEffect() {}, useId: () => 'test', useRef: (current) => ({ current }),
  useState: (value) => [typeof value === 'function' ? value() : value, () => {}],
  useMemo: (create) => create(), useCallback: (callback) => callback,
};
const messages = (namespace) => Object.fromEntries(Object.entries(copy[namespace]).map(([key, value]) => [key,
  value.includes('{') ? (params) => value.replace(/\{(\w+)\}/g, (_, name) => params[name]) : value,
]));
const styles = new Proxy({ __esModule: true }, { get: (target, key) => key in target ? target[key] : String(key) });
const host = new Proxy({ __esModule: true, default: 'Svg' }, { get: (target, key) => key in target ? target[key] : String(key) });

function withNativeHost(action) {
  const original = Module._load;
  Module._load = function(request, parent, isMain) {
    if (request === 'react') return react;
    if (request === 'react/jsx-runtime') return { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }), Fragment: 'Fragment' };
    if (request === 'react-native') return { View: 'View', Animated: { Value }, Platform: { Version: 37, select: (options) => options.android }, AppState: { currentState: 'active' }, useWindowDimensions: () => ({ width: 390, height: 844 }), PanResponder: { create: () => ({ panHandlers: {} }) } };
    if (request === 'react-native-svg') return host;
    if (request === 'styled-components/native') return { useTheme: () => theme };
    if (request === '@nanostores/react') return { useStore: (store) => store.get() };
    if (request === '@react-navigation/native') return { useIsFocused: () => true, useNavigation: () => ({ goBack() {}, navigate() {} }), useRoute: () => ({ params: { taskId: 42 } }) };
    if (request.endsWith('/useMeasurementReport') || request === './useMeasurementReport') return { useMeasurementReport: () => reportState };
    if (request === '@/app/i18n') return { defineFeatureMessages: (namespace) => ({ get: () => messages(namespace) }) };
    if (request === '@/app/providers/AppProviders') return { useAppServices: () => ({ auth: { getSessionGeneration: () => 1, isAuthenticatedAt: () => true } }) };
    if (request === '@/app/auth/useAuthState') return { useAuthState: () => ({ status: 'authenticated' }) };
    if (request.endsWith('/styles') || request === './styles') return styles;
    if (request === '@/shared/graphics') return { HealthIndicatorArtwork: original.call(this, path.join(root, 'shared/graphics/illustrations/HealthIndicatorArtwork/HealthIndicatorArtwork.js'), parent, isMain).HealthIndicatorArtwork, ArrowRight: 'ArrowRight', CircleCheck: 'CircleCheck', XinmuLogo: 'Logo' };
    if (request === '@/shared/components/AppText') return { AppText: 'AppText' };
    if (request === '@/shared/components/ActionButton') return { ActionButton: (props) => ({ type: 'ActionButton', props: { ...props, children: props.label } }) };
    if (request === '@/shared/components/PageContainer') return { PageContainer: 'PageContainer' };
    if (request === '@/shared/components/LoadingIndicator') return { LoadingIndicator: 'LoadingIndicator' };
    if (request === '@/shared/components/PulseWaveChart') return { PulseWaveChart: 'PulseWaveChart' };
    if (request.startsWith('@/')) return original.call(this, path.join(root, request.slice(2)), parent, isMain);
    return original.call(this, request, parent, isMain);
  };
  try {
    theme = require(path.join(root, 'shared/theme/theme.js')).lightTheme;
    return action();
  } finally { Module._load = original; }
}
function render(node, nodes = []) {
  if (Array.isArray(node)) { node.forEach((child) => render(child, nodes)); return nodes; }
  if (node == null || typeof node === 'boolean') return nodes;
  if (typeof node !== 'object') { nodes.push({ text: String(node) }); return nodes; }
  if (typeof node.type === 'function') return render(node.type(node.props), nodes);
  nodes.push(node); render(node.props?.children, nodes); return nodes;
}
function component(file, name, props = {}) {
  return render(require(path.join(root, file))[name](props));
}
const text = (nodes) => nodes.filter((node) => node.text).map((node) => node.text).join(' ');
const { adaptMeasurementResult } = require(path.join(root, 'app/measurement/resultAdapter.js'));
function report(allFailed = false) {
  const failed = { status: 'FAILED', result: null, failureCode: 'INFERENCE.QUALITY_REJECTED', qualityFailure: { reason: 'LOW_SCORE', details: { score: 61.25, threshold: 70 } } };
  return adaptMeasurementResult({ taskId: 42, status: 'SUCCEEDED', modelCode: 'ppg.active.offline.all', isExample: false, submittedAt: '2026-11-23 08:30:00', result: { outcome: allFailed ? 'ALL_FAILED' : 'PARTIALLY_SUCCEEDED', results: {
    hr_br: { algorithmKey: 'ppg.active.offline.hr_br.v1', ...(allFailed ? failed : { status: 'SUCCEEDED', result: { hr: 79.5, br: 15.2 } }) },
    spo2: { algorithmKey: 'ppg.active.offline.spo2.v1', ...failed },
    diabetes: { algorithmKey: 'ppg.active.offline.diabetes.v1', ...failed },
  } } });
}

test('指尖部分成功保留完成标题和有效值，质量拒绝仅改失败卡且血氧保留空底轨', () => withNativeHost(() => {
  const current = report();
  const nodes = component('pages/measurement/FingertipResults/FingertipResultSummary/FingertipResultSummary.js', 'FingertipResultSummary', { report: current });
  const content = text(nodes);
  assert.ok(content.includes('检测完成'));
  assert.ok(content.includes('79'));
  assert.ok(content.includes('信号质量过低'));
  assert.equal(content.includes('98'), false);
  assert.equal(nodes.filter((node) => node.type === 'Line' && node.props.stroke === theme.colors.border.default).length, 15);
  assert.equal(nodes.filter((node) => node.text === copy.fingertipResults.summaryDisclaimer).length, 1);
}));

test('失败分类仅提供对应重取或重测，不显示声明和详情操作', () => withNativeHost(() => {
  for (const kind of ['detection', 'query', 'creation']) {
    let called = 0;
    const nodes = component('pages/measurement/MeasurementFailure/MeasurementFailure.js', 'MeasurementFailure', { kind, messages: messages('fingertipResults'), onRetry: () => called++ });
    const actions = nodes.filter((node) => node.type === 'ActionButton');
    assert.equal(actions.length, 1);
    assert.equal(actions[0].props.label, kind === 'query' ? '重新获取结果' : '重新检测');
    actions[0].props.onPress(); assert.equal(called, 1);
    assert.equal(text(nodes).includes('医学诊断'), false);
    assert.equal(text(nodes).includes('查看详细结果'), false);
  }
}));

test('两种详细报告首次只有顶栏和加载，获取失败不泄露旧报告或声明', () => withNativeHost(() => {
  for (const type of ['Fingertip', 'BloodPressure']) {
    const file = `pages/measurement/${type}Results/${type}ResultsScreen.js`;
    const name = `${type}ResultsScreen`;
    reportState = { task: undefined, report: null, error: false, refresh() {} };
    const initial = component(file, name);
    assert.ok(text(initial).includes('详细结果'));
    assert.equal(initial.filter((node) => node.type === 'LoadingIndicator').length, 1);
    assert.equal(text(initial).includes('医学诊断'), false);
    reportState = { report: report(), error: true, refresh() {} };
    const failure = component(file, name);
    assert.ok(text(failure).includes('结果获取失败'));
    assert.equal(text(failure).includes('79'), false);
    assert.equal(text(failure).includes('医学诊断'), false);
  }
}));

test('有效指尖部分报告只保留一次声明，失败项解读不附成功建议', () => withNativeHost(() => {
  reportState = { task: undefined, report: report(), error: false, refresh() {} };
  const nodes = component('pages/measurement/FingertipResults/FingertipResultsScreen.js', 'FingertipResultsScreen');
  assert.equal(nodes.filter((node) => node.text === copy.fingertipResults.disclaimer).length, 1);
  assert.equal(text(nodes).includes(copy.fingertipResults.oxygenSaturationAdvice), false);
  assert.equal(text(nodes).includes(copy.fingertipResults.riskGuidance), false);
}));

test('同一风险结果在简要面板保持两行，详细看板和解读完整显示单行等级', () => withNativeHost(() => {
  for (const [level, stacked, inline] of [[0, '较低\n风险', '较低风险'], [1, '中\n风险', '中风险'], [2, '较高\n风险', '较高风险']]) {
    const current = report();
    current.metrics.diabetesRisk = { ...current.metrics.diabetesRisk, status: 'succeeded', riskLevel: level, readings: [{ code: 'diabetes_probability', value: .3, unit: 'ratio' }], quality: null, failureReason: undefined };
    const summary = component('pages/measurement/FingertipResults/FingertipResultSummary/FingertipResultSummary.js', 'FingertipResultSummary', { report: current });
    const dashboard = component('pages/measurement/FingertipResults/FingertipResultDashboard/FingertipResultDashboard.js', 'FingertipResultDashboard', { report: current, detailed: true });
    const interpretations = component('pages/measurement/FingertipResults/FingertipResultInterpretations/FingertipResultInterpretations.js', 'FingertipResultInterpretations', { report: current });
    assert.ok(summary.some((node) => node.text === stacked));
    assert.ok(dashboard.some((node) => node.text === inline));
    assert.ok(interpretations.some((node) => node.text === inline));
    assert.equal(dashboard.some((node) => node.text === stacked), false);
    assert.equal(interpretations.some((node) => node.text === stacked), false);
  }
}));

test('波形首次加载与缺文件仅替换原画布，范围不伪造且没有重试操作', () => withNativeHost(() => {
  const base = { taskId: 42, status: 'SUCCEEDED', isExample: false, modelCode: 'ppg.active.offline.hr_br' };
  for (const available of [true, false]) {
    const task = { ...base, result: { output_files: available ? { processed_ppg: 'opaque' } : {} } };
    const nodes = component('pages/measurement/ReportWaveform/ReportWaveform.js', 'ReportWaveform', { task, kind: 'ppg', title: '脉搏波', labels: messages('fingertipResults') });
    assert.ok(text(nodes).includes(available ? '正在获取波形' : '波形暂时无法获取'));
    assert.equal(nodes.filter((node) => node.text === '--').length, 2);
    assert.equal(nodes.filter((node) => node.type === 'ActionButton').length, 0);
  }
}));
