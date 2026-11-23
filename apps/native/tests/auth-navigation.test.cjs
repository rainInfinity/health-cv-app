// 消费真实认证表单与导航路由器，防止登录重置原Tab、筛选和准备上下文。
const assert = require('node:assert/strict');
const test = require('node:test');
const Module = require('node:module');
const path = require('node:path');
const root = path.resolve(__dirname, '../node_modules/.cache/native-test');
const nativePackage = require.resolve('@react-navigation/native/package.json');
const corePackage = require.resolve('@react-navigation/core/package.json', { paths: [path.dirname(nativePackage)] });
const { StackRouter, TabRouter, CommonActions, StackActions } = require(require.resolve('@react-navigation/routers', { paths: [path.dirname(corePackage)] }));
const messages = Object.fromEntries(Object.entries(require('../src/app/i18n/locales/zh-CN.json')['pages/auth']).map(([key, value]) => [key,
  value.includes('{') ? (params) => value.replace(/\{(\w+)\}/g, (_, name) => params[name]) : value,
]));
const styles = new Proxy({ __esModule: true }, { get: (target, key) => key in target ? target[key] : String(key) });

function harness(tab = 'Features', guide = null, authOverrides = {}) {
  const tabState = TabRouter({ initialRouteName: tab }).getInitialState({
    routeNames: ['Home', 'Features', 'History', 'User'],
    routeParamList: { History: { metric: 'heartRate', day: '2026-11-23' } }, routeGetIdList: {},
  });
  const router = StackRouter({});
  const options = { routeNames: ['ProductTabs', 'MeasurementGuide', 'Login', 'Register'], routeParamList: {}, routeGetIdList: {} };
  let state = router.getRehydratedState({ stale: true, index: guide ? 1 : 0, routes: [
    { name: 'ProductTabs', state: tabState }, ...(guide ? [{ name: 'MeasurementGuide', params: guide }] : []),
  ] }, options);
  const source = state;
  const pages = new Map(), listeners = new Map(), toasts = [];
  let page, cursor, routeKey, nodes, theme, dirty;
  const current = () => state.routes[state.index];
  function dispatch(action) {
    const previous = current().key;
    state = router.getStateForAction(state, action, options) ?? state;
    if (current().key !== previous) for (const listener of listeners.get(previous) ?? []) listener();
  }
  const react = {
    useState(initial) { const bag = page, i = cursor++; if (!(i in bag)) bag[i] = typeof initial === 'function' ? initial() : initial; return [bag[i], (next) => { bag[i] = typeof next === 'function' ? next(bag[i]) : next; dirty = true; }]; },
    useRef(initial) { const i = cursor++; return page[i] ?? (page[i] = { current: initial }); },
    useEffect(create, deps) {
      const i = cursor++, previous = page[i];
      if (previous && deps.every((value, index) => Object.is(value, previous.deps[index]))) return;
      previous?.cleanup?.(); page[i] = { deps, create };
    },
  };
  const services = { auth: { async signIn() {}, async register({ username }) { return { username }; }, ...authOverrides } };
  const load = Module._load;
  Module._load = function(request, parent, isMain) {
    if (request === 'react') return react;
    if (request === 'react/jsx-runtime') return { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) };
    if (request === 'react-native') return { View: 'View', Platform: { select: (values) => values.android } };
    if (request === '@nanostores/react') return { useStore: () => messages };
    if (request === 'styled-components/native') return { useTheme: () => theme };
    if (request === '@react-navigation/native') return { useNavigation() {
      const key = routeKey;
      return {
        isFocused: () => current().key === key,
        addListener(_, listener) { const group = listeners.get(key) ?? new Set(); listeners.set(key, group); group.add(listener); return () => group.delete(listener); },
        goBack: () => dispatch(CommonActions.goBack()),
        reset: (next) => dispatch(CommonActions.reset(next)),
        navigate: (name, params) => dispatch(CommonActions.navigate(name, params)),
        popTo: (name, params) => dispatch(StackActions.popTo(name, params)),
      };
    } };
    if (request === '@/app/providers/AppProviders') return { useAppServices: () => services };
    if (request === '@/pages/user/authMessages') return { authMessages: {} };
    if (request === '@/shared/components/FeedbackHost') return { useFeedback: () => ({ showToast(value) { toasts.push(value); return toasts.length; }, replaceToast(_, value) { toasts.push(value); } }) };
    if (request === '@/shared/graphics') return styles;
    if (request === './styles') return styles;
    if (request.startsWith('@/shared/components/')) { const name = request.split('/').at(-1); return { [name]: name }; }
    if (request.startsWith('@/')) return load.call(this, path.join(root, request.slice(2)), parent, isMain);
    return load.call(this, request, parent, isMain);
  };
  const location = require.resolve(path.join(root, 'pages/user/AuthScreen/AuthScreen.js'));
  delete require.cache[location];
  let AuthScreen;
  try {
    theme = require(path.join(root, 'shared/theme/theme.js')).lightTheme;
    AuthScreen = require(location).AuthScreen;
  } finally { Module._load = load; }
  function collect(node) {
    if (Array.isArray(node)) { node.forEach(collect); return; }
    if (!node || typeof node !== 'object') return;
    nodes.push(node); collect(node.props?.children);
  }
  function render() {
    do {
      dirty = false; routeKey = current().key;
      page = pages.get(routeKey) ?? []; pages.set(routeKey, page); cursor = 0; nodes = [];
      collect(AuthScreen({ mode: current().name === 'Register' ? 'register' : 'login', initialUsername: current().params?.username ?? 'member' }));
      for (const slot of page) if (slot?.create) { slot.cleanup = slot.create(); delete slot.create; }
    } while (dirty);
  }
  dispatch(CommonActions.navigate('Login')); render();
  return {
    source, current, get state() { return state; }, toasts,
    fill(label, value) { nodes.find((node) => node.type === 'AppInput' && node.props.label === label).props.onChangeText(value); render(); },
    press(type) { nodes.find((node) => node.type === type).props.onPress(); },
    input(label) { return nodes.find((node) => node.type === 'AppInput' && node.props.label === label).props.value; },
    render, back: () => dispatch(CommonActions.goBack()),
    dispose() { for (const bag of pages.values()) for (const slot of bag) slot?.cleanup?.(); },
  };
}
const settle = () => new Promise(setImmediate);

