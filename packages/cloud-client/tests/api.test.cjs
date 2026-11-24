const assert = require('node:assert/strict');
const { createServer } = require('node:http');
const { test } = require('node:test');
const axios = require('axios');
const {
  CloudClientError,
  createCloudClient,
} = require('../node_modules/.cache/cloud-client-test/index.js');

axios.defaults.adapter = 'fetch';

/** 启动只监听回环地址的本地 API 测试服务。 */
async function startServer(handler) {
  const server = createServer(handler);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');

  return {
    server,
    baseUrl: `http://127.0.0.1:${address.port}`,
  };
}

/** 关闭测试服务并主动释放仍保持打开的本地连接。 */
function closeServer(server) {
  server.closeAllConnections();
  return new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
}

/** 返回符合 API 包装格式的 JSON 正文。 */
function sendJson(response, status, body, headers = {}) {
  response.writeHead(status, { 'content-type': 'application/json', ...headers });
  response.end(JSON.stringify(body));
}

/** 读取测试服务收到的请求正文。 */
async function readRequestBody(request) {
  let body = '';
  for await (const chunk of request) {
    body += chunk;
  }
  return body;
}

test('保留合法的 null 业务数据', async (t) => {
  const { server, baseUrl } = await startServer((request, response) => {
    request.resume();
    assert.equal(request.method, 'POST');
    assert.equal(request.url, '/api/v1/ios-cn/auth/logout');
    assert.equal(request.headers.authorization, undefined);
    sendJson(response, 200, { code: 'OK', message: '', data: null });
  });
  t.after(() => closeServer(server));

  const client = createCloudClient({
    baseUrl,
    channel: 'ios-cn',
    getAccessToken: () => null,
  });

  assert.equal(await client.auth.logout('refresh-token'), null);
});

test('拒绝非 JSON 和缺少业务数据的成功响应', async (t) => {
  let requestCount = 0;
  const { server, baseUrl } = await startServer((request, response) => {
    request.resume();
    requestCount += 1;

    if (requestCount === 1) {
      response.writeHead(200, {
        'content-type': 'text/html',
        'x-request-id': 'html-request-id',
      });
      response.end('<html>gateway failure</html>');
      return;
    }

    response.writeHead(200, {
      'content-type': 'application/json',
      'x-request-id': 'broken-envelope-id',
    });
    response.end(JSON.stringify({ code: 'OK', message: 'missing data' }));
  });
  t.after(() => closeServer(server));

  const client = createCloudClient({
    baseUrl,
    channel: 'ios-cn',
    getAccessToken: () => 'access-token',
  });

  await assert.rejects(() => client.users.getMe(), (error) => {
    assert.ok(error instanceof CloudClientError);
    assert.equal(error.kind, 'protocol');
    assert.equal(error.status, 200);
    assert.equal(error.requestId, 'html-request-id');
    assert.equal(error.message.includes('gateway failure'), false);
    return true;
  });

  await assert.rejects(() => client.users.getMe(), (error) => {
    assert.ok(error instanceof CloudClientError);
    assert.equal(error.kind, 'protocol');
    assert.equal(error.status, 200);
    assert.equal(error.requestId, 'broken-envelope-id');
    return true;
  });
  assert.equal(requestCount, 2);
});

test('保留 HTTP 状态、业务码、请求标识和 Retry-After 且不泄露请求载荷', async (t) => {
  const { server, baseUrl } = await startServer(async (request, response) => {
    const credentials = JSON.parse(await readRequestBody(request));
    const isUnknownCode = credentials.username === 'unknown-code';

    sendJson(
      response,
      isUnknownCode ? 422 : 401,
      {
        code: isUnknownCode ? 'FUTURE_BUSINESS_CODE' : 'INVALID_CREDENTIALS',
        message: 'safe server message',
        data: null,
        ...(isUnknownCode ? {} : { requestId: 'body-request-id' }),
      },
      {
        'x-request-id': 'header-request-id',
        'retry-after': isUnknownCode ? '17' : '11',
      },
    );
  });
  t.after(() => closeServer(server));

  const client = createCloudClient({
    baseUrl,
    channel: 'ios-cn',
    getAccessToken: () => null,
  });

  await assert.rejects(
    () => client.auth.login({ username: 'known-user', password: 'sensitive-password' }),
    (error) => {
      assert.ok(error instanceof CloudClientError);
      assert.equal(error.kind, 'api');
      assert.equal(error.status, 401);
      assert.equal(error.code, 'INVALID_CREDENTIALS');
      assert.equal(error.requestId, 'body-request-id');
      assert.equal(error.retryAfter, '11');
      assert.equal(error.config, undefined);
      assert.equal(error.response, undefined);
      assert.equal(error.cause, undefined);
      assert.equal(Object.values(error).join(' ').includes('sensitive-password'), false);
      return true;
    },
  );

  await assert.rejects(
    () => client.auth.login({ username: 'unknown-code', password: 'sensitive-password' }),
    (error) => {
      assert.ok(error instanceof CloudClientError);
      assert.equal(error.kind, 'api');
      assert.equal(error.status, 422);
      assert.equal(error.code, 'FUTURE_BUSINESS_CODE');
      assert.equal(error.requestId, 'header-request-id');
      assert.equal(error.retryAfter, '17');
      return true;
    },
  );
});

