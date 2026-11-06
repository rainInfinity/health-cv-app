// 验证退出反馈不会把未尝试或未确认的远端撤销报告为成功。

const assert = require('node:assert/strict');
const test = require('node:test');

const { classifySignOutResult } = require('../node_modules/.cache/native-test/pages/user/signOutFeedback.js');

test('本地凭据删除失败优先于远端撤销结果', () => {
  assert.equal(classifySignOutResult({
    credentialDeletion: 'failed',
    remoteRevocation: 'confirmed',
  }), 'logoutStorageFailed');
});

test('仅远端撤销已确认且本地凭据删除成功时显示成功', () => {
  assert.equal(classifySignOutResult({
    credentialDeletion: 'succeeded',
    remoteRevocation: 'confirmed',
  }), 'logoutSuccess');
});

test('远端未确认或未尝试均不得报告成功', () => {
  for (const remoteRevocation of ['unconfirmed', 'not-attempted']) {
    assert.equal(classifySignOutResult({
      credentialDeletion: 'succeeded',
      remoteRevocation,
    }), 'logoutRemoteUnconfirmed');
  }
});
