/** 驱动离线交互演示；不请求后端，不调用设备权限，不保存密码。 */
import { pages } from './pages.js';
import { dates, records, routes } from './data.js';
import { allRecords, mountHistoryPanel, reading, initialHistory, periodRange, rangeLabel } from './history.js';
import { mountHistoryDatePicker } from './history-date-picker.js';
import { mountSelectionSheet } from './selection-sheet.js';
import { escapeHtml, icon, loadingIcon } from './ui.js';
import { initialProfile, profileFields, createProfilePatch, applyProfilePatch } from './profile.js';
import { mountFaceMeasurement } from './face-measurement.js';
import { mountContactMeasurement } from './contact-measurement.js';
import { mountFingertipResults, fingertipResultsForState } from './fingertip-results.js';
import { mountBloodPressureResults, bloodPressureResultsForState } from './blood-pressure-results.js';
import { applyDataState } from './data-states.js';
import { statePreviews, statePreviewRoute, statePreviewChildren } from './state-previews.js';

const app = document.querySelector('#app');
const sheet = document.querySelector('#sheet');
const sheetOverlay = document.querySelector('#sheet-overlay');
const sheetContent = document.querySelector('#sheet-content');
const toastElement = document.querySelector('#toast');
const toastOverlay = document.querySelector('#toast-overlay');
const homeRefreshControl = document.querySelector('[data-home-refresh]');
/** Toast 关闭后恢复被蒙版隔离前的焦点，不抢占预览侧栏中的新焦点。 */
let toastReturnFocus;
let toastTimer;
let activeRoute = '';
let lastFocus;
let sheetAnimation;
let sheetSlideAnimation;
let sheetClosing = false;
let sheetOnClose;
let registeredNames = new Set();
let pendingAuthAction;
/** 知情说明与本地启停共用锁；稳定偏好只在等待完成后提交。 */
let passiveConfirmation;
let pendingPassiveAction;
let measurementReturnRoute = 'functions';
/** 当前说明页的测量目标；直接预览说明页时为空。 */
let measurementTarget = null;
/** 测量页切换时释放绘图和本地事件。 */
let disposeMeasurement;
/** 历史页持有独立图表实例，筛选复用、离页释放。 */
let historyPanel;
/** 状态预览独立于样例数据，离页撤销局部展示及模拟重试。 */
let activePreview;
let disposeDataState;
let previewRetryTimer;
let pendingPreviewRetry;
/** 历史菜单及相邻指标入口共用同一组可见名称。 */
const historyMetricOptions = ['血压', '心率', '呼吸率', '血氧饱和度', '糖尿病风险'].map((label, index) => ({ value: String(index), label }));

/** 标签页内的演示状态，刷新即清除；没有真实认证含义。 */
const state = {
  user: '',
  pendingUsername: '',
  profile: initialProfile(),
  notifications: false,
  /** 无扰心率检测与隐私设置共用的被动测量开关；仅当前标签页有效。 */
  passivePreference: false,
  feedback: '',
  /** 按测量方式记录说明页跳过偏好；仅当前标签页有效。 */
  skippedMeasurementGuides: new Set(),
  /** 血压贴胸指导独立跳过偏好；仅当前标签页有效，确认后保存。 */
  skippedChestPlacementGuide: false,
  /** 历史指标、周期与日期边界；切页保留，刷新清除。 */
  history: initialHistory(),
  /** 仅在检测页与本轮详细结果间保留完成状态，离开该流程即清除。 */
  fingertipCompleted: false,
  /** 血压只在自身检测与报告之间保留完成状态，与指尖轮次隔离。 */
  bloodPressureCompleted: false,
};

/** 状态预览链接直接切换本地演示身份，两个业务页面仍共用同一登录状态。 */
const stateViews = {
  'home-guest': { route: 'home', loggedIn: false },
  'home-logged-in': { route: 'home', loggedIn: true },
  'account-guest': { route: 'account', loggedIn: false },
  'account-logged-in': { route: 'account', loggedIn: true },
  ...statePreviews,
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
  loading: { label: '加载中', message: '示例：正在处理中，请稍候…' },
  information: { label: '信息', message: '示例：测量读数仅供健康管理参考', path: '<circle cx="12" cy="12" r="10" fill="currentColor" stroke="none"/><circle cx="12" cy="7.5" r="1.2" fill="white" stroke="none"/><path d="M12 11v6" stroke="white" stroke-width="2"/>' },
};

document.querySelector('.demo-toast-states').innerHTML = Object.entries(toastStates)
  .map(([status, item]) => `<button type="button" data-action="preview-toast-state" data-status="${status}" aria-label="${status} · ${item.label}" title="${status}">${item.label}</button>`)
  .join('');

