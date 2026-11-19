// 验证真实准备偏好在跨目标、重建 Store、退出账号及损坏存储下的行为。

const assert = require('node:assert/strict');
const { afterEach, beforeEach, test } = require('node:test');
const { createPersistentStorageEngine } = require('../node_modules/.cache/native-test/app/storage/persistentEngine.js');
const { createChestPlacementGuidePreference, createMeasurementGuidePreferences } = require('../node_modules/.cache/native-test/app/preferences/measurementGuide.js');
const { FEATURE_ENTRIES, METHOD_ENTRIES, resolveMeasurementEntry } = require('../node_modules/.cache/native-test/app/measurement/entry.js');
const { clearHarnessQueryClients, createHarness } = require('./helpers.cjs');

let values;
let persistentAtom;

beforeEach(async () => {
  values = new Map();
  const persistent = await import('@nanostores/persistent');
  persistentAtom = persistent.persistentAtom;
  persistent.setPersistentEngine(createPersistentStorageEngine({
    getString: (key) => values.get(key),
    set: (key, value) => { values.set(key, value); },
    remove: (key) => values.delete(key),
    contains: (key) => values.has(key),
    getAllKeys: () => [...values.keys()],
  }), { addEventListener() {}, removeEventListener() {} });
});
afterEach(clearHarnessQueryClients);

test('从一个指尖指标保存偏好，其他指尖指标与部位入口共用，其他方式隔离', () => {
  const preference = createMeasurementGuidePreferences();
  preference[FEATURE_ENTRIES.fingertip.method].set(true);

  const restored = createMeasurementGuidePreferences();
  assert.equal(restored[FEATURE_ENTRIES.oxygen.method].get(), true);
  assert.equal(restored[FEATURE_ENTRIES.risk.method].get(), true);
  assert.equal(restored[METHOD_ENTRIES.fingertip.method].get(), true);
  assert.equal(restored[FEATURE_ENTRIES.face.method].get(), false);
  assert.equal(restored[FEATURE_ENTRIES.pressure.method].get(), false);

  restored.chest.set(true);
  const next = createMeasurementGuidePreferences();
  assert.equal(next.chest.get(), true);
  assert.equal(next.face.get(), false);
  assert.equal(next.fingertip.get(), true);
  next.fingertip.set(false);
  assert.equal(createMeasurementGuidePreferences().fingertip.get(), false);
});

test('持久跳过偏好让面部、指尖和血压入口直达各自检测页，不经过引导', () => {
  const preference = createMeasurementGuidePreferences();
  preference.face.set(true);
  preference.fingertip.set(true);
  preference.chest.set(true);
  const restored = createMeasurementGuidePreferences();
  for (const entry of [...Object.values(METHOD_ENTRIES), ...Object.values(FEATURE_ENTRIES)]) {
    const route = resolveMeasurementEntry(entry, restored[entry.method].get());
    assert.deepEqual(route, [
      entry.method === 'face' ? 'FaceMeasurement' : entry.method === 'fingertip' ? 'FingertipMeasurement' : 'BloodPressureMeasurement',
      { target: entry.target },
    ]);
  }
  restored.fingertip.set(false);
  assert.deepEqual(resolveMeasurementEntry(FEATURE_ENTRIES.oxygen, restored.fingertip.get()), [
    'MeasurementGuide', FEATURE_ENTRIES.oxygen,
  ]);
});

test('血压部位与指标共用胸口偏好，未跳过进入准备，重建后直接到同一血压页', () => {
  const preference = createMeasurementGuidePreferences();
  for (const entry of [METHOD_ENTRIES.chest, FEATURE_ENTRIES.pressure]) {
    assert.deepEqual(resolveMeasurementEntry(entry, preference.chest.get()), ['MeasurementGuide', entry]);
  }
  preference.chest.set(true);
  const restored = createMeasurementGuidePreferences();
  for (const entry of [METHOD_ENTRIES.chest, FEATURE_ENTRIES.pressure]) {
    assert.deepEqual(resolveMeasurementEntry(entry, restored.chest.get()), ['BloodPressureMeasurement', { target: 'bloodPressure' }]);
  }
  assert.equal(restored.face.get(), false);
  assert.equal(restored.fingertip.get(), false);
});

test('缺失或非法持久值不跳过，合法方式不受损坏邻项影响', () => {
  assert.equal(createMeasurementGuidePreferences().face.get(), false);
  createMeasurementGuidePreferences().face.set(true);
  createMeasurementGuidePreferences().fingertip.set(true);
  const fingertipKey = [...values.keys()].find((key) => key.includes('.fingertip.'));
  for (const invalid of ['TRUE', '1', 'yes', '{}', 'null', '']) {
    values.set(fingertipKey, invalid);
    const restored = createMeasurementGuidePreferences();
    assert.equal(restored.fingertip.get(), false);
    assert.equal(restored.face.get(), true);
    assert.equal(restored.chest.get(), false);
  }
});

test('真实认证退出不清除设备准备偏好，也不改变语言和首次引导', async () => {
  const language = persistentAtom('app.language-preference', 'zh-CN', { listen: false });
  const onboarding = persistentAtom('app.onboarding-completed', 'false', { listen: false });
  language.set('en-US');
  onboarding.set('true');
  const preference = createMeasurementGuidePreferences();
  preference.face.set(true);
  preference.fingertip.set(true);

  createChestPlacementGuidePreference().set(true);
  const harness = createHarness();
  await harness.auth.restore();
  await harness.auth.signIn({ username: 'test-user', password: 'private-password' });
  await harness.auth.signOut();

  assert.deepEqual(harness.auth.state.get(), { status: 'anonymous' });
  assert.equal(await harness.credentials.read(), null);
  const restored = createMeasurementGuidePreferences();
  assert.equal(restored.face.get(), true);
  assert.equal(restored.fingertip.get(), true);
  assert.equal(restored.chest.get(), false);
  assert.equal(createChestPlacementGuidePreference().get(), true);
  assert.equal(language.get(), 'en-US');
  assert.equal(onboarding.get(), 'true');
});

test('贴胸操作提示独立于检测准备，确认保存后重建仍不再提示', () => {
  const preparation = createMeasurementGuidePreferences();
  const guide = createChestPlacementGuidePreference();
  assert.equal(guide.get(), false);
  preparation.chest.set(true);
  assert.equal(guide.get(), false);
  guide.set(true);
  assert.equal(createChestPlacementGuidePreference().get(), true);
  preparation.chest.set(false);
  assert.equal(createChestPlacementGuidePreference().get(), true);
  assert.equal(preparation.face.get(), false);
  assert.equal(preparation.fingertip.get(), false);
});

test('贴胸提示偏好缺失或非法时仍展示，不影响原有准备偏好', () => {
  values.set('app.measurement-guide.chest.skipped', 'true');
  values.set('app.measurement-guide.chest-placement.skipped', 'invalid');
  assert.equal(createChestPlacementGuidePreference().get(), false);
  assert.equal(createMeasurementGuidePreferences().chest.get(), true);
});
