// 验证当前开放的中文资源结构可供本地化消息使用。

const assert = require('node:assert/strict');
const test = require('node:test');

const zhCN = require('../src/app/i18n/locales/zh-CN.json');

test('中文资源命名空间和消息均为可用对象与字符串', () => {
  assert.ok(Object.keys(zhCN).length > 0);

  for (const [namespace, messages] of Object.entries(zhCN)) {
    assert.ok(namespace.length > 0);
    assert.ok(messages != null && typeof messages === 'object' && !Array.isArray(messages));

    for (const [key, message] of Object.entries(messages)) {
      assert.ok(key.length > 0);
      assert.equal(typeof message, 'string', `${namespace}.${key}`);
    }
  }
});

const requiredKeys = {
  'app/navigation': ['entry', 'entryDescription', 'active', 'passive', 'sensors', 'settings'],
  'pages/navigation': ['health', 'features', 'history', 'user', 'dev'],
  'pages/home': ['title', 'disclaimer', 'bloodPressureStatus', 'heartRate', 'respirationRate', 'oxygenSaturation'],
  'pages/metric-detail': ['currentValue', 'latestMeasurement', 'noRecord', 'aboutMetric', 'disclaimer'],
  'pages/features': ['title', 'disclaimer', 'fingertipInstructions', 'faceInstructions', 'riskInstructions'],
  'pages/history': ['title', 'message'],
  'pages/user': ['title', 'myRecords', 'personalProfile', 'helpFeedback'],
  'pages/auth': ['brand', 'username', 'password', 'confirmPassword', 'invalidCredentials', 'usernameExists', 'networkError', 'loggingInButton', 'registeringButton', 'loginProgressToast', 'registerProgressToast', 'loginFailed', 'registerFailed', 'logoutProgressButton', 'logoutProgressToast'],
  'pages/permissions': ['notificationsTitle', 'privacyTitle', 'cameraPurpose', 'notificationPurpose', 'unknown'],
  'pages/startup': ['brand', 'slogan', 'stepOneTitle', 'stepTwoTitle', 'skip', 'finish', 'saveFailed'],
  'pages/dev': ['feedback', 'modalPreviewLongMessage', 'toastSuccess', 'toastError', 'toastLoading', 'toastInformation', 'authFlowPreview', 'authFlowLoading', 'authFlowResult'],
  'pages/language-info': ['title', 'description', 'currentLanguage', 'simplifiedChinese', 'legacyPreference'],
  'shared/feedback': ['dismiss'],
};

function findMissingKeys(resources, requirements) {
  return Object.entries(requirements).flatMap(([namespace, keys]) => {
    const messages = resources[namespace];
    if (messages == null || typeof messages !== 'object') return [`${namespace}.*`];
    return keys.filter((key) => typeof messages[key] !== 'string').map((key) => `${namespace}.${key}`);
  });
}

test('已使用页面所需的简体中文命名空间和消息键完整', () => {
  assert.deepEqual(findMissingKeys(zhCN, requiredKeys), []);
});

test('资源检查能指出缺少的中文命名空间和消息键', () => {
  assert.deepEqual(findMissingKeys({}, { 'pages/home': ['title'] }), ['pages/home.*']);
  assert.deepEqual(findMissingKeys({ 'pages/home': {} }, { 'pages/home': ['title'] }), ['pages/home.title']);
});