test('资料 PATCH 只发送允许字段并保留 null 与 false', async (t) => {
  let sentBody = '';
  const profile = {
    name: '更新姓名',
    gender: 0,
    birthDate: null,
    heightCm: '168.50',
    weightKg: null,
    medicalHistory: null,
    historyJson: { isDiabetic: false, isHypertensive: null },
  };
  const { server, baseUrl } = await startServer(async (request, response) => {
    assert.equal(request.method, 'PATCH');
    assert.equal(request.url, '/api/v1/ios-cn/users/me/profile');
    sentBody = await readRequestBody(request);
    sendJson(response, 200, { code: 'OK', data: profile });
  });
  t.after(() => closeServer(server));

  const client = createCloudClient({
    baseUrl,
    channel: 'ios-cn',
    getAccessToken: () => 'access-token',
  });

  const result = await client.users.updateProfile({
    name: '更新姓名',
    gender: 0,
    birthDate: null,
    heightCm: '168.50',
    historyJson: {
      isDiabetic: false,
      isHypertensive: null,
      unapproved_key: 'must not be sent',
    },
    userId: 999,
    password: 'must not be sent',
  });

  assert.deepEqual(result, profile);
  assert.deepEqual(JSON.parse(sentBody), {
    name: '更新姓名',
    gender: 0,
    birthDate: null,
    heightCm: '168.50',
    historyJson: { isDiabetic: false, isHypertensive: null },
  });
});

test('资料与失败任务保留原始值、时间、状态和示例标识', async (t) => {
  const profile = {
    name: null,
    gender: 0,
    birthDate: '1994-02-11',
    heightCm: '168.50',
    weightKg: null,
    medicalHistory: null,
    historyJson: { isDiabetic: false, vendor_extension: { source_key: 'unchanged' } },
  };
  const failedTask = {
    taskId: 42,
    modelId: 7,
    modelCode: 'example-model',
    modelName: '示例模型',
    versionId: 3,
    version: '1.0',
    status: 'FAILED',
    isExample: true,
    createdAt: '2026-10-19 08:12:13',
    submittedAt: '2026-10-19 08:13:00',
    startedAt: '2026-10-19 08:13:02',
    finishedAt: '2026-10-19 08:14:20',
    failureCode: 'PROCESSING_FAILED',
    failureMessage: '安全失败摘要',
    qualityFailure: null,
    measurement: null,
  };
  const { server, baseUrl } = await startServer((request, response) => {
    request.resume();
    if (request.url === '/api/v1/ios-cn/users/me/profile') {
      sendJson(response, 200, { code: 'OK', data: profile });
      return;
    }
    if (request.url === '/api/v1/ios-cn/tasks/42') {
      sendJson(response, 200, { code: 'OK', data: failedTask });
      return;
    }
    response.writeHead(404);
    response.end();
  });
  t.after(() => closeServer(server));

  const client = createCloudClient({
    baseUrl,
    channel: 'ios-cn',
    getAccessToken: () => 'access-token',
  });

  const returnedProfile = await client.users.getProfile();
  const returnedTask = await client.tasks.getById(42);

  assert.deepEqual(returnedProfile, profile);
  assert.equal(returnedProfile.heightCm, '168.50');
  assert.deepEqual(returnedProfile.historyJson, {
    isDiabetic: false,
    vendor_extension: { source_key: 'unchanged' },
  });
  assert.deepEqual(returnedTask, failedTask);
  assert.equal(returnedTask.status, 'FAILED');
  assert.equal(returnedTask.isExample, true);
  assert.equal(returnedTask.createdAt, '2026-10-19 08:12:13');
  assert.equal(Object.hasOwn(returnedTask, 'result'), false);
  assert.equal(returnedTask.measurement, null);
});

