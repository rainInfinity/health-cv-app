/** 复用健康资料表单并按 ProfilePatchRequest 的局部更新语义维护离线状态。 */
import { escapeHtml } from './ui.js';

/** 初始资料仅为本地示例；未知病史不预填为明确否。 */
export function initialProfile() {
  return {
    /** 姓名或称呼；null 表示未填写。 */
    name: '小安',
    /** 0 未知、1 男、2 女。 */
    gender: 0,
    /** YYYY-MM-DD 日期，null 表示未填写。 */
    birthDate: null,
    /** cm，保存十进制字符串或 null。 */
    heightCm: null,
    /** kg，保存十进制字符串或 null。 */
    weightKg: null,
    /** 用户自述的其他病史；null 表示未填写。 */
    medicalHistory: null,
    /** 仅以 true／false 记录明确回答，未知时不保留对应键。 */
    historyJson: {},
  };
}

/** 生成可空文本或数字字段，所有用户内容先转义。 */
function field(label, name, value, attributes = '', wide = false) {
  return `<label class="health-field${wide ? ' health-field-wide' : ''}"><span>${label}</span><input name="${name}" value="${escapeHtml(value ?? '')}" ${attributes}></label>`;
}

/** 病史按三态回答，缺席时不选中任何项；不清楚保存后按未填写展示。 */
function historyField(label, key, profile) {
  const value = profile.historyJson?.[key];
  return `<fieldset class="health-history-field"><legend>${label}</legend><div class="health-choices">${[
    ['true', '有', value === true],
    ['false', '无', value === false],
    ['unknown', '不清楚', false],
  ].map(([answer, text, selected]) => `<label><input type="radio" name="${key}" value="${answer}" ${selected ? 'checked' : ''}><span>${text}</span></label>`).join('')}</div></fieldset>`;
}

/** 个人资料统一编辑基本信息与健康病史。 */
export function profileFields(profile) {
  const name = field('姓名／称呼', 'name', profile.name, 'type="text" maxlength="50" autocomplete="name" placeholder="选填"', true);
  return `<section class="health-section"><h2>基本资料<span>选填</span></h2><div class="health-fields">
${name}
<label class="health-field"><span>性别</span><select name="gender"><option value="0" ${profile.gender === 0 ? 'selected' : ''}>未知／未填写</option><option value="1" ${profile.gender === 1 ? 'selected' : ''}>男</option><option value="2" ${profile.gender === 2 ? 'selected' : ''}>女</option></select></label>
${field('出生日期', 'birthDate', profile.birthDate, 'type="date" autocomplete="bday"')}
${field('身高（cm）', 'heightCm', profile.heightCm, 'type="number" inputmode="decimal" min="0.01" max="999.99" step="0.01" placeholder="选填"')}
${field('体重（kg）', 'weightKg', profile.weightKg, 'type="number" inputmode="decimal" min="0.01" max="9999.99" step="0.01" placeholder="选填"')}
</div></section>
<section class="health-section"><h2>病史信息<span>选填</span></h2>
<p class="health-helper">请按本人情况填写，不确定可以留空；“不清楚”按未填写保存，不记作“无”。</p>
${historyField('高血压病史', 'isHypertensive', profile)}
${historyField('糖尿病病史', 'isDiabetic', profile)}
<label class="health-field health-other-history"><span>其他病史</span><textarea name="medicalHistory" rows="3" placeholder="选填，如尚未确诊的高血糖或其他需要说明的情况">${escapeHtml(profile.medicalHistory ?? '')}</textarea></label>
<p class="health-helper">高血糖不等于糖尿病；这些信息不会用于生成诊断或风险结论。</p>
</section>`;
}

/** 数值字段按十进制数值比较，避免格式差异覆盖未修改的值。 */
function normalizeField(key, value) {
  if (key === 'gender') return Number(value);
  const text = String(value ?? '').trim();
  if (!text) return null;
  return key === 'heightCm' || key === 'weightKg' ? String(Number(text)) : text;
}

/** 从已通过原生表单校验的字段中生成差量，不把缺席字段或未知病史变成 false。 */
export function createProfilePatch(data, profile) {
  const patch = {};
  for (const key of ['name', 'gender', 'birthDate', 'heightCm', 'weightKg', 'medicalHistory']) {
    if (!data.has(key)) continue;
    const value = normalizeField(key, data.get(key));
    if (value !== normalizeField(key, profile[key])) patch[key] = value;
  }
  const history = {};
  for (const key of ['isHypertensive', 'isDiabetic']) {
    if (!data.has(key)) continue;
    const answer = data.get(key);
    const value = answer === 'true' ? true : answer === 'false' ? false : null;
    if (value !== (profile.historyJson?.[key] ?? null)) history[key] = value;
  }
  if (Object.keys(history).length) patch.historyJson = history;
  return patch;
}

/** 模拟 PATCH 合并：null 清空字段，病史 null 删除单键，保留未提交及扩展内容。 */
export function applyProfilePatch(profile, patch) {
  const updated = { ...profile, ...patch };
  if (Object.hasOwn(patch, 'historyJson')) {
    if (patch.historyJson === null) {
      updated.historyJson = {};
    } else {
      updated.historyJson = { ...profile.historyJson };
      for (const [key, value] of Object.entries(patch.historyJson)) {
        if (value === null) delete updated.historyJson[key];
        else updated.historyJson[key] = value;
      }
    }
  }
  return updated;
}
