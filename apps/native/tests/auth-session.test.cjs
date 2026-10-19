// 验证恢复、受控刷新、取消和退出的会话边界。

const assert = require('node:assert/strict');
const test = require('node:test');

const { AuthSessionError } = require('../node_modules/.cache/native-test/app/auth/session.js');
const { apiError, createHarness, deferred, flushMicrotasks, tokens } = require('./helpers.cjs');

test('登录只发布最小身份，认证秘密不进入 Query 缓存，退出清除凭据', async () => {
  const harness = createHarness();
  await harness.auth.restore();
  assert.deepEqual(harness.auth.state.get(), { status: 'anonymous' });

  const credentials = { username: 'private-user', password: 'private-password' };
  assert.deepEqual(await harness.auth.register(credentials), { userId: 17, username: 'test-user' });
  assert.deepEqual(harness.auth.state.get(), { status: 'anonymous' });
  assert.equal(harness.accessTokenSource.current, null);
  assert.deepEqual(await harness.auth.signIn(credentials), { userId: 17, username: 'test-user' });
  assert.deepEqual(harness.auth.state.get(), {
    status: 'authenticated',
    userId: 17,
    username: 'test-user',
  });
  assert.equal(harness.accessTokenSource.current, 'access-login');
  assert.equal(harness.queryClient.getQueryCache().getAll().length, 0);
  assert.equal(harness.queryClient.getMutationCache().getAll().length, 0);
  assert.equal(JSON.stringify(harness.auth.state.get()).includes('private-password'), false);

  const result = await harness.auth.signOut();
  assert.deepEqual(result, { remoteRevocation: 'confirmed', credentialDeletion: 'succeeded' });
  assert.deepEqual(harness.auth.state.get(), { status: 'anonymous' });
  assert.equal(harness.accessTokenSource.current, null);
  assert.equal(await harness.credentials.read(), null);
});

test('登录凭据写入失败与身份确认失败发布不同状态', async () => {
  const credentials = { username: 'private-user', password: 'private-password' };
  const storageFailure = createHarness();
  await storageFailure.auth.restore();
  storageFailure.faults.write = true;

  await assert.rejects(storageFailure.auth.signIn(credentials));
  assert.deepEqual(storageFailure.auth.state.get(), {
    status: 'unavailable',
    reason: 'credential-storage',
  });
  assert.equal(storageFailure.accessTokenSource.current, null);
  assert.equal((await storageFailure.credentials.read()), null);
  assert.equal(storageFailure.queryClient.getQueryCache().getAll().length, 0);
  assert.equal(storageFailure.queryClient.getMutationCache().getAll().length, 0);

  const networkFailure = Object.assign(new Error('offline'), { kind: 'network' });
  const identityFailure = createHarness({
    client: { users: { async getMe() { throw networkFailure; } } },
  });
  await identityFailure.auth.restore();

  await assert.rejects(identityFailure.auth.signIn(credentials));
  assert.deepEqual(identityFailure.auth.state.get(), { status: 'unavailable', reason: 'network' });
  assert.deepEqual(await identityFailure.credentials.read(), tokens('access-login', 'refresh-login'));
  assert.equal(identityFailure.queryClient.getQueryCache().getAll().length, 0);
  assert.equal(identityFailure.queryClient.getMutationCache().getAll().length, 0);
  let operationCalled = false;
  await assert.rejects(identityFailure.auth.runProtected(async () => {
    operationCalled = true;
  }));
  assert.equal(operationCalled, false);
});

test('身份确认网络故障保留凭据但关闭受保护请求', async () => {
  const networkFailure = Object.assign(new Error('offline'), { kind: 'network' });
  const harness = createHarness({
    client: { users: { async getMe() { throw networkFailure; } } },
  });
  await harness.credentials.write(tokens());

  await harness.auth.restore();

  assert.deepEqual(harness.auth.state.get(), { status: 'unavailable', reason: 'network' });
  assert.deepEqual(await harness.credentials.read(), tokens());
  let operationCalled = false;
  await assert.rejects(harness.auth.runProtected(async () => {
    operationCalled = true;
  }));
  assert.equal(operationCalled, false);
});

test('身份确认服务端故障保留凭据且不尝试刷新', async () => {
  let refreshCount = 0;
  const harness = createHarness({
    client: {
      auth: {
        async refresh() {
          refreshCount += 1;
          return tokens('unexpected-access', 'unexpected-refresh');
        },
      },
      users: {
        async getMe() {
          throw apiError(503, 'SERVICE_UNAVAILABLE');
        },
      },
    },
  });
  await harness.credentials.write(tokens());

  await harness.auth.restore();

  assert.deepEqual(harness.auth.state.get(), { status: 'unavailable', reason: 'network' });
  assert.deepEqual(await harness.credentials.read(), tokens());
  assert.equal(refreshCount, 0);
});