/** 显示带蒙版的主题提示；加载不可点外部关闭，其他状态均可关闭。 */
function toast(message, status = 'information', { showLabel = true } = {}) {
  clearTimeout(toastTimer);
  const presentation = toastStates[status];
  toastElement.dataset.status = status;
  toastElement.querySelector('.toast-icon').innerHTML = status === 'loading' ? loadingIcon() : `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${presentation.path}</svg>`;
  const text = toastElement.querySelector('.toast-message');
  text.setAttribute('role', status === 'error' ? 'alert' : 'status');
  text.setAttribute('aria-live', status === 'error' ? 'assertive' : 'polite');
  text.textContent = showLabel ? `${presentation.label}：${message}` : message;
  if (toastOverlay.hidden) toastReturnFocus = document.activeElement;
  toastOverlay.dataset.dismissOnBackdrop = String(status !== 'loading');
  app.inert = true;
  sheet.inert = true;
  toastOverlay.hidden = false;
  if (status !== 'loading') toastTimer = setTimeout(closeToast, status === 'success' ? 1500 : 3500);
}

/** 关闭提示、清除旧计时，并恢复页面或已有弹层的交互。 */
function closeToast() {
  clearTimeout(toastTimer);
  toastOverlay.hidden = true;
  sheet.inert = false;
  app.inert = sheet.open;
  if (toastReturnFocus?.isConnected && document.activeElement === document.body) toastReturnFocus.focus();
  toastReturnFocus = undefined;
}

/** 恢复操作按钮；切页时取消尚未完成的演示，避免旧计时修改新页面。 */
function cancelAuthAction() {
  if (!pendingAuthAction) return;
  const { timer, button, content } = pendingAuthAction;
  clearTimeout(timer);
  button.innerHTML = content;
  button.disabled = false;
  button.removeAttribute('aria-busy');
  pendingAuthAction = undefined;
  closeToast();
}

/** 按钮与 Toast 同步展示一秒加载，仅模拟本地账户操作的等待反馈。 */
function startAuthAction(button, label, message, complete) {
  if (pendingAuthAction) return;
  const content = button.innerHTML;
  button.disabled = true;
  button.setAttribute('aria-busy', 'true');
  button.innerHTML = `${loadingIcon({ className: 'button-spinner', foreground: true })}<span>${label}</span>`;
  toast(message, 'loading');
  const timer = setTimeout(() => {
    cancelAuthAction();
    complete();
  }, 1000);
  pendingAuthAction = { timer, button, content };
}

/** 两处偏好入口共用首页心形与局部加载图形。 */
function mountPassiveIcons(root) {
  const template = document.createElement('template');
  template.innerHTML = pages.home;
  root.querySelectorAll('.passive-heart-icon').forEach((slot) => {
    slot.append(template.content.querySelector('.heart-halo').cloneNode(true));
    slot.insertAdjacentHTML('beforeend', loadingIcon({ className: 'passive-heart-spinner button-spinner', hidden: true }));
  });
}

/** 等待期间保留最后确认外观；说明弹窗同样锁住两个入口。 */
function syncPassivePreference() {
  const busy = Boolean(passiveConfirmation || pendingPassiveAction);
  [app, sheetContent].forEach((root) => {
    root.querySelectorAll('[data-setting="passivePreference"]').forEach((input) => {
      input.checked = state.passivePreference;
      input.disabled = busy;
      input.setAttribute('aria-busy', String(busy));
      const control = input.closest('.passive-heart-control');
      control.dataset.pending = String(busy);
      control.querySelector('.passive-heart-spinner').toggleAttribute('hidden', !busy);
    });
  });
}

/** 离页、刷新与重置撤销未完成动作，不改变最后已确认的偏好。 */
function cancelPassiveAction() {
  clearTimeout(pendingPassiveAction?.timer);
  pendingPassiveAction = undefined;
  passiveConfirmation = undefined;
  syncPassivePreference();
}

/** 只模拟一秒本地等待，不请求权限、启动采集或生成心率。 */
function startPassiveAction(enabled) {
  if (passiveConfirmation || pendingPassiveAction) return;
  const action = { timer: undefined, route: location.hash };
  pendingPassiveAction = action;
  syncPassivePreference();
  action.timer = setTimeout(() => {
    if (pendingPassiveAction !== action) return;
    if (location.hash !== action.route) return cancelPassiveAction();
    pendingPassiveAction = undefined;
    state.passivePreference = enabled;
    syncPassivePreference();
  }, 1000);
}

