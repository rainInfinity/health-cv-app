/** 验证资料局部更新的缺席、清空和三态病史语义，不依赖浏览器状态。 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { initialProfile, createProfilePatch, applyProfilePatch } from './profile.js';

/** 生成与浏览器提交相同的字段集合。 */
function form(values) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

test('仅编辑姓名时不覆盖未提交的资料和病史', () => {
  const original = { ...initialProfile(), heightCm: '172.50', birthDate: '1990-05-12', historyJson: { isHypertensive: true } };
  const patch = createProfilePatch(form({ name: '新称呼' }), original);
  assert.deepEqual(patch, { name: '新称呼' });
  const updated = applyProfilePatch(original, patch);
  assert.equal(updated.heightCm, '172.50');
  assert.equal(updated.birthDate, '1990-05-12');
  assert.deepEqual(updated.historyJson, { isHypertensive: true });
  assert.equal(original.name, '小安');
});

test('明确无病史必须保存 false，而不是缺席或 true', () => {
  const original = { ...initialProfile(), historyJson: { isHypertensive: true, isDiabetic: false } };
  const patch = createProfilePatch(form({ isHypertensive: 'false', isDiabetic: 'true' }), original);
  assert.deepEqual(patch, { historyJson: { isHypertensive: false, isDiabetic: true } });
  assert.deepEqual(applyProfilePatch(original, patch).historyJson, { isHypertensive: false, isDiabetic: true });
});

test('改为不清楚只删除对应回答，保留另一回答和已有扩展内容', () => {
  const original = { ...initialProfile(), historyJson: { isHypertensive: true, isDiabetic: false, previousNote: '保留已有扩展' } };
  const patch = createProfilePatch(form({ isHypertensive: 'unknown' }), original);
  assert.deepEqual(patch, { historyJson: { isHypertensive: null } });
  const updated = applyProfilePatch(original, patch);
  assert.deepEqual(updated.historyJson, { isDiabetic: false, previousNote: '保留已有扩展' });
  assert.equal(original.historyJson.isHypertensive, true);
});

test('主动清空可空字段用 null，性别恢复未知用 0，缺席体重保持不变', () => {
  const original = { ...initialProfile(), gender: 2, birthDate: '1990-05-12', heightCm: '168.2', weightKg: '60', medicalHistory: '高血糖，尚未确诊' };
  const patch = createProfilePatch(form({ name: '', gender: '0', birthDate: '', heightCm: '', medicalHistory: '' }), original);
  assert.deepEqual(patch, { name: null, gender: 0, birthDate: null, heightCm: null, medicalHistory: null });
  assert.equal(applyProfilePatch(original, patch).weightKg, '60');
});

test('未填写病史和可空资料不产生否定回答或无意义清空', () => {
  const original = initialProfile();
  const patch = createProfilePatch(form({ name: '小安', gender: '0', birthDate: '', heightCm: '', weightKg: '', medicalHistory: '', isDiabetic: 'unknown' }), original);
  assert.deepEqual(patch, {});
  assert.deepEqual(applyProfilePatch(original, patch).historyJson, {});
});

test('数字格式变化不覆盖已有值，真正的数值修改仍提交', () => {
  const original = { ...initialProfile(), heightCm: '172.50', weightKg: '65.20' };
  const patch = createProfilePatch(form({ heightCm: '172.5', weightKg: '66.25' }), original);
  assert.deepEqual(patch, { weightKg: '66.25' });
  const updated = applyProfilePatch(original, patch);
  assert.equal(updated.heightCm, '172.50');
  assert.equal(updated.weightKg, '66.25');
});