test('启动恢复确认身份失败且 Refresh 明确失效时删除凭据', async () => {
  let identityCount = 0;
  let refreshCount = 0;
  const harness = createHarness({
    client: {
      auth: {
        async refresh() {
          refreshCount += 1;
          throw apiError(401, 'INVALID_TOKEN');
        },
      },
      users: {
        async getMe() {
          identityCount += 1;
          throw apiError(401, 'INVALID_TOKEN');
        },
      },
    },
  });
  await harness.credentials.write(tokens());

  await harness.auth.restore();

  assert.equal(identityCount, 1);
  assert.equal(refreshCount, 1);
  assert.deepEqual(harness.auth.state.get(), { status: 'anonymous' });
  assert.equal(harness.accessTokenSource.current, null);
  assert.equal(await harness.credentials.read(), null);
});

test('并发失效请求共享刷新，单个等待者取消不影响其他请求', async () => {
  const refreshStarted = deferred();
  const refreshResult = deferred();
  let refreshCount = 0;
  const harness = createHarness({
    client: {
      auth: {
        async refresh() {
          refreshCount += 1;
          refreshStarted.resolve();
          return refreshResult.promise;
        },
      },
    },
  });
  await harness.credentials.write(tokens());
  await harness.auth.restore();
  const generation = harness.auth.getSessionGeneration();
  const bothFailed = deferred();
  let initialFailures = 0;
  const attempts = { cancelled: 0, active: 0 };
  const operation = (label) => async () => {
    attempts[label] += 1;
    if (attempts[label] === 1) {
      initialFailures += 1;
      if (initialFailures === 2) bothFailed.resolve();
      throw apiError(401, 'INVALID_TOKEN');
    }
    return `${label}:${harness.accessTokenSource.current}`;
  };
  const cancelledSignal = new AbortController();
  const cancelled = harness.auth.runProtected(
    operation('cancelled'),
    { signal: cancelledSignal.signal },
    generation,
  );
  const active = harness.auth.runProtected(operation('active'), {}, generation);
  const cancelledOutcome = cancelled.then(
    (value) => ({ value }),
    (error) => ({ error }),
  );
  await bothFailed.promise;
  await refreshStarted.promise;
  assert.equal(refreshCount, 1);

  cancelledSignal.abort();
  const cancelledResult = await cancelledOutcome;
  assert.ok(cancelledResult.error instanceof AuthSessionError);
  assert.equal(cancelledResult.error.code, 'operation-cancelled');
  refreshResult.resolve(tokens('access-new', 'refresh-new'));

  assert.equal(await active, 'active:access-new');
  assert.equal(refreshCount, 1);
  assert.equal(attempts.cancelled, 1);
  assert.equal(attempts.active, 2);
  assert.deepEqual(await harness.credentials.read(), tokens('access-new', 'refresh-new'));
});

test('刷新完成前发出的迟到 401 使用已轮换令牌且不启动第二次刷新', async () => {
  const refreshStarted = deferred();
  const refreshResult = deferred();
  const lateRequestStarted = deferred();
  const releaseLateUnauthorized = deferred();
  let refreshCount = 0;
  let lateAttempts = 0;
  const harness = createHarness({
    client: {
      auth: {
        async refresh() {
          refreshCount += 1;
          refreshStarted.resolve();
          return refreshResult.promise;
        },
      },
    },
  });
  await harness.credentials.write(tokens());
  await harness.auth.restore();
  const generation = harness.auth.getSessionGeneration();

  const immediate = harness.auth.runProtected(async () => {
    throw apiError(401, 'INVALID_TOKEN');
  }, {}, generation);
  const late = harness.auth.runProtected(async () => {
    lateAttempts += 1;
    if (lateAttempts === 1) {
      lateRequestStarted.resolve();
      await releaseLateUnauthorized.promise;
      throw apiError(401, 'INVALID_TOKEN');
    }
    return 'late-retry-success';
  }, {}, generation);

  await lateRequestStarted.promise;
  await refreshStarted.promise;
  refreshResult.resolve(tokens('access-rotated', 'refresh-rotated'));
  await assert.rejects(immediate);
  releaseLateUnauthorized.resolve();

  assert.equal(await late, 'late-retry-success');
  assert.equal(lateAttempts, 2);
  assert.equal(refreshCount, 1);
});

test('403 不触发刷新', async () => {
  let refreshCount = 0;
  const harness = createHarness({
    client: { auth: { async refresh() { refreshCount += 1; return tokens(); } } },
  });
  await harness.credentials.write(tokens());
  await harness.auth.restore();
  const forbidden = apiError(403, 'CHANNEL_FORBIDDEN');

  await assert.rejects(harness.auth.runProtected(async () => { throw forbidden; }), forbidden);
  assert.equal(refreshCount, 0);
});