/** 采用原生后台活动说明；去设置不等于授权，返回仍须重新启用。 */
function requestPassivePreference(input) {
  const enabled = input.checked;
  syncPassivePreference();
  if (passiveConfirmation || pendingPassiveAction || enabled === state.passivePreference) return;
  if (!enabled) return startPassiveAction(false);
  const confirmation = { fromPrivacy: sheetContent.contains(input) };
  passiveConfirmation = confirmation;
  syncPassivePreference();
  openSheet('确认后台运行设置', '<p>部分厂商系统会限制应用在后台运行。荣耀设备请到“设置 > 应用 > 本应用 > 耗电详情 > 启动管理”，关闭“自动管理”并打开“允许后台活动”；无需开放“允许自启动”或“允许关联启动”。此项是厂商设置，不是 Android 运行时权限，应用无法自动检查或授予。打开设置并完成操作后，请返回应用再次点击启用，并选择“已设置／不适用，继续”；此设备没有该设置时可直接继续。</p><button type="button" class="cta" data-action="passive-enable-confirm">已设置／不适用，继续</button><button type="button" class="sheet-secondary" data-action="passive-open-settings">打开应用设置</button><button type="button" class="sheet-secondary" data-action="close-sheet">取消</button>', {
    onClose: () => {
      if (passiveConfirmation !== confirmation) return;
      passiveConfirmation = undefined;
      syncPassivePreference();
    },
  });
}

/** 在手机区域内打开弹层，禁用背景页面并保留焦点返回位置。 */
function openSheet(title, html, { confirmOnly = false, layout = 'default', onClose } = {}) {
  if (!sheet.open) lastFocus = document.activeElement;
  sheetOnClose?.();
  sheetOnClose = onClose;
  const openingOpacity = sheet.open ? getComputedStyle(sheetOverlay).opacity : '0';
  sheetAnimation?.cancel();
  sheetSlideAnimation?.cancel();
  sheetClosing = false;
  sheet.dataset.confirmOnly = String(confirmOnly);
  sheet.dataset.layout = layout;
  const closeButton = sheet.querySelector('.sheet-close');
  closeButton.hidden = confirmOnly || layout === 'calendar' || layout === 'selection';
  document.querySelector('#sheet-title').textContent = title;
  sheetContent.innerHTML = html;
  app.inert = true;
  document.querySelector('.demo-controls').inert = true;
  sheetOverlay.hidden = false;
  if (!sheet.open) sheet.show();
  sheetAnimation = sheetOverlay.animate(
    [{ opacity: openingOpacity }, { opacity: 1 }],
    { duration: matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 200, easing: 'ease-out' },
  );
  if (layout === 'selection') sheetSlideAnimation = sheet.animate(
    [{ transform: 'translateY(100%)' }, { transform: 'translateY(0)' }],
    { duration: 280, easing: 'cubic-bezier(.22,1,.36,1)' },
  );
  (confirmOnly || layout === 'calendar' || layout === 'selection' ? sheetContent.querySelector('button') : closeButton)?.focus();
}

/** 淡出完成后才隐藏弹层并恢复焦点；重新打开时取消旧的关闭动画。 */
function closeSheet() {
  if (!sheet.open || sheetClosing) return;
  sheetOnClose?.();
  sheetOnClose = undefined;
  const opacity = getComputedStyle(sheetOverlay).opacity;
  sheetAnimation?.cancel();
  sheetClosing = true;
  const selection = sheet.dataset.layout === 'selection';
  if (selection) {
    const transform = getComputedStyle(sheet).transform;
    sheetSlideAnimation?.cancel();
    sheetSlideAnimation = sheet.animate([{ transform }, { transform: 'translateY(100%)' }], { duration: 220, easing: 'ease-in', fill: 'forwards' });
  }
  sheetAnimation = sheetOverlay.animate(
    [{ opacity }, { opacity: 0 }],
    { duration: selection ? 220 : matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 150, easing: 'ease-in', fill: 'forwards' },
  );
  sheetAnimation.onfinish = () => {
    sheet.close();
    sheetOverlay.hidden = true;
    sheetAnimation.cancel();
    sheetAnimation = undefined;
    sheetSlideAnimation?.cancel();
    sheetSlideAnimation = undefined;
    sheetClosing = false;
    app.inert = !toastOverlay.hidden;
    document.querySelector('.demo-controls').inert = false;
    if (toastOverlay.hidden && lastFocus?.isConnected) lastFocus.focus();
  };
}