test('任务详情支持后端质量拒绝判别联合', async (t) => {
  const task = {
    taskId: 42,
    modelId: 7,
    modelCode: 'example-model',
    modelName: '示例模型',
    versionId: 3,
    version: '1.0',
    status: 'FAILED',
    isExample: false,
    createdAt: '2026-10-19 08:12:13',
    submittedAt: '2026-10-19 08:13:00',
    startedAt: '2026-10-19 08:13:02',
    finishedAt: '2026-10-19 08:14:20',
  };
  const qualityFailures = [
    { reason: 'LOW_SCORE', details: { score: 61.25, threshold: 70 } },
    { reason: 'NO_VALID_SIGNAL', details: null },
    null,
  ];
  let nextFailure = 0;
  const { server, baseUrl } = await startServer((request, response) => {
    request.resume();
    if (request.url === '/api/v1/ios-cn/tasks/42') {
      sendJson(response, 200, {
        code: 'OK',
        data: { ...task, qualityFailure: qualityFailures[nextFailure++] },
      });
      return;
    }
    response.writeHead(404);
    response.end();
  });
  t.after(() => closeServer(server));

  const client = createCloudClient({
    baseUrl,
    channel: 'ios-cn',
    getAccessToken: () => 'access-token',
  });

  const lowScore = await client.tasks.getById(42);
  const noValidSignal = await client.tasks.getById(42);
  const ordinaryFailure = await client.tasks.getById(42);

  assert.deepEqual(lowScore.qualityFailure, {
    reason: 'LOW_SCORE',
    details: { score: 61.25, threshold: 70 },
  });
  assert.deepEqual(noValidSignal.qualityFailure, {
    reason: 'NO_VALID_SIGNAL',
    details: null,
  });
  assert.equal(ordinaryFailure.status, 'FAILED');
  assert.equal(ordinaryFailure.qualityFailure, null);
});

test('任务提交独立发送采集属性与元数据并保留无请求体兼容', async (t) => {
  const requests = [];
  const taskSummary = {
    taskId: 42,
    modelId: 7,
    modelCode: 'example-model',
    modelName: '示例模型',
    versionId: 3,
    version: '1.0',
    status: 'SUBMITTED',
    isExample: true,
    createdAt: '2026-10-19 08:12:13',
    submittedAt: '2026-10-19 08:13:00',
    startedAt: null,
    finishedAt: null,
  };
  const { server, baseUrl } = await startServer(async (request, response) => {
    requests.push({
      method: request.method,
      url: request.url,
      body: await readRequestBody(request),
      authorization: request.headers.authorization,
    });
    sendJson(response, 200, { code: 'OK', data: taskSummary });
  });
  t.after(() => closeServer(server));

  const client = createCloudClient({
    baseUrl,
    channel: 'ios-cn',
    getAccessToken: () => 'access-token',
  });
  const metadata = {
    deviceModel: 'Pixel 9',
    custom: { appBuild: 42 },
  };
  const measurement = {
    captureMethod: 'fingertip',
    captureMode: 'active',
    durationMs: 30001,
  };

  const submitted = await client.tasks.submit(42, { measurement, clientMetadata: metadata });
  const legacySubmitted = await client.tasks.submit(42);
  const metadataSubmitted = await client.tasks.submit(42, { clientMetadata: metadata });
  const unknownSubmitted = await client.tasks.submit(42, { measurement: null, clientMetadata: null });

  assert.deepEqual(submitted, taskSummary);
  assert.deepEqual(legacySubmitted, taskSummary);
  assert.deepEqual(metadataSubmitted, taskSummary);
  assert.deepEqual(unknownSubmitted, taskSummary);
  assert.equal(Object.hasOwn(submitted, 'measurement'), false);
  assert.deepEqual(requests, [
    {
      method: 'POST',
      url: '/api/v1/ios-cn/tasks/42/submit',
      authorization: 'Bearer access-token',
      body: JSON.stringify({ measurement, clientMetadata: metadata }),
    },
    {
      method: 'POST',
      url: '/api/v1/ios-cn/tasks/42/submit',
      body: '',
      authorization: 'Bearer access-token',
    },
    {
      method: 'POST',
      url: '/api/v1/ios-cn/tasks/42/submit',
      authorization: 'Bearer access-token',
      body: JSON.stringify({ clientMetadata: metadata }),
    },
    {
      method: 'POST',
      url: '/api/v1/ios-cn/tasks/42/submit',
      authorization: 'Bearer access-token',
      body: JSON.stringify({ measurement: null, clientMetadata: null }),
    },
  ]);
});