// 登录提交仅消费表单当前值；导航结果由真实StackRouter计算。
async function submit(page) {
  page.fill(messages.password, 'dev-test');
  if (page.current().name === 'Register') page.fill(messages.confirmPassword, 'dev-test');
  page.press('ActionButton'); await settle();
}

test('登录成功保留原Tab、历史筛选和两种准备页，不重置导航到我的或检测页', async () => {
  for (const [tab, guide] of [['Home'], ['Features'], ['History'], ['User'], ['Features', { method: 'fingertip' }], ['Home', { method: 'chest' }]]) {
    const page = harness(tab, guide);
    try {
      await submit(page);
      assert.deepEqual(page.state.routes, page.source.routes);
      assert.equal(page.state.index, page.source.index);
      assert.equal(page.toasts.at(-1).tone, 'success');
    } finally { page.dispose(); }
  }
});

test('注册返回登录并回填用户名后，登录仍返回最初来源', async () => {
  const page = harness('Features');
  try {
    page.press('AuthSwitch'); page.render();
    page.fill(messages.username, 'new-member'); await submit(page);
    assert.equal(page.current().name, 'Login');
    assert.equal(page.current().params.username, 'new-member');
    page.render(); assert.equal(page.input(messages.username), 'new-member');
    await submit(page);
    assert.deepEqual(page.state.routes, page.source.routes);
    assert.equal(page.state.index, page.source.index);
  } finally { page.dispose(); }
});

test('登录失败保留来源，离开登录后的迟到成功不再执行返回', async () => {
  const failed = harness('History', null, { async signIn() { throw Error('offline'); } });
  try {
    await submit(failed);
    assert.equal(failed.current().name, 'Login');
    assert.deepEqual(failed.state.routes.slice(0, -1), failed.source.routes);
    assert.equal(failed.toasts.at(-1).tone, 'error');
  } finally { failed.dispose(); }
  const wait = Promise.withResolvers();
  const late = harness('Home', { method: 'chest' }, { signIn: () => wait.promise });
  try {
    late.fill(messages.password, 'dev-test'); late.press('ActionButton'); late.back();
    wait.resolve(); await settle();
    assert.deepEqual(late.state.routes, late.source.routes);
    assert.equal(late.state.index, late.source.index);
  } finally { late.dispose(); }
});