/** 基于 hash 的页面跳转支持浏览器前进和后退。 */
function navigate(route) {
  cancelPassiveAction();
  closeSheet();
  if (location.hash === `#${route}`) render();
  else location.hash = route;
}

/** 基础页面与每页导航均由同一路由源生成。 */
function render() {
  clearTimeout(previewRetryTimer);
  disposeDataState?.();
  disposeDataState = null;
  disposeMeasurement?.();
  disposeMeasurement = null;
  closeToast();
  historyPanel?.dispose();
  historyPanel = null;
  cancelAuthAction();
  cancelPassiveAction();
  closeSheet();
  const requested = location.hash.slice(1);
  const preview = Object.hasOwn(stateViews, requested) ? stateViews[requested] : null;
  activePreview = preview;
  if (typeof preview?.loggedIn === 'boolean') state.user = preview.loggedIn ? state.user || state.profile.name || '小安' : '';
  if ((requested.startsWith('measure-') || requested.endsWith('-measurement')) && activeRoute && !activeRoute.startsWith('measure-') && !activeRoute.endsWith('-measurement') && activeRoute !== 'fingertip-results' && activeRoute !== 'blood-pressure-results') {
    measurementReturnRoute = activeRoute;
  }
  activeRoute = preview?.route || (Object.hasOwn(pages, requested) ? requested : 'home');
  if (activeRoute === 'fingertip-results') state.fingertipCompleted = true;
  else if (activeRoute !== 'fingertip-measurement') state.fingertipCompleted = false;
  if (activeRoute === 'blood-pressure-results') state.bloodPressureCompleted = true;
  else if (activeRoute !== 'blood-pressure-measurement') state.bloodPressureCompleted = false;
  if (!activeRoute.startsWith('measure-')) measurementTarget = null;
  if (!preview && requested !== activeRoute) history.replaceState(null, '', `#${activeRoute}`);
  const hasStateView = activeRoute === 'home' || activeRoute === 'account';
  const viewRoute = preview ? requested : hasStateView ? `${activeRoute}-${state.user ? 'logged-in' : 'guest'}` : activeRoute;
  document.title = `${routes[activeRoute]}${preview?.label ? ` · ${preview.label}` : hasStateView ? ` · ${state.user ? '已登录' : '未登录'}` : ''} · 心沐设计演示`;
  app.innerHTML = activeRoute === 'fingertip-results' ? fingertipResultsForState(preview?.resultState)
    : activeRoute === 'blood-pressure-results' ? bloodPressureResultsForState(preview?.resultState) : pages[activeRoute];
  if (activeRoute === 'fingertip-measurement' || activeRoute === 'fingertip-results' || activeRoute === 'blood-pressure-measurement') bindResultIcons();
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
  if (activeRoute === 'home') disposeDataState = applyDataState(app, { page: 'home', state: preview?.dataState ?? 'success' });
  homeRefreshControl.hidden = activeRoute !== 'home';
  homeRefreshControl.disabled = !state.user || preview?.dataState === 'loading' || preview?.dataState === 'refreshing';
  homeRefreshControl.textContent = preview?.dataState === 'refreshing' ? '刷新中…' : '刷新首页';
  if (activeRoute === 'face-measurement') disposeMeasurement = mountFaceMeasurement(app);
  if (activeRoute === 'fingertip-measurement' || activeRoute === 'blood-pressure-measurement') {
    const isBloodPressure = activeRoute === 'blood-pressure-measurement';
    const completedKey = isBloodPressure ? 'bloodPressureCompleted' : 'fingertipCompleted';
    disposeMeasurement = mountContactMeasurement(app, (title, html) => openSheet(title, html, { confirmOnly: true }), {
      completed: state[completedKey] || preview?.resultState === 'success',
      previewState: preview?.resultState ?? 'success',
      onComplete: () => { state[completedKey] = true; },
      onReset: () => {
        state[completedKey] = false;
        activePreview = null;
        history.replaceState(null, '', `#${activeRoute}`);
      },
      onDetails: (resultState = 'success') => navigate(statePreviewRoute(isBloodPressure ? 'blood-pressure-results' : 'fingertip-results', resultState)),
      shouldShowChestGuide: () => !state.skippedChestPlacementGuide,
      onProcessingChange: (processing) => {
        if (processing) toast('等待检测结果，请稍候…', 'loading', { showLabel: false });
        else closeToast();
      },
    });
  }
  if (activeRoute === 'fingertip-results') disposeMeasurement = mountFingertipResults(app, { previewState: preview?.resultState ?? 'success' });
  if (activeRoute === 'blood-pressure-results') disposeMeasurement = mountBloodPressureResults(app, { previewState: preview?.resultState ?? 'success' });
  if (activeRoute.startsWith('measure-')) {
    if (measurementTarget?.route === activeRoute) {
      app.querySelector('.guide-topbar > span').textContent = measurementTarget.label;
    }
    const checkbox = app.querySelector('[data-skip-guide]');
    checkbox.checked = state.skippedMeasurementGuides.has(checkbox.dataset.skipGuide);
    app.querySelector('h1').focus({ preventScroll: true });
  }
  if (pendingPreviewRetry?.loadingRoute === requested) {
    const { successRoute } = pendingPreviewRetry;
    pendingPreviewRetry = null;
    previewRetryTimer = setTimeout(() => {
      if (location.hash !== `#${requested}`) return;
      if (successRoute === 'fingertip-measurement') state.fingertipCompleted = true;
      if (successRoute === 'blood-pressure-measurement') state.bloodPressureCompleted = true;
      navigate(successRoute);
    }, 1000);
  } else pendingPreviewRetry = null;
  if (preview?.feedback) toast(preview.feedback.message, preview.feedback.tone, { showLabel: false });
}

