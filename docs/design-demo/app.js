/** 驱动离线交互演示；不请求后端，不调用设备权限，不保存密码。 */
import { pages } from './pages.js';
import { dates, lastMeasurements, records, routes } from './data.js';
import { allRecords, historyPanel, reading } from './history.js';
import { escapeHtml, icon, measurementRecency } from './ui.js';
import { initialProfile, profileFields, createProfilePatch, applyProfilePatch } from './profile.js';

const app = document.querySelector('#app');
const sheet = document.querySelector('#sheet');
const sheetOverlay = document.querySelector('#sheet-overlay');
const sheetContent = document.querySelector('#sheet-content');
const toastElement = document.querySelector('#toast');
let toastTimer;
let activeRoute = '';
let lastFocus;
let sheetAnimation;
let sheetClosing = false;
let registeredNames = new Set();

/** 标签页内的演示状态，刷新即清除；没有真实认证含义。 */
const state = {
  user: '',
  pendingUsername: '',
  profile: initialProfile(),
  notifications: false,
  passivePreference: false,
  feedback: '',
  history: { metricIndex: 0, from: dates[0], to: dates.at(-1) },
};

/** 状态预览链接直接切换本地演示身份，两个业务页面仍共用同一登录状态。 */
const stateViews = {
  'home-guest': { route: 'home', loggedIn: false },
  'home-logged-in': { route: 'home', loggedIn: true },
  'account-guest': { route: 'account', loggedIn: false },
  'account-logged-in': { route: 'account', loggedIn: true },
};

/** 将原稿中的整行入口转换为原生按钮，提供键盘和读屏语义。 */
function asButton(element, action, metric) {
  if (!element) return null;
  let button = element;
  if (element.tagName !== 'BUTTON') {
    button = document.createElement('button');
    const isSvg = element instanceof SVGElement;
    button.className = isSvg ? 'profile-access' : element.className;
    button.innerHTML = isSvg ? element.outerHTML : element.innerHTML;
    element.replaceWith(button);
  }
  button.type = 'button';
  button.dataset.action = action;
  if (metric !== undefined) button.dataset.metric = String(metric);
  return button;
}

/** 四种提示状态的名称、示例文案和装饰图形，不表示真实服务结果。 */
const toastStates = {
  success: { label: '成功', message: '示例：演示资料已保存', path: '<circle cx="12" cy="12" r="10" fill="currentColor" stroke="none"/><path d="m7.5 12 3 3 6-6" stroke="white" stroke-width="2"/>' },
  error: { label: '错误', message: '示例：操作未完成，请重试', path: '<circle cx="12" cy="12" r="10" fill="currentColor" stroke="none"/><path d="m8.5 8.5 7 7m0-7-7 7" stroke="white" stroke-width="2"/>' },
  loading: { label: '加载中', message: '示例：正在处理中，请稍候…', path: '<path d="M12 2a10 10 0 1 1-10 10h4a6 6 0 1 0 6-6Z" fill="currentColor" stroke="none"/>' },
  information: { label: '信息', message: '示例：测量读数仅供健康管理参考', path: '<circle cx="12" cy="12" r="10" fill="currentColor" stroke="none"/><circle cx="12" cy="7.5" r="1.2" fill="white" stroke="none"/><path d="M12 11v6" stroke="white" stroke-width="2"/>' },
};

document.querySelector('.demo-toast-states').innerHTML = Object.entries(toastStates)
  .map(([status, item]) => `<button type="button" data-action="preview-toast-state" data-status="${status}" aria-label="${status} · ${item.label}" title="${status}">${item.label}</button>`)
  .join('');

/** 显示主题提示；加载状态持续到结果替换或手动关闭，不伪造业务成功。 */
function toast(message, status = 'information') {
  clearTimeout(toastTimer);
  const presentation = toastStates[status];
  toastElement.dataset.status = status;
  toastElement.querySelector('.toast-icon').innerHTML = `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${presentation.path}</svg>`;
  const text = toastElement.querySelector('.toast-message');
  text.setAttribute('role', status === 'error' ? 'alert' : 'status');
  text.setAttribute('aria-live', status === 'error' ? 'assertive' : 'polite');
  text.textContent = `${presentation.label}：${message}`;
  toastElement.hidden = false;
  if (status !== 'loading') toastTimer = setTimeout(closeToast, 3500);
}

