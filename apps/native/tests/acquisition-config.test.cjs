// 验证主动相机配置在触达原生资源前按模式和设备能力失败。

const assert = require('node:assert/strict');
const test = require('node:test');

const validator = import('../../../packages/acquisition/src/ppg/CameraConfigValidator.ts');

function fixture() {
  const config = {
    cameraId: 'logical-camera-1',
    targetResolution: { width: 720, height: 720 },
    targetFps: 30,
    torchEnabled: false,
    exposure: {
      mode: 'auto',
      compensationIndex: 0,
      timeNanos: null,
      iso: null,
      locked: false,
    },
    whiteBalance: { mode: 'auto', locked: false },
    focus: { mode: 'auto', distanceDiopters: null },
    processing: { blocks: [2, 3] },
  };
  const supportedNumeric = (minimum, maximum, step = null) => ({
    status: 'supported',
    range: { minimum, maximum, step },
    reason: null,
  });
  const capabilities = {
    cameraId: 'logical-camera-1',
    exposureModes: {
      status: 'supported', modes: ['auto', 'manual'], unknownModes: [], reason: null,
    },
    exposureTimeNanos: supportedNumeric(1_000_000, 100_000_000),
    iso: supportedNumeric(50, 3_200),
    exposureCompensationIndex: supportedNumeric(-6, 6, { numerator: 1, denominator: 3 }),
    whiteBalanceModes: {
      status: 'supported',
      modes: ['auto', 'off', 'daylight'],
      reason: null,
      unknownModes: [],
    },
    focusModes: {
      status: 'supported', modes: ['auto', 'off', 'manual'], unknownModes: [], reason: null,
    },
    focusDistanceDiopters: supportedNumeric(0, 10),
    torch: { status: 'supported', value: true, reason: null },
    aeLock: { status: 'supported', value: true, reason: null },
    awbLock: { status: 'supported', value: true, reason: null },
  };
  const captureOptions = {
    cameraId: 'logical-camera-1',
    options: [],
    processing: { maxBlockCount: 6, maxRows: 2, maxColumns: 3 },
  };
  return { config, capabilities, captureOptions };
}

function expectCode(validateCameraConfig, CameraConfigValidationError, fixtureValue, code) {
  assert.throws(
    () => validateCameraConfig(
      fixtureValue.config,
      {
        capabilities: fixtureValue.capabilities,
        captureOptions: fixtureValue.captureOptions,
      },
    ),
    (error) => error instanceof CameraConfigValidationError && error.code === code,
  );
}

test('接受设备范围内的自动补偿和手动曝光配置', async () => {
  const { validateCameraConfig } = await validator;
  const automatic = fixture();
  automatic.config.exposure.compensationIndex = 3;
  assert.doesNotThrow(() => validateCameraConfig(automatic.config, {
    capabilities: automatic.capabilities,
    captureOptions: automatic.captureOptions,
  }));

  const manual = fixture();
  manual.config.exposure = {
    mode: 'manual',
    compensationIndex: null,
    timeNanos: 15_000_000,
    iso: 200,
    locked: false,
  };
  assert.doesNotThrow(() => validateCameraConfig(manual.config, {
    capabilities: manual.capabilities,
    captureOptions: manual.captureOptions,
  }));
});