test('任务详情保留实际采集属性和原始场景结果', async (t) => {
  const measurement = { captureMethod: 'fingertip_chest', captureMode: 'active', durationMs: 29987 };
  const sceneResult = {
    outcome: 'PARTIAL_SUCCEEDED',
    members: {
      bp: { status: 'SUCCEEDED', result: { sbp: 123.456, dbp: 78.9 } },
      unknown_member: { status: 'FAILED', failureCode: 'FUTURE_FAILURE' },
    },
    output_files: { bp_processed_ppg: 'opaque-file-id' },
  };
  const detail = {
    taskId: 101, modelId: 8, modelCode: 'ppg_acc.active.offline.all', modelName: '联合场景',
    versionId: 12, version: '1.0.0-rc.2', status: 'SUCCEEDED', isExample: false,
    createdAt: '2026-11-22 08:29:00', submittedAt: '2026-11-22 08:30:00',
    startedAt: '2026-11-22 08:30:01', finishedAt: '2026-11-22 08:30:05',
    measurement, result: sceneResult, qualityFailure: null,
    failureCode: null, failureMessage: null,
  };
  const { server, baseUrl } = await startServer((request, response) => {
    request.resume();
    assert.equal(request.method, 'GET');
    assert.equal(request.url, '/api/v1/android-cn/tasks/101');
    assert.equal(request.headers.authorization, 'Bearer access-token');
    sendJson(response, 200, { code: 'OK', data: detail });
  });
  t.after(() => closeServer(server));
  const client = createCloudClient({ baseUrl, channel: 'android-cn', getAccessToken: () => 'access-token' });

  const returned = await client.tasks.getById(101);
  assert.deepEqual(returned, detail);
  assert.deepEqual(returned.measurement, measurement);
  assert.deepEqual(returned.result, sceneResult);
  assert.equal(Object.hasOwn(returned.measurement, 'capturedAt'), false);
});

test('指尖四成员和独立HR及BR原样保留各自状态、质量和处理后文件', async (t) => {
  const values = {
    hr: { hr: 79.25, quality: { score: 88.5, threshold: 70 } },
    br: { br: 15.125, quality: { score: 81.125, threshold: 72 } },
    spo2: { spo2: 98.5, quality: { score: 85, threshold: 70 } },
    diabetes: { prob: .55, risk_level: 0, quality: { score: 84, threshold: 70 } },
  };
  const cases = [[], ['hr'], ['br'], ['hr', 'br', 'spo2', 'diabetes']].map((failedKeys) => ({
    modelCode: 'ppg.active.offline.all',
    result: {
      outcome: failedKeys.length === 0 ? 'ALL_SUCCEEDED' : failedKeys.length === 4 ? 'ALL_FAILED' : 'PARTIALLY_SUCCEEDED',
      results: Object.fromEntries(Object.entries(values).map(([key, result]) => [key, {
        algorithmKey: `ppg.active.offline.${key}.v1`,
        status: failedKeys.includes(key) ? 'FAILED' : 'SUCCEEDED',
        result: failedKeys.includes(key) ? null : result,
        failureCode: failedKeys.includes(key) ? 'INFERENCE.QUALITY_REJECTED' : null,
        failureMessage: failedKeys.includes(key) ? '本项信号质量不足' : null,
        qualityFailure: failedKeys.includes(key) ? { reason: 'LOW_SCORE', details: { score: key === 'br' ? 51 : 55, threshold: 75 } } : null,
      }])),
      output_files: { hr_processed_ppg: 'opaque:hr', br_processed_rsp: 'opaque:br' },
    },
  }));
  cases.push(
    { modelCode: 'ppg.active.offline.hr', result: { ...values.hr, output_files: { processed_ppg: 'opaque:timestamp,ppg' } } },
    { modelCode: 'ppg.active.offline.br', result: { ...values.br, output_files: { processed_rsp: 'opaque:timestamp,rsp' } } },
  );
  const details = cases.map((item, index) => ({
    taskId: 101 + index, modelId: 7, modelName: '正式模型', versionId: 12, version: 'catalog-version',
    status: 'SUCCEEDED', isExample: false, createdAt: '2026-11-22 08:29:00',
    submittedAt: '2026-11-22 08:30:00', startedAt: null, finishedAt: null,
    measurement: null, qualityFailure: null, failureCode: null, failureMessage: null, ...item,
  }));
  const { server, baseUrl } = await startServer((request, response) => {
    request.resume();
    assert.equal(request.method, 'GET');
    const detail = details.find((item) => request.url === `/api/v1/android-cn/tasks/${item.taskId}`);
    assert.ok(detail);
    sendJson(response, 200, { code: 'OK', data: detail });
  });
  t.after(() => closeServer(server));
  const client = createCloudClient({ baseUrl, channel: 'android-cn', getAccessToken: () => 'access-token' });
  for (const detail of details) {
    const returned = await client.tasks.getById(detail.taskId);
    assert.deepEqual(returned, detail);
    assert.equal(returned.status, 'SUCCEEDED');
    assert.deepEqual(returned.result, detail.result);
  }
});