/** 主页按共享登录状态展示读数或空态；未登录入口统一指向登录页。 */
function bindHome() {
  const loggedIn = Boolean(state.user);
  app.querySelector('.home').classList.toggle('home-guest', !loggedIn);
  const detail = asButton(app.querySelector('.bp-detail'), loggedIn ? 'home-history' : 'login-route', 0);
  detail.setAttribute('aria-label', '查看血压日记录');
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
    const button = asButton(card, loggedIn ? 'home-history' : 'login-route', index + 1);
    button.setAttribute('aria-label', `${records[index + 1].title}${loggedIn ? '日记录' : '，暂无记录'}`);
  });
}

/** 恢复无扰心率检测开关及首页同源图标；不启动真实被动测量。 */
function bindFunctions() {
  mountPassiveIcons(app);
  syncPassivePreference();
}

/** 更新同源统计和记录，保留指标及周期控件的焦点。 */
function updateHistory() {
  disposeDataState?.();
  disposeDataState = null;
  historyPanel.update(state.history);
  app.querySelector('[data-history-metric-label]').textContent = historyMetricOptions[state.history.metricIndex].label;
  app.querySelectorAll('[data-action="history-metric-step"]').forEach((button) => {
    const offset = Number(button.dataset.offset);
    const option = historyMetricOptions[state.history.metricIndex + offset];
    button.disabled = !option;
    button.textContent = option?.label ?? '';
    button.setAttribute('aria-label', `${offset < 0 ? '上一个指标' : '下一个指标'}${option ? `：${option.label}` : ''}`);
  });
  app.querySelector('#history-range-label').textContent = rangeLabel(state.history.from, state.history.to);
  app.querySelectorAll('[data-action="history-period"]').forEach((button, index) => {
    const selected = button.dataset.period === state.history.period;
    button.setAttribute('aria-pressed', String(selected));
    if (selected) app.querySelector('.hist-period-options').style.setProperty('--tab-index', index);
  });
  app.querySelectorAll('[data-action="history-shift"]').forEach((button) => {
    button.disabled = state.history.period === 'custom';
  });
  disposeDataState = applyDataState(app, { page: 'history', state: activePreview?.dataState ?? 'success' });
}

/** 指标菜单只在确认时应用草稿，不影响已提交日期区间。 */
function historyMetricMenu() {
  const trigger = app.querySelector('#history-metric');
  let dispose;
  trigger.setAttribute('aria-expanded', 'true');
  openSheet('选择指标', '<div data-selection-sheet></div>', {
    layout: 'selection',
    onClose: () => { dispose?.(); trigger.setAttribute('aria-expanded', 'false'); },
  });
  dispose = mountSelectionSheet(sheetContent.querySelector('[data-selection-sheet]'), {
    title: '选择指标', cancelLabel: '取消', confirmLabel: '确认',
    value: String(state.history.metricIndex), options: historyMetricOptions,
    onCancel: closeSheet,
    onConfirm: (value) => {
      state.history.metricIndex = Number(value);
      updateHistory();
      closeSheet();
    },
  });
}

/** 日期日历使用独立草稿，确认才更新趋势；关闭时释放局部事件。 */
function historyDateForm() {
  let dispose;
  openSheet('选择日期区间', '<div data-history-date-picker></div>', { layout: 'calendar', onClose: () => dispose?.() });
  dispose = mountHistoryDatePicker(sheetContent.querySelector('[data-history-date-picker]'), state.history, {
    onConfirm: ({ from, to }) => {
      Object.assign(state.history, { period: 'custom', anchor: to, from, to });
      updateHistory();
      closeSheet();
    },
    onCancel: closeSheet,
  });
}

