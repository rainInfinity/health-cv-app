// 验证打包的语言资源具有相同的命名空间与语义键。

const assert = require('node:assert/strict');
const test = require('node:test');

const zhCN = require('../src/app/i18n/locales/zh-CN.json');
const enUS = require('../src/app/i18n/locales/en-US.json');

test('所有界面语言共享相同的文案命名空间与键', () => {
  const namespaces = Object.keys(zhCN).sort();
  assert.deepEqual(Object.keys(enUS).sort(), namespaces);

  for (const namespace of namespaces) {
    assert.deepEqual(
      Object.keys(enUS[namespace]).sort(),
      Object.keys(zhCN[namespace]).sort(),
      `文案键不一致：${namespace}`,
    );
  }
});
