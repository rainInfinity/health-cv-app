// 为 Native 认证、凭据和查询行为测试提供隔离依赖。

const {
  createSecureCredentialStore,
} = require('../node_modules/.cache/native-test/app/auth/credentials.js');
const {
  createAuthScope,
} = require('../node_modules/.cache/native-test/app/auth/scope.js');
const {
  createAuthSessionManager,
} = require('../node_modules/.cache/native-test/app/auth/session.js');
const {
  createAppQueryClient,
} = require('../node_modules/.cache/native-test/app/query/client.js');
const queryClients = new Set();

function deferred() {
  return Promise.withResolvers();
}

function apiError(status, code) {
  return Object.assign(new Error('测试 API 错误'), {
    kind: 'api',
    status,
    code,
    requestId: 'test-request-id',
  });
}

function tokens(accessToken = 'access-old', refreshToken = 'refresh-old') {
  return { accessToken, refreshToken };
}

function createHarness({ scope: suppliedScope, client: clientOverrides = {}, secureStore: storeOverrides = {} } = {}) {
  const scope = suppliedScope ?? createAuthScope('https://service.example', 'android-cn');
  const entries = new Map();
  const operations = { reads: 0, writes: 0, deletes: 0 };
  const faults = { read: false, write: false, delete: false };
  const secureStore = {
    async getItemAsync(key) {
      operations.reads += 1;
      if (faults.read) throw new Error('secure storage read failed');
      return entries.get(key) ?? null;
    },
    async setItemAsync(key, value) {
      operations.writes += 1;
      if (faults.write) throw new Error('secure storage write failed');
      entries.set(key, value);
    },
    async deleteItemAsync(key) {
      operations.deletes += 1;
      if (faults.delete) throw new Error('secure storage delete failed');
      entries.delete(key);
    },
    ...storeOverrides,
  };
  const credentials = createSecureCredentialStore(scope, secureStore);
  const account = { userId: 17, username: 'test-user' };
  const client = {
    auth: {
      async register() {
        return account;
      },
      async login() {
        return tokens('access-login', 'refresh-login');
      },
      async refresh() {
        return tokens('access-new', 'refresh-new');
      },
      async logout() {
        return null;
      },
      ...clientOverrides.auth,
    },
    users: {
      async getMe() {
        return account;
      },
      async getProfile() {
        return { name: '现有资料', heightCm: '170.00' };
      },
      async updateProfile(profile) {
        return { name: '更新后资料', ...profile, heightCm: '170.00' };
      },
      ...clientOverrides.users,
    },
    models: {
      async list() {
        return { items: [], total: 0, offset: 0, limit: 20 };
      },
      ...clientOverrides.models,
    },
    tasks: {
      async list() {
        return { items: [], total: 0, offset: 0, limit: 20 };
      },
      async getById(taskId) {
        return { taskId, status: 'DRAFT' };
      },
      ...clientOverrides.tasks,
    },
  };
  const accessTokenSource = { current: null };
  const queryClient = createAppQueryClient();
  queryClients.add(queryClient);
  const auth = createAuthSessionManager({
    client,
    scope,
    credentials,
    queryClient,
    accessTokenSource,
  });

  return { scope, entries, operations, faults, secureStore, credentials, client, accessTokenSource, queryClient, auth };
}

/** 清理测试创建的查询客户端及其回收定时器。 */
function clearHarnessQueryClients() {
  for (const queryClient of queryClients) queryClient.clear();
  queryClients.clear();
}
async function flushMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

module.exports = { apiError, clearHarnessQueryClients, createHarness, deferred, flushMicrotasks, tokens };