/** 关闭提示时清除旧计时，避免影响下一条提示。 */
function closeToast() {
  clearTimeout(toastTimer);
  toastElement.hidden = true;
}

/** 在手机区域内打开弹层，禁用背景页面并保留焦点返回位置。 */
function openSheet(title, html) {
  if (!sheet.open) lastFocus = document.activeElement;
  const openingOpacity = sheet.open ? getComputedStyle(sheetOverlay).opacity : '0';
  sheetAnimation?.cancel();
  sheetClosing = false;
  document.querySelector('#sheet-title').textContent = title;
  sheetContent.innerHTML = html;
  app.inert = true;
  sheetOverlay.hidden = false;
  if (!sheet.open) sheet.show();
  sheetAnimation = sheetOverlay.animate(
    [{ opacity: openingOpacity }, { opacity: 1 }],
    { duration: matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 200, easing: 'ease-out' },
  );
  sheet.querySelector('.sheet-close').focus();
}

/** 淡出完成后才隐藏弹层并恢复焦点；重新打开时取消旧的关闭动画。 */
function closeSheet() {
  if (!sheet.open || sheetClosing) return;
  const opacity = getComputedStyle(sheetOverlay).opacity;
  sheetAnimation?.cancel();
  sheetClosing = true;
  sheetAnimation = sheetOverlay.animate(
    [{ opacity }, { opacity: 0 }],
    { duration: matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 150, easing: 'ease-in', fill: 'forwards' },
  );
  sheetAnimation.onfinish = () => {
    sheet.close();
    sheetOverlay.hidden = true;
    sheetAnimation.cancel();
    sheetAnimation = undefined;
    sheetClosing = false;
    app.inert = false;
    if (lastFocus?.isConnected) lastFocus.focus();
  };
}

/** 基于 hash 的页面跳转支持浏览器前进和后退。 */
function navigate(route) {
  closeSheet();
  if (location.hash === `#${route}`) render();
  else location.hash = route;
}