test('最新健康结果保留五键 null 并读取当前渠道的实时 Bearer', async (t) => {
  const latest = {
    bloodPressure: null, heartRate: null, respirationRate: null,
    oxygenSaturation: null, diabetesRisk: null,
  };
  const tokens = [];
  let accessToken = 'first-token';
  const { server, baseUrl } = await startServer((request, response) => {
    request.resume();
    assert.equal(request.method, 'GET');
    assert.equal(request.url, '/api/v1/android-cn/measurements/latest');
    tokens.push(request.headers.authorization);
    sendJson(response, 200, { code: 'OK', data: latest });
  });
  t.after(() => closeServer(server));
  const client = createCloudClient({ baseUrl, channel: 'android-cn', getAccessToken: () => accessToken });

  assert.deepEqual(await client.measurements.latest(), latest);
  accessToken = 'second-token';
  assert.deepEqual(await client.measurements.latest(), latest);
  assert.deepEqual(tokens, ['Bearer first-token', 'Bearer second-token']);
});

test('健康查询保留原时间、未知来源、读数、质量、风险及固定场景版本且只取一页', async (t) => {
  const heartRate = {
    recordId: '101:heartRate', taskId: 101, metric: 'heartRate',
    submittedAt: '2026-11-22 08:30:00', captureMethod: 'fingertip', captureMode: 'active',
    durationMs: 30001, readings: [{ code: 'hr', value: 79.123456, unit: 'beats_per_minute' }],
    quality: { score: 88.65866718458382, threshold: 70 }, riskLevel: null,
    modelId: 7, versionId: 12, version: '1.0.0-rc.2', algorithmKey: 'ppg.active.offline.hr.v1',
  };
  const oldHeartRate = {
    ...heartRate, recordId: '99:heartRate', taskId: 99, submittedAt: '2026-11-01 00:00:00',
    captureMethod: null, captureMode: null, durationMs: null, quality: null,
    versionId: 3, version: '0.09.0+legacy',
  };
  const diabetesRisk = {
    ...heartRate, recordId: '101:diabetesRisk', metric: 'diabetesRisk',
    readings: [{ code: 'diabetes_probability', value: 0.123456789, unit: 'ratio' }],
    riskLevel: 2, algorithmKey: 'ppg.active.offline.diabetes.v1',
  };
  const respirationRate = {
    ...heartRate, recordId: '101:respirationRate', metric: 'respirationRate',
    readings: [{ code: 'br', value: 15.125, unit: 'breaths_per_minute' }],
    quality: { score: 81.125, threshold: 72 }, algorithmKey: 'ppg.active.offline.br.v1',
  };
  const bloodPressure = {
    ...heartRate, recordId: '102:bloodPressure', taskId: 102, metric: 'bloodPressure',
    captureMethod: 'fingertip_chest',
    readings: [{ code: 'sbp', value: 123.456, unit: 'mmHg' }, { code: 'dbp', value: 78.9, unit: 'mmHg' }],
    algorithmKey: 'ppg_acc.active.offline.bp.v1',
  };
  const latest = { bloodPressure, heartRate, respirationRate, oxygenSaturation: null, diabetesRisk };
  const page = { items: [heartRate, oldHeartRate], total: 9, offset: 2, limit: 2 };
  const emptyPage = { items: [], total: 9, offset: 99, limit: 20 };
  const requests = [];
  const { server, baseUrl } = await startServer((request, response) => {
    request.resume();
    assert.equal(request.method, 'GET');
    assert.equal(request.headers.authorization, 'Bearer access-token');
    const url = new URL(request.url, 'http://localhost');
    requests.push({ path: url.pathname, params: Object.fromEntries(url.searchParams) });
    const data = url.pathname.endsWith('/latest')
      ? latest
      : url.searchParams.get('offset') === '99' ? emptyPage : page;
    sendJson(response, 200, { code: 'OK', data });
  });
  t.after(() => closeServer(server));
  const client = createCloudClient({ baseUrl, channel: 'android-cn', getAccessToken: () => 'access-token' });
  const query = { metric: 'heartRate', from: '2026-11-01', to: '2026-11-22', offset: 2, limit: 2 };

  const returnedLatest = await client.measurements.latest();
  assert.deepEqual(returnedLatest, latest);
  assert.deepEqual(returnedLatest.heartRate.quality, { score: 88.65866718458382, threshold: 70 });
  assert.deepEqual(returnedLatest.respirationRate.quality, { score: 81.125, threshold: 72 });
  const returnedPage = await client.measurements.list(query);
  assert.deepEqual(returnedPage, page);
  assert.equal(Object.hasOwn(returnedPage.items[1], 'capturedAt'), false);
  assert.deepEqual(await client.measurements.list({ ...query, offset: 99, limit: undefined }), emptyPage);
  assert.deepEqual(requests, [
    { path: '/api/v1/android-cn/measurements/latest', params: {} },
    { path: '/api/v1/android-cn/measurements', params: {
      metric: 'heartRate', from: '2026-11-01', to: '2026-11-22', offset: '2', limit: '2',
    } },
    { path: '/api/v1/android-cn/measurements', params: {
      metric: 'heartRate', from: '2026-11-01', to: '2026-11-22', offset: '99',
    } },
  ]);
});