test('普通网络故障不会重试受保护写入', async () => {
  const networkFailure = Object.assign(new Error('offline'), { kind: 'network' });
  let attempts = 0;
  let refreshCount = 0;
  const harness = createHarness({
    client: {
      auth: {
        async refresh() {
          refreshCount += 1;
          return tokens('unexpected-access', 'unexpected-refresh');
        },
      },
    },
  });
  await harness.credentials.write(tokens());
  await harness.auth.restore();

  await assert.rejects(harness.auth.runProtected(async () => {
    attempts += 1;
    throw networkFailure;
  }), networkFailure);

  assert.equal(attempts, 1);
  assert.equal(refreshCount, 0);
  assert.deepEqual(await harness.credentials.read(), tokens());
  assert.equal(harness.auth.state.get().status, 'authenticated');
});

test('刷新凭据明确失效时结束本地会话并删除令牌对', async () => {
  const harness = createHarness({
    client: { auth: { async refresh() { throw apiError(401, 'INVALID_TOKEN'); } } },
  });
  await harness.credentials.write(tokens());
  await harness.auth.restore();

  await assert.rejects(harness.auth.runProtected(async () => {
    throw apiError(401, 'INVALID_TOKEN');
  }));

  assert.deepEqual(harness.auth.state.get(), { status: 'anonymous' });
  assert.equal(harness.accessTokenSource.current, null);
  assert.equal(await harness.credentials.read(), null);
});

test('退出会中止未完成的身份确认，迟到响应不能复活旧会话', async () => {
  const identityStarted = deferred();
  const identityResult = deferred();
  let identitySignal;
  const harness = createHarness({
    client: {
      users: {
        getMe(options) {
          identitySignal = options.signal;
          identityStarted.resolve();
          return identityResult.promise;
        },
      },
    },
  });
  await harness.credentials.write(tokens());
  const restore = harness.auth.restore();
  await identityStarted.promise;

  await harness.auth.signOut();
  assert.equal(identitySignal.aborted, true);
  identityResult.resolve({ userId: 17, username: 'stale-user' });
  await restore;

  assert.deepEqual(harness.auth.state.get(), { status: 'anonymous' });
  assert.equal(await harness.credentials.read(), null);
});

test('退出会中止旧登录，忽略迟到令牌响应', async () => {
  const loginStarted = deferred();
  const loginResult = deferred();
  let loginSignal;
  const harness = createHarness({
    client: {
      auth: {
        login(_credentials, options) {
          loginSignal = options.signal;
          loginStarted.resolve();
          return loginResult.promise;
        },
      },
    },
  });
  await harness.auth.restore();
  const login = harness.auth.signIn({ username: 'user', password: 'private' });
  const loginOutcome = login.then(
    (value) => ({ value }),
    (error) => ({ error }),
  );
  await loginStarted.promise;

  await harness.auth.signOut();
  assert.equal(loginSignal.aborted, true);
  loginResult.resolve(tokens('stale-access', 'stale-refresh'));
  const result = await loginOutcome;

  assert.ok(result.error instanceof AuthSessionError);
  assert.equal(result.error.code, 'session-changed');
  assert.deepEqual(harness.auth.state.get(), { status: 'anonymous' });
  assert.equal(await harness.credentials.read(), null);
});
test('刷新轮换写入安全存储失败时不重发且不继续暴露旧 Access Token', async () => {
  const harness = createHarness();
  await harness.credentials.write(tokens());
  await harness.auth.restore();
  harness.faults.write = true;
  let attempts = 0;

  await assert.rejects(harness.auth.runProtected(async () => {
    attempts += 1;
    throw apiError(401, 'INVALID_TOKEN');
  }));

  assert.equal(attempts, 1);
  assert.deepEqual(harness.auth.state.get(), { status: 'unavailable', reason: 'credential-storage' });
  assert.equal(harness.accessTokenSource.current, null);
  assert.deepEqual(await harness.credentials.read(), tokens());
});

test('刷新超时保留凭据并将会话标记为暂不可确认', async () => {
  const timeout = Object.assign(new Error('timeout'), { kind: 'timeout' });
  const harness = createHarness({
    client: { auth: { async refresh() { throw timeout; } } },
  });
  await harness.credentials.write(tokens());
  await harness.auth.restore();

  await assert.rejects(harness.auth.runProtected(async () => {
    throw apiError(401, 'INVALID_TOKEN');
  }));

  assert.deepEqual(harness.auth.state.get(), { status: 'unavailable', reason: 'network' });
  assert.deepEqual(await harness.credentials.read(), tokens());
});