/** 基础页面与每页导航均由同一路由源生成。 */
function render() {
  closeSheet();
  const requested = location.hash.slice(1);
  const preview = Object.hasOwn(stateViews, requested) ? stateViews[requested] : null;
  if (preview) state.user = preview.loggedIn ? state.user || state.profile.name || '小安' : '';
  activeRoute = preview?.route || (Object.hasOwn(pages, requested) ? requested : 'home');
  if (!preview && requested !== activeRoute) history.replaceState(null, '', `#${activeRoute}`);
  const hasStateView = activeRoute === 'home' || activeRoute === 'account';
  const viewRoute = hasStateView ? `${activeRoute}-${state.user ? 'logged-in' : 'guest'}` : activeRoute;
  document.title = `${routes[activeRoute]}${hasStateView ? ` · ${state.user ? '已登录' : '未登录'}` : ''} · 心沐设计演示`;
  app.innerHTML = pages[activeRoute];
  document.querySelectorAll('.demo-routes a').forEach((link) => {
    if (link.hash === `#${viewRoute}`) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
  app.querySelectorAll('.phone > nav .navitem').forEach((item, index) => {
    const button = asButton(item, 'navigate');
    button.dataset.route = ['home', 'functions', 'history', 'account'][index];
    if (button.classList.contains('selected')) button.setAttribute('aria-current', 'page');
  });
  if (activeRoute === 'account') {
    const control = asButton(app.querySelector('.circle-btn'), 'settings');
    control.setAttribute('aria-label', '账户设置');
  }
  if (activeRoute === 'home') bindHome();
  if (activeRoute === 'functions') bindFunctions();
  if (activeRoute === 'history') bindHistory();
  if (activeRoute === 'account') bindAccount();
  if (activeRoute === 'login' || activeRoute === 'register') bindAuth();
  if (activeRoute === 'onboarding') bindOnboarding();
}

/** 主页按共享登录状态展示读数或空态；未登录入口统一指向登录页。 */
function bindHome() {
  const loggedIn = Boolean(state.user);
  app.querySelector('.home').classList.toggle('home-guest', !loggedIn);
  asButton(app.querySelector('.bp-detail'), loggedIn ? 'metric-detail' : 'login-route', 0);
  const primary = asButton(app.querySelector('.revised-bp .cta'), loggedIn ? 'measurement' : 'login-route', 0);
  if (!loggedIn) {
    app.querySelectorAll('.pressure-number').forEach((number) => {
      number.firstChild.textContent = '-- ';
    });
    app.querySelector('.bp-last time').textContent = '暂无记录';
    primary.firstChild.textContent = '登录体验完整功能 ';
    app.querySelectorAll('.lively-number strong, .risk-body .empty-state').forEach((number) => {
      number.textContent = '--';
    });
    app.querySelectorAll('.revised-time').forEach((time) => { time.textContent = '暂无记录'; });
    app.querySelector('.source-tag').hidden = true;
    app.querySelector('.oxygen-dial').setAttribute('aria-label', '血氧饱和度，暂无记录');
    app.querySelector('.oxygen-dial text').textContent = '--';
    app.querySelectorAll('.dial-segment').forEach((segment) => {
      segment.dataset.filled = 'false';
      segment.setAttribute('stroke', 'var(--border)');
      segment.setAttribute('stroke-opacity', '1');
    });
  }
  app.querySelectorAll('.revised-metric').forEach((card, index) => {
    const button = asButton(card, loggedIn ? 'metric-detail' : 'login-route', index + 1);
    button.setAttribute('aria-label', `${records[index + 1].title}${loggedIn ? '详情' : '，暂无记录'}`);
  });
}

/** 功能页的每个入口均可打开对应说明。 */
function bindFunctions() {
  const now = Date.now();
  app.querySelectorAll('.function-card').forEach((card) => {
    asButton(card, card.dataset.measurement ? 'camera-measurement' : 'measurement');
    const key = card.dataset.measurement || records[Number(card.dataset.metric)].key;
    const recency = key === 'risk' && !lastMeasurements[key]
      ? '尚未评估'
      : measurementRecency(lastMeasurements[key], now);
    card.querySelector('.function-recency').textContent = recency;
    card.setAttribute('aria-label', `${card.getAttribute('aria-label')}，${recency}`);
  });
}

/** 历史筛选只更新结果区，不重置日期输入焦点。 */
function updateHistory() {
  const { invalid, html } = historyPanel(state.history);
  const panel = app.querySelector('#history-panel');
  panel.innerHTML = html;
  panel.setAttribute('aria-labelledby', `hist-tab-${state.history.metricIndex}`);
  app.querySelector('#date-error').hidden = !invalid;
  app.querySelector('#date-error').textContent = '请选择有效日期，开始日期不能晚于结束日期';
  app.querySelectorAll('[role=tab]').forEach((tab, index) => {
    tab.setAttribute('aria-selected', String(index === state.history.metricIndex));
    tab.tabIndex = index === state.history.metricIndex ? 0 : -1;
  });
}

/** 重新进入历史页时保留当前标签页中的日期和指标选择。 */
function bindHistory() {
  app.querySelector('#from-date').value = state.history.from;
  app.querySelector('#to-date').value = state.history.to;
  asButton(app.querySelector('.datehead button'), 'recent-week');
  app.querySelectorAll('[role=tab]').forEach((tab, index) => {
    tab.dataset.action = 'history-tab';
    tab.dataset.metric = String(index);
  });
  updateHistory();
}

/** 账户、资料和菜单入口全部接入本地弹层或演示页面。 */
function bindAccount() {
  app.querySelector('.profile h2').textContent = state.user ? state.profile.name || state.user : '未登录';
  app.querySelector('.profile p').textContent = state.user ? '今天，也照顾好自己' : '点击登录体验完整功能';
  asButton(app.querySelector('.profile'), state.user ? 'personal-profile' : 'login-route');
  app.querySelector('.account-logout').hidden = !state.user;
  app.querySelector('.account-login').hidden = Boolean(state.user);
  const actions = ['history-route', 'personal-profile', 'notifications', 'privacy-settings', 'language', 'feedback'];
  app.querySelectorAll('.row').forEach((row, index) => asButton(row, actions[index]));
}

/** 登录、注册只演示本地表单与页面状态，不表示账号验证通过。 */
function bindAuth() {
  const register = activeRoute === 'register';
  const mode = activeRoute;
  app.querySelector('.auth-back').dataset.action = register ? 'login-route' : 'account-route';
  app.querySelector('.auth-top-link').dataset.action = register ? 'login-route' : 'register-route';
  app.querySelector('.auth-alternate button').dataset.action = register ? 'login-route' : 'register-route';
  app.querySelector('form').dataset.form = mode;
  if (!register && state.pendingUsername) app.querySelector('#login-username').value = state.pendingUsername;
  app.querySelectorAll('[data-password]').forEach((button) => { button.dataset.action = 'toggle-password'; });
}

/** 复用功能页本地插画，避免为首次引导维护另一套图形。 */
function bindOnboarding() {
  const template = document.createElement('template');
  template.innerHTML = pages.functions;
  app.querySelectorAll('[data-feature-art]').forEach((slot) => {
    const illustration = template.content.querySelector(`[data-illustration="${slot.dataset.featureArt}"]`);
    slot.append(illustration.cloneNode(true));
  });
}

/** 固定样例详情，来源与记录时间有明确说明。 */
function metricDetail(index) {
  const metric = records[index];
  const value = metric.values.length ? metric.values.map((series) => series.at(-1)).join(' / ') : '暂无数据';
  openSheet(metric.title, `<p class="scope-note">固定样例数据，非真实测量结果</p><div class="metric-value">${value} <small>${metric.unit}</small></div><p>${metric.values.length ? '最近记录：2026年10月31日 08:30' : '最近记录：—'}</p>${index === 1 ? '<p>记录来源：主动式</p>' : ''}<p>${metric.description}</p><button type="button" class="cta" data-action="history-route" data-metric="${index}">历史与趋势 ${icon('arrow')}</button><button type="button" class="sheet-secondary" data-action="measurement" data-metric="${index}">功能说明与入口</button>`);
}

/** 测量入口只介绍交互，不打开相机，也不自动产生结果。 */
function measurement(index) {
  if (index === 1 || index === 2) return cameraMeasurement('fingertip');
  const metric = records[index];
  const instructions = index === 0
    ? ['测量前保持安静，按照正式功能的采集指引准备。', '正式功能需要相机等权限；这个网站不会请求权限。', '完成采集和处理后才会产生结果，Demo 不模拟医学推理。']
    : ['本页展示对应功能的入口与说明。', '网站不连接传感器、相机或风险评估服务。', '可前往历史页体验固定样例的筛选与详情。'];
  openSheet(metric.title, `<p>${metric.description}</p><ol>${instructions.map((text) => `<li>${text}</li>`).join('')}</ol><p class="scope-note">演示模式，不会执行真实测量或上传。</p><button type="button" class="cta" data-action="history-route" data-metric="${index}">查看示例记录 ${icon('arrow')}</button><button type="button" class="sheet-secondary" data-action="close-sheet">返回</button>`);
}

/** 区分联合指尖采集和面部采集，不将历史样例冒充对应方式的结果。 */
function cameraMeasurement(kind) {
  const isFace = kind === 'face';
  const title = isFace ? '面部心率' : '指尖心率与呼吸率';
  const instructions = isFace
    ? ['使用前置摄像头，让面部处于画面内，保持光线均匀、姿态稳定。', '通过面部视频信号估计心率，不需要用手指覆盖摄像头。']
    : ['用手指覆盖后置摄像头，按正式功能指引放置并保持稳定。', '同一次指尖采集用于估计心率与呼吸率，无需分别开始两次测量。'];
  openSheet(title, `<ol>${instructions.map((text) => `<li>${text}</li>`).join('')}</ol><p class="scope-note">此处仅演示测量方式说明，不请求相机权限，不采集或上传视频，也不产生测量结果。估计值仅供健康管理参考，非医学诊断依据。</p><button type="button" class="sheet-secondary" data-action="close-sheet">返回</button>`);
}

/** 用户可修改的资料只保留在当前标签页，不冒充服务端更新。 */
function profileForm() {
  openSheet('个人资料', `<p class="scope-note">全部选填，仅当前演示标签页有效，不上传。</p><form data-form="profile" class="health-form health-form-sheet">${profileFields(state.profile)}<button type="submit" class="cta">保存演示资料</button></form>`);
}

/** 账户入口显式区分示例身份和真实认证。 */
function accountSession() {
  if (!state.user) return navigate('login');
  openSheet('演示账户', `<p>当前演示用户名：${escapeHtml(state.user)}</p><p>本网站不验证真实账号，不签发令牌，也不保存密码。</p><button type="button" class="cta" data-action="login-route">切换演示账户</button>`);
}

/** 偏好开关有本地状态，但不会触发浏览器权限或原生后台服务。 */
function settings(kind) {
  if (kind === 'notifications') {
    openSheet('通知设置', `<p>暂无真实通知。以下开关仅保存当前标签页中的演示偏好。</p><label class="setting-label">演示测量提醒<input type="checkbox" data-setting="notifications" ${state.notifications ? 'checked' : ''}></label><p class="scope-note">不会申请通知权限或发送系统通知。</p>`);
  } else if (kind === 'privacy-settings') {
    openSheet('隐私与授权', `<p>主动测量由用户发起；被动采集需要单独说明与授权。本网站不会申请相机、麦克风或健康权限。</p><label class="setting-label">被动采集偏好（演示）<input type="checkbox" data-setting="passivePreference" ${state.passivePreference ? 'checked' : ''}></label><p class="scope-note">开关不会启动摄像头或后台任务，刷新后恢复默认。</p>`);
  } else {
    openSheet('演示设置', '<p>本次演示仅提供浅色、简体中文界面。</p><button type="button" class="sheet-secondary" data-action="account-session">账户与登录</button><button type="button" class="sheet-secondary" data-action="welcome-route">查看启动页</button><button type="button" class="sheet-secondary" data-action="onboarding-route">重看功能引导</button><button type="button" class="sheet-secondary" data-action="reset-demo">重置演示</button>');
  }
}

/** 所有点击由实际按钮分发，替代原稿中的不可点击装饰入口。 */
function onClick(event) {
  const control = event.target.closest('[data-action]');
  if (!control) return;
  const action = control.dataset.action;
  const metric = Number(control.dataset.metric || 0);
  if (action === 'navigate') return navigate(control.dataset.route);
  if (action === 'close-sheet') return closeSheet();
  if (action === 'preview-sheet') return openSheet('弹窗预览', '<p>这是手机区域内的示例弹窗，仅用于预览样式，不会修改演示数据。</p><p>可点击关闭按钮、遮罩或按 Esc 关闭。</p><button type="button" class="cta" data-action="close-sheet">知道了</button>');
  if (action === 'preview-toast-state') {
    const status = control.dataset.status;
    closeSheet();
    return toast(toastStates[status].message, status);
  }
  if (action === 'close-toast') return closeToast();
  if (action === 'metric-detail') return metricDetail(metric);
  if (action === 'measurement') return measurement(metric);
  if (action === 'camera-measurement') return cameraMeasurement(control.dataset.measurement);
  if (action === 'history-tab') { state.history.metricIndex = metric; updateHistory(); return; }
  if (action === 'recent-week') {
    state.history.from = dates[0]; state.history.to = dates.at(-1);
    app.querySelector('#from-date').value = state.history.from;
    app.querySelector('#to-date').value = state.history.to;
    updateHistory(); return;
  }
  if (action === 'history-route') {
    if (control.dataset.metric !== undefined) state.history.metricIndex = metric;
    return navigate('history');
  }
  if (action === 'record') {
    const index = Number(control.dataset.index);
    const record = records[state.history.metricIndex];
    if (!Number.isInteger(index) || index < 0 || index >= dates.length || !record.values.length) return;
    return openSheet('记录详情', `<p class="scope-note">固定样例，非真实测量</p><p>${record.title} · ${dates[index]} 08:30</p><div class="metric-value">${reading(state.history.metricIndex, index)} <small>${record.unit}</small></div>${state.history.metricIndex === 1 ? '<p>来源：主动式</p>' : ''}<p>${record.description}</p>`);
  }
  if (action === 'all-records') return openSheet(`${records[state.history.metricIndex].title}记录`, allRecords(state.history));
  if (action === 'toggle-password') {
    const input = document.getElementById(control.dataset.password);
    const visible = input.type === 'password';
    input.type = visible ? 'text' : 'password';
    control.setAttribute('aria-pressed', String(visible));
    control.setAttribute('aria-label', `${visible ? '隐藏' : '显示'}${input.id.includes('confirm') ? '确认' : ''}密码`);
    return;
  }
  if (action === 'login-route') return navigate('login');
  if (action === 'register-route') return navigate('register');
  if (action === 'account-route') return navigate('account');
  if (action === 'home-route') return navigate('home');
  if (action === 'welcome-route') return navigate('welcome');
  if (action === 'onboarding-next') return navigate('privacy');
  if (action === 'onboarding-route') return navigate('onboarding');
  if (action === 'personal-profile') return profileForm();
  if (action === 'account-session') return accountSession();
  if (['settings', 'notifications', 'privacy-settings'].includes(action)) return settings(action);
  if (action === 'language') return openSheet('语言', '<p>当前语言：简体中文。</p><p>本次设计 Demo 不包含英文翻译，正式 App 的语言能力不在此演示中模拟。</p>');
  if (action === 'feedback') return openSheet('帮助与反馈', `<p>Demo 数据不是真实健康结果。可以点击指标卡查看说明，或在历史中筛选样例。</p><form data-form="feedback"><label class="sheet-field">演示反馈<textarea name="feedback" maxlength="1000" placeholder="记录你的设计意见（不上传）" required>${escapeHtml(state.feedback)}</textarea></label><button class="cta" type="submit">暂存当前标签页</button></form>`);
  if (action === 'logout-demo') { state.user = ''; navigate('account'); toast('已退出演示账户', 'success'); return; }
  if (action === 'reset-demo') return openSheet('重置演示', '<p>清除当前标签页中的演示账户、资料、偏好和筛选条件。不会影响真实 App 或本地采集文件。</p><button type="button" class="cta" data-action="confirm-reset">确认重置</button>');
  if (action === 'confirm-reset') {
    state.user = ''; state.pendingUsername = ''; state.profile = initialProfile();
    state.notifications = false; state.passivePreference = false; state.feedback = '';
    state.history = { metricIndex: 0, from: dates[0], to: dates.at(-1) };
    registeredNames = new Set(); navigate('home'); toast('演示状态已重置', 'success');
  }
}

/** 本地认证演示只验证输入完整性；不替代真实服务端的密码检查。 */
function submitAuth(form, mode) {
  const username = form.querySelector(`#${mode}-username`);
  const password = form.querySelector(`#${mode}-password`);
  const error = form.querySelector('.auth-error');
  const name = username.value.trim();
  let message = '';
  let invalidInput;
  if (!name) { message = '请输入用户名'; invalidInput = username; }
  else if (!password.value) { message = '请输入密码'; invalidInput = password; }
  else if (mode === 'register' && password.value !== form.querySelector('#register-confirm').value) {
    message = '两次输入的密码不一致'; invalidInput = form.querySelector('#register-confirm');
  } else if (mode === 'register' && registeredNames.has(name)) { message = '当前演示中已注册此用户名'; invalidInput = username; }
  form.querySelectorAll('[aria-invalid]').forEach((input) => input.removeAttribute('aria-invalid'));
  if (message) {
    error.hidden = false; error.textContent = message;
    invalidInput.setAttribute('aria-invalid', 'true');
    invalidInput.setAttribute('aria-describedby', error.id);
    invalidInput.focus(); return;
  }
  if (mode === 'register') {
    registeredNames.add(name); state.pendingUsername = name;
    form.reset(); navigate('login'); toast('演示注册完成，请登录；未创建真实账号', 'success');
  } else {
    state.user = name; state.pendingUsername = name;
    form.reset(); navigate('account'); toast('已进入演示账户，非真实登录', 'success');
  }
}

/** 表单提交仅修改演示状态，不发送网络请求。 */
function onSubmit(event) {
  const form = event.target;
  if (!form.matches('form[data-form]')) return;
  event.preventDefault();
  if (['login', 'register'].includes(form.dataset.form)) return submitAuth(form, form.dataset.form);
  if (form.dataset.form === 'profile') {
    if (!form.reportValidity()) return;
    state.profile = applyProfilePatch(state.profile, createProfilePatch(new FormData(form), state.profile));
    closeSheet();
    if (activeRoute === 'account') render();
    toast('已保存演示资料，仅当前标签页有效', 'success');
  }
  if (form.dataset.form === 'feedback') {
    state.feedback = String(new FormData(form).get('feedback') || '').trim();
    closeSheet(); toast('意见已暂存当前标签页，未上传', 'success');
  }
}

/** 桌面树形导航保留根节点、分类分支和页面叶节点，标题统一取自 routes。 */
const navigationGroups = [
  { label: '主界面', children: ['home', 'functions', 'history', 'account'] },
  { label: '账户', children: ['login', 'register'] },
  { label: '启动展示', children: ['desktop', 'welcome'] },
  { label: '首次体验', children: ['onboarding', 'privacy'] },
];
document.querySelector('.demo-routes').innerHTML = `<div class="demo-nav-root">页面</div><div class="demo-nav-branches">${navigationGroups.map((group, index) =>
  `<section class="demo-nav-group" aria-labelledby="demo-group-${index}"><h2 id="demo-group-${index}">${group.label}</h2><ul>${group.children.map((route) => `<li><a href="#${route}">${routes[route]}</a>${route === 'home' || route === 'account' ? `<ul class="demo-state-views"><li><a href="#${route}-guest" aria-label="${routes[route]}，未登录">未登录</a></li><li><a href="#${route}-logged-in" aria-label="${routes[route]}，已登录">已登录</a></li></ul>` : ''}</li>`).join('')}</ul></section>`,
).join('')}</div>`;
document.addEventListener('click', onClick);
document.addEventListener('submit', onSubmit);
document.addEventListener('change', (event) => {
  const target = event.target;
  if (target.id === 'from-date' || target.id === 'to-date') {
    state.history[target.id === 'from-date' ? 'from' : 'to'] = target.value;
    updateHistory();
  }
  if (target.matches('[data-setting]')) state[target.dataset.setting] = target.checked;
});
document.addEventListener('keydown', (event) => {
  if (!event.target.matches('[role=tab]') || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
  event.preventDefault();
  const count = records.length;
  state.history.metricIndex = event.key === 'Home' ? 0 : event.key === 'End' ? count - 1 : (state.history.metricIndex + (event.key === 'ArrowRight' ? 1 : -1) + count) % count;
  updateHistory(); app.querySelector(`[role=tab][aria-selected=true]`).focus();
});
document.querySelector('.sheet-close').addEventListener('click', closeSheet);
sheetOverlay.addEventListener('click', (event) => {
  if (event.target === sheetOverlay) closeSheet();
});
sheet.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    event.preventDefault();
    closeSheet();
  }
  if (event.key !== 'Tab') return;
  const controls = [...sheet.querySelectorAll('button, input, select, textarea, a[href], [tabindex]')]
    .filter((element) => !element.disabled && element.tabIndex >= 0 && element.getClientRects().length);
  const first = controls[0];
  const last = controls.at(-1);
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
});
window.addEventListener('hashchange', render);
render();
