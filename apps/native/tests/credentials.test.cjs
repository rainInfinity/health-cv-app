// 验证平台安全存储的单记录原子性和作用域隔离。

const assert = require('node:assert/strict');
const test = require('node:test');

const {
  CredentialStorageError,
  createSecureCredentialStore,
} = require('../node_modules/.cache/native-test/app/auth/credentials.js');
const {
  createAuthScope,
  createCredentialStorageKey,
} = require('../node_modules/.cache/native-test/app/auth/scope.js');
const { tokens } = require('./helpers.cjs');

test('凭据按服务和渠道分区，并以单条 JSON 记录整体轮换', async () => {
  const entries = new Map();
  const port = {
    async getItemAsync(key) {
      return entries.get(key) ?? null;
    },
    async setItemAsync(key, value) {
      entries.set(key, value);
    },
    async deleteItemAsync(key) {
      entries.delete(key);
    },
  };
  const firstScope = createAuthScope('https://service.example/', 'android-cn');
  const otherChannel = createAuthScope('https://service.example', 'ios-cn');
  const otherService = createAuthScope('https://other.example', 'android-cn');
  const firstStore = createSecureCredentialStore(firstScope, port);
  const channelStore = createSecureCredentialStore(otherChannel, port);
  const serviceStore = createSecureCredentialStore(otherService, port);

  await firstStore.write(tokens('access-one', 'refresh-one'));
  assert.equal(entries.size, 1);
  assert.deepEqual(await firstStore.read(), tokens('access-one', 'refresh-one'));
  assert.equal(await channelStore.read(), null);
  assert.equal(await serviceStore.read(), null);
  assert.notEqual(createCredentialStorageKey(firstScope), createCredentialStorageKey(otherChannel));
  assert.notEqual(createCredentialStorageKey(firstScope), createCredentialStorageKey(otherService));

  await firstStore.write(tokens('access-two', 'refresh-two'));
  assert.equal(entries.size, 1);
  assert.deepEqual(await firstStore.read(), tokens('access-two', 'refresh-two'));
  await firstStore.delete();
  assert.equal(await firstStore.read(), null);
});

test('安全存储失败和损坏记录明确失败且不返回底层内容', async () => {
  const scope = createAuthScope('https://service.example', 'android-cn');
  const storageFailure = createSecureCredentialStore(scope, {
    async getItemAsync() {
      throw new Error('secret-native-error');
    },
    async setItemAsync() {
      throw new Error('secret-native-error');
    },
    async deleteItemAsync() {
      throw new Error('secret-native-error');
    },
  });
  await assert.rejects(storageFailure.read(), (error) =>
    error instanceof CredentialStorageError && !error.message.includes('secret-native-error'),
  );
  await assert.rejects(storageFailure.write(tokens()), CredentialStorageError);
  await assert.rejects(storageFailure.delete(), CredentialStorageError);

  const malformed = createSecureCredentialStore(scope, {
    async getItemAsync() {
      return JSON.stringify({ accessToken: 'only-one-token' });
    },
    async setItemAsync() {},
    async deleteItemAsync() {},
  });
  await assert.rejects(malformed.read(), (error) => error instanceof CredentialStorageError);
});