test('非法健康筛选的 422 保留结构化错误，不修正参数或返回空列表', async (t) => {
  const queries = [
    { metric: 'heartRate', from: '2026-11-23', to: '2026-11-01', offset: 0, limit: 100 },
    { metric: 'unknown', from: '2026-11-01', to: '2026-11-22', offset: 0, limit: 20 },
    { metric: 'heartRate', from: '2026-02-30', to: '2026-11-22', offset: -1, limit: 0 },
  ];
  const requests = [];
  const { server, baseUrl } = await startServer((request, response) => {
    request.resume();
    assert.equal(request.method, 'GET');
    assert.equal(request.headers.authorization, 'Bearer access-token');
    const url = new URL(request.url, 'http://localhost');
    assert.equal(url.pathname, '/api/v1/android-cn/measurements');
    requests.push(Object.fromEntries(url.searchParams));
    sendJson(response, 422, {
      code: 'INVALID_INPUT', message: '筛选参数无效', data: null, requestId: 'invalid-measurements',
    });
  });
  t.after(() => closeServer(server));
  const client = createCloudClient({ baseUrl, channel: 'android-cn', getAccessToken: () => 'access-token' });

  for (const query of queries) {
    await assert.rejects(client.measurements.list(query), (error) => {
      assert.ok(error instanceof CloudClientError);
      assert.equal(error.kind, 'api');
      assert.equal(error.status, 422);
      assert.equal(error.code, 'INVALID_INPUT');
      assert.equal(error.requestId, 'invalid-measurements');
      return true;
    });
  }
  assert.deepEqual(requests, queries.map((query) =>
    Object.fromEntries(Object.entries(query).map(([key, value]) => [key, String(value)])),
  ));
});

test('健康查询鉴权失败不刷新或重发，采集属性提交错误不吞掉', async (t) => {
  const requests = [];
  const { server, baseUrl } = await startServer(async (request, response) => {
    const body = await readRequestBody(request);
    requests.push({ url: request.url, body, authorization: request.headers.authorization });
    const isSubmit = request.method === 'POST';
    sendJson(response, isSubmit ? 422 : 401, {
      code: isSubmit ? 'INVALID_INPUT' : 'INVALID_TOKEN', message: '请求被拒绝', data: null,
    });
  });
  t.after(() => closeServer(server));
  const client = createCloudClient({ baseUrl, channel: 'android-cn', getAccessToken: () => 'expired-token' });

  for (const invoke of [
    () => client.measurements.latest(),
    () => client.measurements.list({ metric: 'heartRate', from: '2026-11-01', to: '2026-11-22' }),
  ]) {
    await assert.rejects(invoke, (error) => {
      assert.ok(error instanceof CloudClientError);
      assert.equal(error.status, 401);
      assert.equal(error.code, 'INVALID_TOKEN');
      return true;
    });
  }
  const measurement = { captureMethod: 'fingertip', captureMode: 'active', durationMs: 1.5 };
  await assert.rejects(client.tasks.submit(101, { measurement }), (error) => {
    assert.ok(error instanceof CloudClientError);
    assert.equal(error.kind, 'api');
    assert.equal(error.status, 422);
    assert.equal(error.code, 'INVALID_INPUT');
    return true;
  });
  assert.equal(requests.length, 3);
  assert.ok(requests.every(({ authorization }) => authorization === 'Bearer expired-token'));
  assert.equal(requests[2].body, JSON.stringify({ measurement }));
});


