// 验证认证错误只映射到安全且与操作匹配的本地文案键。

const assert = require('node:assert/strict');
const test = require('node:test');

const { classifyAuthFormError } = require('../node_modules/.cache/native-test/pages/user/authFormErrors.js');

test('结构化认证错误映射到对应的安全消息键', () => {
  assert.equal(classifyAuthFormError({ code: 'INVALID_CREDENTIALS' }, 'login'), 'invalidCredentials');
  assert.equal(classifyAuthFormError({ code: 'USERNAME_EXISTS' }, 'register'), 'usernameExists');
  assert.equal(classifyAuthFormError({ code: 'INVALID_INPUT' }, 'register'), 'invalidInput');
  assert.equal(classifyAuthFormError({ kind: 'network' }, 'login'), 'networkError');
  assert.equal(classifyAuthFormError({ kind: 'timeout' }, 'register'), 'networkError');
  assert.equal(classifyAuthFormError({ code: 'credential-storage-failed' }, 'login'), 'secureStorageError');
});

test('未知认证错误按登录或注册使用安全兜底', () => {
  const secret = 'server response with sensitive details';
  const error = new Error(secret);
  const keys = [
    classifyAuthFormError(error, 'login'),
    classifyAuthFormError(error, 'register'),
  ];

  assert.deepEqual(keys, ['loginFailed', 'registerFailed']);
  assert.equal(JSON.stringify(keys).includes(secret), false);
});