/** 重新进入历史页时保留当前标签页中的日期和指标选择。 */
function bindHistory() {
  historyPanel = mountHistoryPanel(app.querySelector('#history-panel'));
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


/** 结果同源复用首页指标图形及 Toast 成功图形；看板保留完整血氧仪表。 */
function bindResultIcons() {
  const template = document.createElement('template');
  template.innerHTML = pages.home;
  const selectors = {
    heart: '.heart-halo .icon',
    breath: '.breathing-art .icon',
    oxygen: '.oxygen-dial',
    risk: '.risk-emblem .icon',
  };
  app.querySelectorAll('[data-result-icon], [data-result-dial]').forEach((slot) => {
    const key = slot.hasAttribute('data-result-dial') ? 'oxygen' : slot.dataset.resultIcon;
    const graphic = template.content.querySelector(selectors[key]).cloneNode(true);
    graphic.classList.add('icon');
    graphic.setAttribute('aria-hidden', 'true');
    graphic.removeAttribute('role');
    graphic.removeAttribute('aria-label');
    slot.append(graphic);
  });
  const success = app.querySelector('[data-result-success]');
  if (success) success.innerHTML = `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${toastStates.success.path}</svg>`;
}

/** 测量入口只介绍交互，不打开相机，也不自动产生结果。 */
function measurement(index) {
  if (index === 0) return cameraMeasurement('chest');
  if (index === 1 || index === 2) return cameraMeasurement('fingertip');
  const metric = records[index];
  const instructions = ['本页展示对应功能的入口与说明。', '网站不连接传感器、相机或风险评估服务。', '可前往历史页体验固定样例的筛选与详情。'];
  openSheet(metric.title, `<p>${metric.description}</p><ol>${instructions.map((text) => `<li>${text}</li>`).join('')}</ol><p class="scope-note">演示模式，不会执行真实测量或上传。</p><button type="button" class="cta" data-action="history-route" data-metric="${index}">查看示例记录 ${icon('arrow')}</button><button type="button" class="sheet-secondary" data-action="close-sheet">返回</button>`);
}

/** 三种方式共用独立说明页；首页原有调用不附加指标目标。 */
function cameraMeasurement(kind, target = '') {
  if (state.skippedMeasurementGuides.has(kind)) return promptMeasurement(kind);
  const route = `measure-${kind}`;
  const method = kind === 'face' ? '面部检测' : kind === 'chest' ? '联合检测' : '指尖检测';
  measurementTarget = target ? { route, label: `${method} · ${target}` } : null;
  navigate(route);
}

/** 检测部位入口直接进入对应准备页，指尖不预先指定指标。 */
function captureEntry(kind) {
  const target = kind === 'face' ? '面部心率' : kind === 'chest' ? '血压估计' : '';
  return cameraMeasurement(kind, target);
}

/** 开始前提醒开启声音；跳过说明页也需确认，不读取或调整系统音量。 */
function promptMeasurement(kind) {
  openSheet('提示', `<p>为便于听取检测过程中的操作引导，请打开手机声音，并将媒体音量调至清晰可闻。</p><button type="button" class="cta" data-action="measurement-confirm" data-measurement="${kind}">立即检测</button><button type="button" class="sheet-secondary" data-action="close-sheet">返回准备</button>`);
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
    openSheet('隐私与授权', `<p>主动测量由用户发起；被动采集需要单独说明与授权。本网站不会申请相机、麦克风或健康权限。</p><div class="setting-label"><span id="passive-privacy-title">被动采集偏好（演示）</span><label class="passive-heart-control"><input type="checkbox" role="switch" data-setting="passivePreference" aria-labelledby="passive-privacy-title"><span class="passive-heart-icon" aria-hidden="true"></span></label></div><p class="scope-note">开关不会启动摄像头或后台任务，刷新后恢复默认。</p>`);
    mountPassiveIcons(sheetContent);
    syncPassivePreference();
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
  if (action === 'home-refresh') {
    if (control.disabled || activeRoute !== 'home' || !state.user) return;
    const loadingRoute = statePreviewRoute('home', 'refreshing');
    pendingPreviewRetry = { loadingRoute, successRoute: statePreviewRoute('home', 'success') };
    return navigate(loadingRoute);
  }
  if (action === 'state-retry') {
    const group = activePreview?.group ?? activeRoute;
    const measurement = group.endsWith('-measurement');
    const loadingRoute = statePreviewRoute(group, measurement ? 'waiting' : 'loading');
    pendingPreviewRetry = { loadingRoute, successRoute: statePreviewRoute(group, 'success') };
    return navigate(loadingRoute);
  }
  if (action === 'navigate') return navigate(control.dataset.route);
  if (action === 'capture-entry') return captureEntry(control.dataset.measurement);
  if (action === 'measurement-back') return navigate(measurementReturnRoute);
  if (action === 'measurement-preview') return promptMeasurement(app.querySelector('[data-guide]').dataset.guide);
  if (action === 'measurement-confirm') {
    const kind = control.dataset.measurement;
    return navigate(kind === 'chest' ? 'blood-pressure-measurement' : `${kind}-measurement`);
  }
  if (action === 'chest-guide-confirm') {
    state.skippedChestPlacementGuide = sheetContent.querySelector('[data-skip-chest-guide]').checked;
    return closeSheet();
  }
  if (action === 'close-sheet') return closeSheet();
  if (action === 'passive-enable-confirm') {
    if (!passiveConfirmation || sheetClosing) return;
    const { fromPrivacy } = passiveConfirmation;
    passiveConfirmation = undefined;
    startPassiveAction(true);
    if (fromPrivacy) settings('privacy-settings');
    else closeSheet();
    return;
  }
  if (action === 'passive-open-settings') {
    if (!passiveConfirmation || sheetClosing) return;
    passiveConfirmation = undefined;
    settings('privacy-settings');
    sheetContent.querySelector('[data-setting="passivePreference"]').focus();
    return;
  }
  if (action === 'preview-sheet') return openSheet('弹窗预览', '<p>这是手机区域内的示例弹窗，仅用于预览样式，不会修改演示数据。</p><p>可点击关闭按钮、遮罩或按 Esc 关闭。</p><button type="button" class="cta" data-action="close-sheet">知道了</button>');
  if (action === 'preview-toast-state') {
    const status = control.dataset.status;
    closeSheet();
    return toast(toastStates[status].message, status);
  }
  if (action === 'home-history') {
    const anchor = initialHistory().anchor;
    Object.assign(state.history, { metricIndex: metric, period: '1', anchor }, periodRange('1', anchor));
    return navigate('history');
  }
  if (action === 'measurement') return measurement(metric);
  if (action === 'history-metric-step') {
    state.history.metricIndex += Number(control.dataset.offset);
    updateHistory(); return;
  }
  if (action === 'history-metric-menu') return historyMetricMenu();
  if (action === 'history-dates') return historyDateForm();
  if (action === 'history-period') {
    const period = control.dataset.period;
    if (period === 'custom') return historyDateForm();
    Object.assign(state.history, { period }, periodRange(period, state.history.anchor));
    updateHistory(); return;
  }
  if (action === 'history-shift') {
    const period = state.history.period;
    const range = periodRange(period, state.history.to, Number(control.dataset.offset));
    Object.assign(state.history, range, { anchor: range.to });
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
    return openSheet('记录详情', `<p class="scope-note">${dates[index]}　08:30</p><h3>${record.title}</h3><div class="metric-value">${reading(state.history.metricIndex, index)} <small>${record.unit}</small></div><p>${record.labels.join(' / ')}</p>${state.history.metricIndex === 1 ? '<p>来源：主动式</p>' : ''}<p class="scope-note">仅供健康管理参考，非医学诊断依据。</p>`);
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
  if (action === 'logout-demo') return startAuthAction(control, '退出中…', '正在退出登录…', () => {
    state.user = ''; navigate('account'); toast('已退出演示账户', 'success');
  });
  if (action === 'reset-demo') return openSheet('重置演示', '<p>清除当前标签页中的演示账户、资料、偏好和筛选条件。不会影响真实 App 或本地采集文件。</p><button type="button" class="cta" data-action="confirm-reset">确认重置</button>');
  if (action === 'confirm-reset') {
    cancelPassiveAction();
    state.user = ''; state.pendingUsername = ''; state.profile = initialProfile();
    state.notifications = false; state.passivePreference = false; state.feedback = '';
    state.skippedMeasurementGuides.clear();
    state.skippedChestPlacementGuide = false;
    measurementTarget = null;
    state.history = initialHistory();
    registeredNames = new Set(); navigate('home'); toast('演示状态已重置', 'success');
  }
}

/** 本地认证演示只验证输入完整性；不替代真实服务端的密码检查。 */
function submitAuth(form, mode) {
  if (pendingAuthAction) return;
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
  error.hidden = true;
  startAuthAction(form.querySelector('[type="submit"]'), mode === 'register' ? '注册中…' : '登录中…', mode === 'register' ? '正在注册…' : '正在登录…', () => {
    if (mode === 'register') {
      registeredNames.add(name); state.pendingUsername = name;
      form.reset(); navigate('login'); toast('演示注册完成，请登录；未创建真实账号', 'success');
    } else {
      state.user = name; state.pendingUsername = name;
      form.reset(); navigate('account'); toast('已进入演示账户，非真实登录', 'success');
    }
  });
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

/** 桌面树形导航保留根节点、分类分支和页面叶节点，基础页面标题取自 routes。 */
const navigationGroups = [
  { label: '主界面', children: ['home', 'functions', 'history', 'account'] },
  { label: '账户', children: ['login', 'register'] },
  { label: '启动展示', children: ['desktop', 'welcome'] },
  { label: '首次体验', children: ['onboarding', 'privacy'] },
];
/** 功能说明与业务入口共用路由，侧栏标签独立于页面标题。 */
const functionPreviewRoutes = [
  { route: 'measure-face', label: '面部检测引导', measurement: 'face-measurement' },
  { route: 'measure-fingertip', label: '指尖检测引导', measurement: 'fingertip-measurement' },
  { route: 'measure-chest', label: '血压检测引导', measurement: 'blood-pressure-measurement' },
];

/** 检测及详细结果的父入口直接展示成功样例，其他状态作为各自子节点。 */
function measurementPreviewNode({ route, label, measurement }) {
  const report = measurement.replace('-measurement', '-results');
  const reportNode = measurement === 'face-measurement' ? '' : `<li><a href="#${report}">详细结果</a>${statePreviewChildren(report)}</li>`;
  const children = measurement === 'face-measurement' ? '' : statePreviewChildren(measurement, reportNode);
  return `<li><a href="#${route}">${label}</a><ul class="demo-measure-views"><li><a href="#${statePreviewRoute(measurement, 'success')}">${routes[measurement]}</a>${children}</li></ul></li>`;
}

/** 主页面的成功入口保留在原层级，状态预览与原有账户、功能分支分开组合。 */
function pageNavigationNode(route) {
  if (route === 'home') return `<li><a href="#home-logged-in">${routes.home}</a>${statePreviewChildren(route, '<li><a href="#home-guest" aria-label="健康，未登录">未登录</a></li>')}</li>`;
  if (route === 'history') return `<li><a href="#history">${routes.history}</a>${statePreviewChildren(route)}</li>`;
  if (route === 'functions') return `<li><a href="#functions">${routes.functions}</a><ul class="demo-function-views">${functionPreviewRoutes.map(measurementPreviewNode).join('')}</ul></li>`;
  if (route === 'account') return `<li><a href="#account">${routes.account}</a><ul class="demo-state-views"><li><a href="#account-guest" aria-label="我的，未登录">未登录</a></li><li><a href="#account-logged-in" aria-label="我的，已登录">已登录</a></li></ul></li>`;
  return `<li><a href="#${route}">${routes[route]}</a></li>`;
}
document.querySelector('.demo-routes').innerHTML = `<div class="demo-nav-root">页面</div><div class="demo-nav-branches">${navigationGroups.map((group, index) =>
  `<section class="demo-nav-group" aria-labelledby="demo-group-${index}"><h2 id="demo-group-${index}">${group.label}</h2><ul>${group.children.map(pageNavigationNode).join('')}</ul></section>`,
).join('')}</div>`;
document.addEventListener('click', onClick);
document.addEventListener('submit', onSubmit);
document.addEventListener('change', (event) => {
  const target = event.target;
  if (target.matches('[data-setting="passivePreference"]')) return requestPassivePreference(target);
  if (target.matches('[data-setting]')) state[target.dataset.setting] = target.checked;
  if (target.matches('[data-skip-guide]')) {
    const kind = target.dataset.skipGuide;
    if (target.checked) state.skippedMeasurementGuides.add(kind);
    else state.skippedMeasurementGuides.delete(kind);
  }
});
document.querySelector('.sheet-close').addEventListener('click', closeSheet);
sheetOverlay.addEventListener('click', (event) => {
  if (event.target === sheetOverlay && sheet.dataset.confirmOnly !== 'true') closeSheet();
});
toastOverlay.addEventListener('click', (event) => {
  if (event.target === toastOverlay && toastOverlay.dataset.dismissOnBackdrop === 'true') closeToast();
});
sheet.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    event.preventDefault();
    if (sheet.dataset.confirmOnly !== 'true') closeSheet();
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
window.addEventListener('pagehide', cancelPassiveAction);
window.addEventListener('beforeunload', cancelPassiveAction);
render();