test('非法数值、模式组合与分块网格均以 INVALID_CAMERA_CONFIG 拒绝', async () => {
  const { validateCameraConfig, CameraConfigValidationError } = await validator;
  const invalidConfigs = [
    (value) => { value.config.exposure.timeNanos = 15_000_000.5; },
    (value) => { value.config.exposure.timeNanos = Number.POSITIVE_INFINITY; },
    (value) => { value.config.exposure.compensationIndex = 1.5; },
    (value) => {
      value.config.exposure = {
        mode: 'manual',
        compensationIndex: null,
        timeNanos: 15_000_000.5,
        iso: 100,
        locked: false,
      };
    },
    (value) => {
      value.config.exposure = {
        mode: 'manual',
        compensationIndex: null,
        timeNanos: 15_000_000,
        iso: 100.5,
        locked: false,
      };
    },
    (value) => {
      value.config.exposure = {
        mode: 'manual',
        compensationIndex: null,
        timeNanos: 9_007_199_254_740_992,
        iso: 100,
        locked: false,
      };
    },
    (value) => {
      value.config.exposure = {
        mode: 'auto', compensationIndex: 0, timeNanos: 15_000_000, iso: 100, locked: false,
      };
    },
    (value) => {
      value.config.exposure = {
        mode: 'manual', compensationIndex: null, timeNanos: 15_000_000, iso: 100, locked: true,
      };
    },
    (value) => { value.config.whiteBalance = { mode: 'daylight', locked: true }; },
    (value) => { value.config.processing.blocks = [2]; },
    (value) => { value.config.processing.blocks = [2, 4]; },
    (value) => { value.config.targetResolution.width = 720.5; },
  ];
  for (const mutate of invalidConfigs) {
    const value = fixture();
    mutate(value);
    expectCode(validateCameraConfig, CameraConfigValidationError, value, 'INVALID_CAMERA_CONFIG');
  }
});

test('区分明确不支持、能力未知及设备范围越界', async () => {
  const { validateCameraConfig, CameraConfigValidationError } = await validator;

  const unsupported = fixture();
  unsupported.config.torchEnabled = true;
  unsupported.capabilities.torch = { status: 'unsupported', value: false, reason: null };
  expectCode(
    validateCameraConfig,
    CameraConfigValidationError,
    unsupported,
    'CAMERA_PARAMETER_UNSUPPORTED',
  );

  const unknown = fixture();
  unknown.config.exposure = {
    mode: 'manual', compensationIndex: null, timeNanos: 15_000_000, iso: 200, locked: false,
  };
  unknown.capabilities.iso = { status: 'unknown', range: null, reason: null };
  expectCode(
    validateCameraConfig,
    CameraConfigValidationError,
    unknown,
    'CAMERA_CAPABILITY_UNAVAILABLE',
  );
  const unknownMode = fixture();
  unknownMode.config.exposure = {
    mode: 'manual', compensationIndex: null, timeNanos: 15_000_000, iso: 200, locked: false,
  };
  unknownMode.capabilities.exposureModes = {
    status: 'supported', modes: ['auto'], unknownModes: ['manual'], reason: null,
  };
  expectCode(
    validateCameraConfig,
    CameraConfigValidationError,
    unknownMode,
    'CAMERA_CAPABILITY_UNAVAILABLE',
  );

  const unsupportedMode = fixture();
  unsupportedMode.config.exposure = {
    mode: 'manual', compensationIndex: null, timeNanos: 15_000_000, iso: 200, locked: false,
  };
  unsupportedMode.capabilities.exposureModes = {
    status: 'supported', modes: ['auto'], unknownModes: [], reason: null,
  };
  expectCode(
    validateCameraConfig,
    CameraConfigValidationError,
    unsupportedMode,
    'CAMERA_PARAMETER_UNSUPPORTED',
  );

  const outOfRange = fixture();
  outOfRange.config.exposure.compensationIndex = 7;
  expectCode(
    validateCameraConfig,
    CameraConfigValidationError,
    outOfRange,
    'INVALID_CAMERA_CONFIG',
  );

  const outOfRangeIso = fixture();
  outOfRangeIso.config.exposure = {
    mode: 'manual',
    compensationIndex: null,
    timeNanos: 15_000_000,
    iso: 3_300,
    locked: false,
  };
  expectCode(
    validateCameraConfig,
    CameraConfigValidationError,
    outOfRangeIso,
    'INVALID_CAMERA_CONFIG',
  );

  const missingQuery = fixture();
  missingQuery.captureOptions = null;
  expectCode(
    validateCameraConfig,
    CameraConfigValidationError,
    missingQuery,
    'CAMERA_CAPABILITY_UNAVAILABLE',
  );
});
