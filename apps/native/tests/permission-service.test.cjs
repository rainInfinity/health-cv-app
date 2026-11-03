// 验证权限状态来自系统快照，查询不申请授权或启动服务。

const assert = require('node:assert/strict');
const test = require('node:test');

const { createPermissionService } = require('../node_modules/.cache/native-test/app/permissions/permissionServiceCore.js');

function createService(options = {}) {
  const {
    platform = 'android',
    apiLevel = 34,
    camera = true,
    notificationRuntime = true,
    appNotificationsEnabled = true,
    channelState = 'enabled',
    cameraRequestResult = 'granted',
    notificationRequestResult = 'granted',
    failedReads = [],
  } = options;
  const calls = {
    checkCamera: 0,
    requestCamera: 0,
    checkNotificationRuntime: 0,
    requestNotificationRuntime: 0,
    queryNotificationSettings: 0,
    openAppSettings: 0,
  };
  const service = createPermissionService({
    platform,
    apiLevel,
    async checkCamera() {
      calls.checkCamera += 1;
      if (failedReads.includes('checkCamera')) throw new Error('system query failed');
      return camera;
    },
    async requestCamera() { calls.requestCamera += 1; return cameraRequestResult; },
    async checkNotificationRuntime() {
      calls.checkNotificationRuntime += 1;
      if (failedReads.includes('checkNotificationRuntime')) throw new Error('system query failed');
      return notificationRuntime;
    },
    async requestNotificationRuntime() {
      calls.requestNotificationRuntime += 1;
      return notificationRequestResult;
    },
    async queryNotificationSettings() {
      calls.queryNotificationSettings += 1;
      if (failedReads.includes('queryNotificationSettings')) throw new Error('system query failed');
      return { appNotificationsEnabled, channelState };
    },
    async openAppSettings() { calls.openAppSettings += 1; },
  });
  return { service, calls };
}

test('Android 13 以上映射运行时授权、应用通知和未创建渠道', async () => {
  const { service, calls } = createService({
    camera: false,
    appNotificationsEnabled: false,
    channelState: 'missing',
  });

  assert.deepEqual(await service.getSnapshot(), {
    apiLevel: 34,
    camera: 'denied',
    notificationRuntime: 'granted',
    notificationApp: 'denied',
    notificationChannel: 'not-created',
  });
  assert.deepEqual(calls, {
    checkCamera: 1,
    requestCamera: 0,
    checkNotificationRuntime: 1,
    requestNotificationRuntime: 0,
    queryNotificationSettings: 1,
    openAppSettings: 0,
  });
});

test('查询失败显示未知，Android 12 及更早不查询通知运行时授权', async () => {
  const { service, calls } = createService({
    apiLevel: 32,
    failedReads: ['checkCamera'],
    channelState: 'disabled',
  });

  assert.deepEqual(await service.getSnapshot(), {
    apiLevel: 32,
    camera: 'unknown',
    notificationRuntime: 'not-required',
    notificationApp: 'granted',
    notificationChannel: 'denied',
  });
  assert.equal(calls.checkNotificationRuntime, 0);
  assert.equal(calls.requestCamera, 0);
  assert.equal(calls.requestNotificationRuntime, 0);

  const preChannel = createService({ apiLevel: 25 });
  assert.equal((await preChannel.service.getSnapshot()).notificationChannel, 'not-required');

  const notificationFailure = createService({ failedReads: ['queryNotificationSettings'] });
  const unknownSettings = await notificationFailure.service.getSnapshot();
  assert.equal(unknownSettings.notificationApp, 'unknown');
  assert.equal(unknownSettings.notificationChannel, 'unknown');
});

test('请求方法只在显式调用时触达对应权限 API', async () => {
  const { service, calls } = createService({
    cameraRequestResult: 'blocked',
    notificationRequestResult: 'denied',
  });

  await service.getSnapshot();
  assert.equal(calls.requestCamera, 0);
  assert.equal(calls.requestNotificationRuntime, 0);
  assert.equal(await service.requestCamera(), 'blocked');
  assert.equal(await service.requestNotifications(), 'denied');
  assert.equal(calls.requestCamera, 1);
  assert.equal(calls.requestNotificationRuntime, 1);

  const preAndroid13 = createService({ apiLevel: 32 });
  assert.equal(await preAndroid13.service.requestNotifications(), 'not-required');
  assert.equal(preAndroid13.calls.requestNotificationRuntime, 0);
});

test('非 Android 平台不读取或请求 Android 权限', async () => {
  const { service, calls } = createService({ platform: 'ios' });
  assert.deepEqual(await service.getSnapshot(), {
    apiLevel: null,
    camera: 'unknown',
    notificationRuntime: 'unknown',
    notificationApp: 'unknown',
    notificationChannel: 'unknown',
  });
  assert.equal(await service.requestCamera(), 'unknown');
  assert.equal(await service.requestNotifications(), 'unknown');
  assert.equal(calls.checkCamera, 0);
  assert.equal(calls.requestCamera, 0);
  assert.equal(calls.checkNotificationRuntime, 0);
  assert.equal(calls.requestNotificationRuntime, 0);
  assert.equal(calls.queryNotificationSettings, 0);
});