test('验证模拟 React Native 文件引用上传的 multipart 请求和回执', async (t) => {
  const syntheticFileContent = 'synthetic-rn-file-content';

  const NativeFormData = globalThis.FormData;
  const fileReferences = [];
  const uploads = [];

  globalThis.FormData = class extends NativeFormData {
    append(name, value, filename) {
      if (name === 'file' && typeof value === 'object' && value !== null && 'uri' in value) {
        fileReferences.push(value);
        return super.append(name, new Blob([syntheticFileContent], { type: value.type }), value.name);
      }
      if (filename === undefined) {
        return super.append(name, value);
      }
      return super.append(name, value, filename);
    }
  };

  const { server, baseUrl } = await startServer(async (request, response) => {
    const body = await readRequestBody(request);
    uploads.push({ body, contentType: request.headers['content-type'], authorization: request.headers.authorization });
    sendJson(response, 201, {
      code: 'OK',
      data: {
        fileId: 721,
        logicalName: 'input_image',
        sizeBytes: Buffer.byteLength(syntheticFileContent),
        uploadedAt: '2026-10-19 08:12:13',
        isSelected: true,
      },
    });
  });
  t.after(() => closeServer(server));

  const client = createCloudClient({
    baseUrl,
    channel: 'ios-cn',
    getAccessToken: () => 'access-token',
  });

  try {
    const barePathResult = await client.tasks.uploadFile(42, {
      logicalName: 'input_image',
      file: { uri: '/tmp/synthetic.bin', name: 'synthetic.bin', type: 'application/octet-stream' },
    });
    const fileUriResult = await client.tasks.uploadFile(42, {
      logicalName: 'input_image',
      file: { uri: 'file:///tmp/synthetic.bin', name: 'synthetic.bin', type: 'application/octet-stream' },
    });

    assert.deepEqual(barePathResult, {
      fileId: 721,
      logicalName: 'input_image',
      sizeBytes: Buffer.byteLength(syntheticFileContent),
      uploadedAt: '2026-10-19 08:12:13',
      isSelected: true,
    });
    assert.deepEqual(fileUriResult, barePathResult);
  } finally {
    globalThis.FormData = NativeFormData;
  }

  assert.deepEqual(fileReferences, [
    { uri: 'file:///tmp/synthetic.bin', name: 'synthetic.bin', type: 'application/octet-stream' },
    { uri: 'file:///tmp/synthetic.bin', name: 'synthetic.bin', type: 'application/octet-stream' },
  ]);
  assert.equal(uploads.length, 2);
  for (const upload of uploads) {
    assert.equal(upload.authorization, 'Bearer access-token');
    assert.match(upload.contentType, /^multipart\/form-data;\s*boundary=/);
    const boundary = upload.contentType.match(/boundary=([^;]+)/)[1];
    assert.ok(upload.body.includes(`--${boundary}\r\n`));
    assert.match(upload.body, /Content-Disposition: form-data; name="logicalName"\r\n\r\ninput_image/);
    assert.match(upload.body, /Content-Disposition: form-data; name="file"; filename="synthetic\.bin"/);
    assert.ok(upload.body.includes('synthetic-rn-file-content'));
  }
});

test('输入和输出下载返回 Blob 与响应元数据并编码输出路径段', async (t) => {
  const binaryContent = Buffer.from([0, 1, 2, 127, 255]);
  const requests = [];
  const { server, baseUrl } = await startServer((request, response) => {
    request.resume();
    requests.push({ url: request.url, authorization: request.headers.authorization });
    response.writeHead(200, {
      'content-type': 'application/octet-stream',
      'content-disposition': 'attachment; filename="sample.bin"',
      'content-length': binaryContent.length,
    });
    response.end(binaryContent);
  });
  t.after(() => closeServer(server));

  const client = createCloudClient({
    baseUrl,
    channel: 'ios-cn',
    getAccessToken: () => 'access-token',
  });
  const input = await client.tasks.downloadInput(42, 721);
  const output = await client.tasks.downloadOutput(42, 'ppg/结果.csv');

  assert.deepEqual(
    [...new Uint8Array(await input.body.arrayBuffer())],
    [...binaryContent],
  );
  assert.equal(input.contentType, 'application/octet-stream');
  assert.equal(input.contentDisposition, 'attachment; filename="sample.bin"');
  assert.equal(output.body.size, binaryContent.length);
  assert.equal(requests[0].url, '/api/v1/ios-cn/tasks/42/files/721/download');
  assert.equal(
    requests[1].url,
    '/api/v1/ios-cn/tasks/42/outputs/ppg%2F%E7%BB%93%E6%9E%9C.csv/download',
  );
  assert.deepEqual(requests.map(({ authorization }) => authorization), [
    'Bearer access-token',
    'Bearer access-token',
  ]);
});

test('下载失败的 JSON 正文恢复为结构化 API 错误', async (t) => {
  const { server, baseUrl } = await startServer((request, response) => {
    request.resume();
    sendJson(response, 401, {
      code: 'INVALID_TOKEN',
      message: '令牌无效',
      data: null,
      requestId: 'download-request-id',
    });
  });
  t.after(() => closeServer(server));

  const client = createCloudClient({
    baseUrl,
    channel: 'ios-cn',
    getAccessToken: () => 'expired-token',
  });

  await assert.rejects(
    client.tasks.downloadInput(42, 721),
    (error) => {
      assert.ok(error instanceof CloudClientError);
      assert.equal(error.kind, 'api');
      assert.equal(error.status, 401);
      assert.equal(error.code, 'INVALID_TOKEN');
      assert.equal(error.requestId, 'download-request-id');
      assert.equal('config' in error, false);
      return true;
    },
  );
});

