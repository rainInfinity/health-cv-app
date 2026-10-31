// 验证语言选择优先级、系统语言族顺序与安全回退。

const assert = require('node:assert/strict');
const test = require('node:test');

const {
  resolveLocale,
} = require('../node_modules/.cache/native-test/app/i18n/resolveLocale.js');
const {
  createPersistentStorageEngine,
} = require('../node_modules/.cache/native-test/app/storage/persistentEngine.js');

const persistentEvents = {
  addEventListener() {},
  removeEventListener() {},
};

function createStorage(values) {
  return {
    getString(key) {
      return values.get(key);
    },
    set(key, value) {
      values.set(key, value);
    },
    remove(key) {
      return values.delete(key);
    },
    contains(key) {
      return values.has(key);
    },
    getAllKeys() {
      return [...values.keys()];
    },
  };
}

function deviceLocale(languageTag, languageCode = languageTag.split('-')[0]) {
  return { languageTag, languageCode };
}

test('显式语言优先于设备语言列表', () => {
  assert.equal(resolveLocale('en-US', [deviceLocale('zh-CN')]), 'en-US');
  assert.equal(resolveLocale('zh-CN', [deviceLocale('en-GB')]), 'zh-CN');
});

test('跟随系统将中文及英语语言族映射到首发 locale', () => {
  assert.equal(resolveLocale('system', [deviceLocale('zh-Hant-TW', 'zh')]), 'zh-CN');
  assert.equal(resolveLocale('system', [deviceLocale('en-GB', 'en')]), 'en-US');
});

test('首选语言不支持时继续查找后续设备语言', () => {
  assert.equal(
    resolveLocale('system', [deviceLocale('fr-FR'), deviceLocale('en-GB')]),
    'en-US',
  );
});

test('设备语言列表没有受支持语言时回退简体中文', () => {
  assert.equal(resolveLocale('system', [deviceLocale('fr-FR'), deviceLocale('de-DE')]), 'zh-CN');
  assert.equal(resolveLocale('system', []), 'zh-CN');
});

test('系统语言刷新更新派生 locale，但持久选择仍为 system', async () => {
  const { persistentAtom, setPersistentEngine } = await import('@nanostores/persistent');
  const { formatter } = await import('@nanostores/i18n');
  const { createLocaleState } = await import(
    '../node_modules/.cache/native-test/app/i18n/localeState.js'
  );
  const values = new Map();
  const storage = createStorage(values);
  setPersistentEngine(createPersistentStorageEngine(storage), persistentEvents);

  const preference = persistentAtom('test.locale-preference', 'zh-CN', { listen: false });
  preference.set('system');
  let locales = [deviceLocale('en-GB')];
  const localeState = createLocaleState(preference, () => locales);

  const format = formatter(localeState.currentLocale);
  const wallClockDate = new Date(Date.UTC(2024, 0, 2, 15, 4));
  const dateOptions = { dateStyle: 'long', timeZone: 'UTC' };

  assert.equal(localeState.currentLocale.get(), 'en-US');
  assert.equal(
    format.get().time(wallClockDate, dateOptions),
    new Intl.DateTimeFormat('en-US', dateOptions).format(wallClockDate),
  );
  locales = [deviceLocale('zh-Hant-TW', 'zh')];
  localeState.refreshSystemLocales();

  assert.equal(localeState.currentLocale.get(), 'zh-CN');
  assert.equal(
    format.get().time(wallClockDate, dateOptions),
    new Intl.DateTimeFormat('zh-CN', dateOptions).format(wallClockDate),
  );
  assert.equal(preference.get(), 'system');
  assert.equal(values.get('test.locale-preference'), 'system');
});