test('新登录完成后迟到的旧刷新不能覆盖新令牌', async () => {
  const refreshStarted = deferred();
  const refreshResult = deferred();
  const harness = createHarness({
    client: {
      auth: {
        async refresh() {
          refreshStarted.resolve();
          return refreshResult.promise;
        },
      },
    },
  });
  await harness.credentials.write(tokens());
  await harness.auth.restore();
  const generation = harness.auth.getSessionGeneration();
  const oldRequest = harness.auth.runProtected(async () => {
    throw apiError(401, 'INVALID_TOKEN');
  }, {}, generation);
  const oldOutcome = oldRequest.then(
    (value) => ({ value }),
    (error) => ({ error }),
  );
  await refreshStarted.promise;

  await harness.auth.signIn({ username: 'new-user', password: 'new-password' });
  assert.equal(harness.accessTokenSource.current, 'access-login');
  refreshResult.resolve(tokens('stale-access', 'stale-refresh'));
  await flushMicrotasks();

  const result = await oldOutcome;
  assert.ok(result.error instanceof AuthSessionError);
  assert.equal(result.error.code, 'operation-cancelled');
  assert.deepEqual(harness.auth.state.get(), {
    status: 'authenticated',
    userId: 17,
    username: 'test-user',
  });
  assert.deepEqual(await harness.credentials.read(), tokens('access-login', 'refresh-login'));
  assert.equal(harness.accessTokenSource.current, 'access-login');
});

test('退出串行等待在途轮换写入并撤销最新令牌', async () => {
  const refreshStarted = deferred();
  const refreshResult = deferred();
  const rotationWriteStarted = deferred();
  const rotationWriteResult = deferred();
  let revokedRefreshToken = null;
  const harness = createHarness({
    client: {
      auth: {
        async refresh() {
          refreshStarted.resolve();
          return refreshResult.promise;
        },
        async logout(refreshToken) {
          revokedRefreshToken = refreshToken;
          return null;
        },
      },
    },
  });
  await harness.credentials.write(tokens());
  const originalWrite = harness.credentials.write.bind(harness.credentials);
  harness.credentials.write = async (credentialPair) => {
    if (credentialPair.accessToken === 'access-rotated') {
      rotationWriteStarted.resolve();
      await rotationWriteResult.promise;
    }
    await originalWrite(credentialPair);
  };
  await harness.auth.restore();
  const generation = harness.auth.getSessionGeneration();
  const request = harness.auth.runProtected(async () => {
    throw apiError(401, 'INVALID_TOKEN');
  }, {}, generation);
  const requestOutcome = request.then(
    (value) => ({ value }),
    (error) => ({ error }),
  );
  await refreshStarted.promise;
  refreshResult.resolve(tokens('access-rotated', 'refresh-rotated'));
  await rotationWriteStarted.promise;

  const logout = harness.auth.signOut();
  assert.deepEqual(harness.auth.state.get(), { status: 'anonymous' });
  assert.equal(harness.accessTokenSource.current, null);
  await flushMicrotasks();
  assert.equal(harness.operations.deletes, 0);
  rotationWriteResult.resolve();

  const requestResult = await requestOutcome;
  assert.ok(requestResult.error instanceof AuthSessionError);
  assert.equal(requestResult.error.code, 'operation-cancelled');
  assert.deepEqual(await logout, {
    remoteRevocation: 'confirmed',
    credentialDeletion: 'succeeded',
  });
  assert.equal(revokedRefreshToken, 'refresh-rotated');
  assert.deepEqual(harness.auth.state.get(), { status: 'anonymous' });
  assert.equal(await harness.credentials.read(), null);
  assert.equal(harness.operations.deletes, 1);
});

test('远端登出网络失败仍完成本地清理并明确标记撤销未确认', async () => {
  const networkFailure = Object.assign(new Error('offline'), { kind: 'network' });
  const harness = createHarness({
    client: { auth: { async logout() { throw networkFailure; } } },
  });
  await harness.credentials.write(tokens());
  await harness.auth.restore();

  assert.deepEqual(await harness.auth.signOut(), {
    remoteRevocation: 'unconfirmed',
    credentialDeletion: 'succeeded',
  });
  assert.deepEqual(harness.auth.state.get(), { status: 'anonymous' });
  assert.equal(harness.accessTokenSource.current, null);
  assert.equal(await harness.credentials.read(), null);
});

test('本地凭据删除失败有明确结果且不能伪装为成功登出', async () => {
  const harness = createHarness();
  await harness.credentials.write(tokens());
  await harness.auth.restore();
  harness.faults.delete = true;

  assert.deepEqual(await harness.auth.signOut(), {
    remoteRevocation: 'confirmed',
    credentialDeletion: 'failed',
  });
  assert.deepEqual(harness.auth.state.get(), {
    status: 'unavailable',
    reason: 'credential-storage',
  });
  assert.equal(harness.accessTokenSource.current, null);
  assert.deepEqual(await harness.credentials.read(), tokens());
});
