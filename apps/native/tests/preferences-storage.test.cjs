// 验证语言偏好的持久化恢复与存储失败语义。

const assert = require('node:assert/strict');
const { before, test } = require('node:test');

const {
  createPersistentStorageEngine,
} = require('../node_modules/.cache/native-test/app/storage/persistentEngine.js');
const {
  decodeLanguagePreference,
} = require('../node_modules/.cache/native-test/app/preferences/types.js');

const persistentEvents = {
  addEventListener() {},
  removeEventListener() {},
};

let storage;
let createPreference;

function createStorage(values = new Map()) {
  let writeFailure = null;

  return {
    failWrites(error) {
      writeFailure = error;
    },
    getString(key) {
      return values.get(key);
    },
    set(key, value) {
      if (writeFailure) throw writeFailure;
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

before(async () => {
  const { persistentAtom, setPersistentEngine } = await import('@nanostores/persistent');
  storage = createStorage();
  setPersistentEngine(createPersistentStorageEngine(storage), persistentEvents);
  createPreference = (key) => persistentAtom(key, 'zh-CN', {
    listen: false,
    decode: decodeLanguagePreference,
    encode: (value) => value,
  });
});

test('首次无偏好默认中文，英文选择可从新 Store 恢复', () => {
  const preference = createPreference('app.language-preference');

  assert.equal(preference.get(), 'zh-CN');
  preference.set('en-US');

  const restored = createPreference('app.language-preference');
  assert.equal(restored.get(), 'en-US');
});

test('无效持久化语言回退为中文', () => {
  const preference = createPreference('app.language-preference.invalid');
  storage.set('app.language-preference.invalid', 'fr-FR');

  assert.equal(preference.get(), 'zh-CN');
});

test('MMKV 写入失败会传播且不更新已挂载的 Store', () => {
  const preference = createPreference('app.language-preference.failure');
  assert.equal(preference.get(), 'zh-CN');
  storage.failWrites(new Error('storage unavailable'));

  assert.throws(() => preference.set('en-US'), /storage unavailable/);
  assert.equal(preference.get(), 'zh-CN');
});
