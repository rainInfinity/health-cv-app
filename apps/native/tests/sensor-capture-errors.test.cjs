// 验证未知传感器错误码不会变成可见的底层消息。

const assert = require('node:assert/strict');
const test = require('node:test');

const errorLocalization = import('../src/features/sensors/sensorErrorLocalization.ts');

test('未知错误码只显示安全通用提示，已知错误码使用本地化类别', async () => {
  const { localizeSensorCaptureError } = await errorLocalization;
  const messages = {
    errorGeneric: '传感器操作失败。',
    errorBusy: '此传感器仍在采集。',
    errorInvalidConfig: '采样间隔超出范围。',
  };

  assert.equal(
    localizeSensorCaptureError('UNMAPPED_SENSOR_FAILURE', messages),
    messages.errorGeneric,
  );
  assert.equal(localizeSensorCaptureError('SENSOR_BUSY', messages), messages.errorBusy);
  assert.equal(localizeSensorCaptureError('INVALID_SENSOR_CONFIG', messages), messages.errorInvalidConfig);
});
