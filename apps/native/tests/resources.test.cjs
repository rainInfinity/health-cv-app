// 验证服务端查询的认证门控、缓存隔离与资料写回。

const assert = require('node:assert/strict');
const test = require('node:test');

const { createAuthScope } = require('../node_modules/.cache/native-test/app/auth/scope.js');
const { createAppQueries } = require('../node_modules/.cache/native-test/app/query/resources.js');
const {
  createServerQueryKeys,
  isScopedServerKey,
} = require('../node_modules/.cache/native-test/app/query/keys.js');
const { apiError, createHarness, deferred, tokens } = require('./helpers.cjs');

test('查询键按服务、渠道和会话代次隔离', () => {
  const scope = createAuthScope('https://service.example/', 'android-cn');
  const otherScope = createAuthScope('https://service.example', 'ios-cn');
  const current = createServerQueryKeys(scope, 4);
  const nextSession = createServerQueryKeys(scope, 5);
  const otherChannel = createServerQueryKeys(otherScope, 4);

  assert.notDeepEqual(current.profile, nextSession.profile);
  assert.notDeepEqual(current.profile, otherChannel.profile);
  assert.equal(isScopedServerKey(current.profile, scope, 4), true);
  assert.equal(isScopedServerKey(current.profile, scope, 5), false);
  assert.equal(isScopedServerKey(otherChannel.profile, scope, 4), false);
});

test('资料查询仅在会话已确认后启用，更新缓存使用完整响应', async () => {
  const harness = createHarness();
  const queries = createAppQueries(harness.client, harness.auth, harness.queryClient, harness.scope);
  assert.equal(queries.profile().enabled, false);

  await harness.credentials.write(tokens());
  await harness.auth.restore();
  const profileQuery = queries.profile();
  assert.equal(profileQuery.enabled, true);
  const profile = await harness.queryClient.fetchQuery(profileQuery);
  assert.deepEqual(profile, { name: '现有资料', heightCm: '170.00' });

  const mutationOptions = queries.updateProfile();
  const mutation = harness.queryClient.getMutationCache().build(harness.queryClient, mutationOptions);
  const updated = await mutation.execute({ profile: { name: '已修改' } });
  assert.deepEqual(updated, { name: '已修改', heightCm: '170.00' });
  assert.deepEqual(harness.queryClient.getQueryData(profileQuery.queryKey), updated);
  assert.equal(harness.queryClient.getDefaultOptions().queries.retry, false);
  assert.equal(harness.queryClient.getDefaultOptions().mutations.retry, false);
});

test('刷新令牌不改变资料查询作用域或复制资料到认证状态', async () => {
  let profileAttempts = 0;
  let refreshCount = 0;
  const harness = createHarness({
    client: {
      auth: {
        async refresh() {
          refreshCount += 1;
          return tokens('access-rotated', 'refresh-rotated');
        },
      },
      users: {
        async getProfile() {
          profileAttempts += 1;
          if (profileAttempts === 1) {
            throw apiError(401, 'INVALID_TOKEN');
          }
          return { name: '轮换后资料', heightCm: '170.00' };
        },
      },
    },
  });
  await harness.credentials.write(tokens());
  await harness.auth.restore();
  const startingGeneration = harness.auth.getSessionGeneration();
  const queries = createAppQueries(harness.client, harness.auth, harness.queryClient, harness.scope);
  const beforeRotation = queries.profile();

  assert.deepEqual(harness.auth.state.get(), {
    status: 'authenticated',
    userId: 17,
    username: 'test-user',
  });
  assert.deepEqual(
    await harness.queryClient.fetchQuery(beforeRotation),
    { name: '轮换后资料', heightCm: '170.00' },
  );

  const afterRotation = queries.profile();
  assert.deepEqual(afterRotation.queryKey, beforeRotation.queryKey);
  assert.equal(afterRotation.enabled, true);
  assert.equal(harness.auth.getSessionGeneration(), startingGeneration);
  assert.equal(refreshCount, 1);
  assert.equal(profileAttempts, 2);
  assert.deepEqual(harness.auth.state.get(), {
    status: 'authenticated',
    userId: 17,
    username: 'test-user',
  });
  assert.deepEqual(await harness.credentials.read(), tokens('access-rotated', 'refresh-rotated'));
});