test('下载进度保留未知总量，且取消后不再通知', async (t) => {
  let streamInterval;
  const { server, baseUrl } = await startServer((request, response) => {
    request.resume();
    if (request.url?.includes('/files/2/')) {
      const totalBytes = 2 * 1024 * 1024;
      response.writeHead(200, {
        'content-type': 'application/octet-stream',
        'content-length': totalBytes,
      });
      let sentBytes = 0;
      streamInterval = setInterval(() => {
        const chunk = Buffer.alloc(Math.min(64 * 1024, totalBytes - sentBytes), 0x5a);
        sentBytes += chunk.length;
        response.write(chunk);
        if (sentBytes === totalBytes) {
          clearInterval(streamInterval);
          response.end();
        }
      }, 10);
      response.on('close', () => clearInterval(streamInterval));
      return;
    }

    response.writeHead(200, { 'content-type': 'application/octet-stream' });
    response.write(Buffer.alloc(4096, 0x31));
    setTimeout(() => response.end(Buffer.alloc(4096, 0x32)), 20);
  });
  t.after(() => {
    clearInterval(streamInterval);
    return closeServer(server);
  });

  const client = createCloudClient({
    baseUrl,
    channel: 'ios-cn',
    getAccessToken: () => 'access-token',
  });
  const unknownTotalProgress = [];
  const unknownTotal = await client.tasks.downloadInput(42, 1, {
    onProgress: (progress) => unknownTotalProgress.push(progress),
  });

  assert.equal(unknownTotal.body.size, 8192);
  assert.ok(unknownTotalProgress.length > 0);
  assert.ok(unknownTotalProgress.every((progress) => progress.totalBytes === undefined));
  assert.ok(unknownTotalProgress.every((progress) => progress.loadedBytes > 0));

  const controller = new AbortController();
  const cancelledProgress = [];
  const cancelledDownload = client.tasks.downloadInput(42, 2, {
    signal: controller.signal,
    onProgress: (progress) => {
      cancelledProgress.push(progress);
      if (cancelledProgress.length === 1) {
        controller.abort();
      }
    },
  });

  await assert.rejects(cancelledDownload, (error) => {
    assert.ok(error instanceof CloudClientError);
    assert.equal(error.kind, 'cancelled');
    return true;
  });
  const progressCountAtCancellation = cancelledProgress.length;
  const wait = Promise.withResolvers();
  setTimeout(wait.resolve, 50);
  await wait.promise;
  assert.equal(cancelledProgress.length, progressCountAtCancellation);
});

test('上传传输达到总量后仍等待服务器结果', async (t) => {
  const previousAdapter = axios.defaults.adapter;
  const NativeFormData = globalThis.FormData;
  const fileContent = Buffer.alloc(512 * 1024, 0x41);
  axios.defaults.adapter = 'http';
  globalThis.FormData = class extends NativeFormData {
    append(name, value, filename) {
      if (name === 'file' && typeof value === 'object' && value !== null && 'uri' in value) {
        return super.append(name, new Blob([fileContent], { type: value.type }), value.name);
      }
      return filename === undefined
        ? super.append(name, value)
        : super.append(name, value, filename);
    }
  };
  t.after(() => {
    axios.defaults.adapter = previousAdapter;
    globalThis.FormData = NativeFormData;
  });

  const { server, baseUrl } = await startServer(async (request, response) => {
    await readRequestBody(request);
    sendJson(response, 422, {
      code: 'INVALID_INPUT',
      message: '文件格式无效',
      data: null,
      requestId: 'upload-rejected-id',
    });
  });
  t.after(() => closeServer(server));

  const client = createCloudClient({
    baseUrl,
    channel: 'ios-cn',
    getAccessToken: () => 'access-token',
  });
  const progress = [];

  await assert.rejects(
    client.tasks.uploadFile(42, {
      logicalName: 'ppg',
      file: {
        uri: '/tmp/synthetic.csv',
        name: 'synthetic.csv',
        type: 'text/csv',
      },
    }, {
      onProgress: (event) => progress.push(event),
    }),
    (error) => {
      assert.ok(error instanceof CloudClientError);
      assert.equal(error.kind, 'api');
      assert.equal(error.status, 422);
      assert.equal(error.code, 'INVALID_INPUT');
      return true;
    },
  );

  assert.ok(progress.some((event) =>
    typeof event.totalBytes === 'number' && event.loadedBytes >= event.totalBytes,
  ));
});