test('退出清除旧会话缓存，迟到响应不能重新填入已删除的资料', async () => {
  const profileStarted = deferred();
  const lateProfile = deferred();
  let profileSignal;
  const harness = createHarness({
    client: {
      users: {
        getProfile(options) {
          profileSignal = options.signal;
          profileStarted.resolve();
          return lateProfile.promise;
        },
      },
    },
  });
  await harness.credentials.write(tokens());
  await harness.auth.restore();
  const generation = harness.auth.getSessionGeneration();
  const queries = createAppQueries(harness.client, harness.auth, harness.queryClient, harness.scope);
  const profileQuery = queries.profile();
  const oldKey = profileQuery.queryKey;
  const otherScope = createAuthScope('https://another.example', 'android-cn');
  const otherKey = createServerQueryKeys(otherScope, generation).profile;
  const otherGenerationKey = createServerQueryKeys(harness.scope, generation + 1).profile;
  const preferenceKey = ['preferences', 'theme'];
  const currentMutationKey = createServerQueryKeys(harness.scope, generation).updateProfile;
  const preferenceMutationKey = ['preferences', 'theme'];
  harness.queryClient.setQueryData(oldKey, { name: '旧会话' });
  harness.queryClient.setQueryData(otherKey, { name: '其他服务' });
  harness.queryClient.setQueryData(otherGenerationKey, { name: '其他代次' });
  harness.queryClient.setQueryData(preferenceKey, { theme: 'dark' });
  const mutationCache = harness.queryClient.getMutationCache();
  const currentMutation = mutationCache.build(harness.queryClient, {
    mutationKey: currentMutationKey,
    mutationFn: async () => null,
  });
  const preferenceMutation = mutationCache.build(harness.queryClient, {
    mutationKey: preferenceMutationKey,
    mutationFn: async () => null,
  });

  const query = harness.queryClient.fetchQuery(profileQuery);
  const queryOutcome = query.then(
    (value) => ({ value }),
    (error) => ({ error }),
  );
  await profileStarted.promise;
  await harness.auth.signOut();
  assert.equal(profileSignal.aborted, true);
  assert.equal(harness.queryClient.getQueryData(oldKey), undefined);
  assert.deepEqual(harness.queryClient.getQueryData(otherKey), { name: '其他服务' });
  assert.deepEqual(harness.queryClient.getQueryData(otherGenerationKey), { name: '其他代次' });
  assert.equal(mutationCache.getAll().includes(currentMutation), false);
  assert.equal(mutationCache.getAll().includes(preferenceMutation), true);
  assert.deepEqual(harness.queryClient.getQueryData(preferenceKey), { theme: 'dark' });

  lateProfile.resolve({ name: '迟到旧资料' });
  await queryOutcome;
  await Promise.resolve();
  assert.equal(harness.queryClient.getQueryData(oldKey), undefined);
});
test('退出后迟到的资料更新不能回填旧会话缓存', async () => {
  const updateStarted = deferred();
  const lateUpdate = deferred();
  const harness = createHarness({
    client: {
      users: {
        updateProfile() {
          updateStarted.resolve();
          return lateUpdate.promise;
        },
      },
    },
  });
  await harness.credentials.write(tokens());
  await harness.auth.restore();
  const queries = createAppQueries(harness.client, harness.auth, harness.queryClient, harness.scope);
  const profileQuery = queries.profile();
  harness.queryClient.setQueryData(profileQuery.queryKey, { name: '当前资料' });
  const mutationOptions = queries.updateProfile();
  const mutation = harness.queryClient.getMutationCache().build(harness.queryClient, mutationOptions);
  const mutationResult = mutation.execute({ profile: { name: '旧会话更新' } });

  await updateStarted.promise;
  await harness.auth.signOut();
  assert.equal(harness.queryClient.getQueryData(profileQuery.queryKey), undefined);

  lateUpdate.resolve({ name: '迟到的服务端资料', heightCm: '170.00' });
  await assert.rejects(mutationResult);
  assert.equal(harness.queryClient.getQueryData(profileQuery.queryKey), undefined);
});
