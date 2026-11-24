// 验证真实报告的文件合同、有限读取、毫秒时间轴、信号方向及会话隔离。

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  REPORT_WAVE_MAX_BYTES,
  REPORT_WAVE_MAX_ROWS,
  ReportWaveformError,
  selectReportWaveSource,
  parseReportWaveCsv,
  getReportWaveWindow,
  downloadReportWaveform,
} = require('../node_modules/.cache/native-test/app/measurement/reportWaveform.js');
const {
  getWaveDisplayRange,
} = require('../node_modules/.cache/native-test/shared/components/PulseWaveChart/pulseWaveDisplay.js');

/** 只构造接口公开任务字段，不依赖原生会话或固定采集文件。 */
function task(modelCode = 'ppg.active.offline.all', result) {
  return {
    taskId: 73,
    modelId: 3,
    modelCode,
    modelName: '正式模型',
    versionId: 8,
    version: '1.0.0',
    status: 'SUCCEEDED',
    isExample: false,
    createdAt: '2026-11-22 08:29:00',
    submittedAt: '2026-11-22 08:30:00',
    startedAt: '2026-11-22 08:30:01',
    finishedAt: '2026-11-22 08:30:05',
    measurement: null,
    qualityFailure: null,
    result: result ?? {
      outcome: 'PARTIALLY_SUCCEEDED',
      results: {
        hr: { status: 'SUCCEEDED', algorithmKey: 'ppg.active.offline.hr.v1', result: { hr: 72, quality: { score: 88, threshold: 70 } } },
        br: { status: 'SUCCEEDED', algorithmKey: 'ppg.active.offline.br.v1', result: { br: 16, quality: { score: 81, threshold: 72 } } },
        spo2: { status: 'SUCCEEDED', algorithmKey: 'ppg.active.offline.spo2.v1', result: { spo2: 98 } },
        diabetes: { status: 'FAILED', algorithmKey: 'ppg.active.offline.diabetes.v1', result: null },
      },
      output_files: {
        hr_processed_ppg: 'opaque:不能作为路径',
        br_processed_rsp: 'opaque:不能借用呼吸波',
        spo2_processed_ppg: 'https://不能作为下载地址.example',
      },
    },
  };
}

/** 提供可观测的单次下载及代次门控，不模拟任何推理结果生成。 */
function harness(download) {
  let generation = 4;
  const calls = [];
  const services = {
    auth: {
      isAuthenticatedAt: (expected) => expected === generation,
      runProtected: async (operation, options, expected) => {
        assert.equal(expected, generation);
        return operation(options);
      },
    },
    client: { tasks: { downloadOutput: async (taskId, logicalName, options) => {
      calls.push({ taskId, logicalName, options });
      return download ? download(options) : { body: new Blob(['timestamp,ppg\n1700000000000,-2\n1700000000041,3\n']) };
    } } },
  };
  return { services, calls, changeSession: () => { generation += 1; } };
}

const ppg = { kind: 'ppg', logicalName: 'processed_ppg', timestampColumn: 'timestamp' };
const scg = { kind: 'scg', logicalName: 'processed_scg', timestampColumn: 'timestamp' };
const hasCode = (code) => (error) => error instanceof ReportWaveformError && error.code === code;

test('统一指尖只下载成功HR的顶层键，不发送引用或借用BR和血氧文件', async () => {
  const current = task();
  const original = structuredClone(current);
  assert.deepEqual(selectReportWaveSource(current, 'ppg'), { ...ppg, logicalName: 'hr_processed_ppg' });
  const h = harness();
  const data = await downloadReportWaveform(h.services, current, 'ppg', 4, new AbortController().signal);
  assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0].taskId, 73);
  assert.equal(h.calls[0].logicalName, 'hr_processed_ppg');
  assert.deepEqual(data.samples, [[0, -2], [41, 3]]);
  assert.deepEqual(current, original, '下载不得修改已有读数或任务');
  current.result.results.hr.status = 'FAILED';
  current.result.results.hr.result = null;
  assert.equal(selectReportWaveSource(current, 'ppg'), null);
  assert.equal(selectReportWaveSource(current, 'scg'), null);
});

test('HR成功且BR失败仍可读PPG，缺失HR顶层文件不借用成员内或其他输出', () => {
  const current = task();
  current.result.results.br.status = 'FAILED';
  current.result.results.br.result = null;
  assert.deepEqual(selectReportWaveSource(current, 'ppg'), { ...ppg, logicalName: 'hr_processed_ppg' });
  current.result.results.hr.result.output_files = { processed_ppg: 'opaque:成员内不可借用' };
  delete current.result.output_files.hr_processed_ppg;
  assert.equal(selectReportWaveSource(current, 'ppg'), null);
});

test('全部失败的指尖任务即使遗留输出也不提供波形', () => {
  const current = task();
  current.result.outcome = 'ALL_FAILED';
  for (const member of Object.values(current.result.results)) {
    member.status = 'FAILED';
    member.result = null;
  }
  assert.equal(selectReportWaveSource(current, 'ppg'), null);
  assert.equal(selectReportWaveSource(current, 'scg'), null);
});

test('血压使用 bp 顶层 PPG 和 SCG，失败成员及全部失败没有波形', () => {
  const current = task('ppg_acc.active.offline.all', {
    outcome: 'ALL_SUCCEEDED',
    results: { bp: { status: 'SUCCEEDED', algorithmKey: 'ppg_acc.active.offline.bp.v1', result: { sbp: 121.5, dbp: 78.25 } } },
    output_files: { bp_processed_ppg: 'opaque-a', bp_processed_scg: 'opaque-b' },
  });
  assert.deepEqual(selectReportWaveSource(current, 'ppg'), { ...ppg, logicalName: 'bp_processed_ppg' });
  assert.deepEqual(selectReportWaveSource(current, 'scg'), { ...scg, logicalName: 'bp_processed_scg' });
  current.result.outcome = 'ALL_FAILED';
  assert.equal(selectReportWaveSource(current, 'ppg'), null);
  assert.equal(selectReportWaveSource(current, 'scg'), null);
  current.result.outcome = 'ALL_SUCCEEDED';
  current.result.results.bp.algorithmKey = '未知算法';
  assert.equal(selectReportWaveSource(current, 'scg'), null);
});

test('有PPG的独立历史按各自无前缀输出及时间戳合同读取', () => {
  for (const modelCode of ['ppg.active.offline.hr', 'ppg.active.offline.spo2', 'ppg.active.offline.diabetes', 'ppg_acc.active.offline.bp']) {
    const current = task(modelCode, { output_files: { processed_ppg: 'opaque', processed_scg: 'opaque-z' } });
    const timestampColumn = ['ppg.active.offline.spo2', 'ppg.active.offline.diabetes'].includes(modelCode) ? 'timestampFrame' : 'timestamp';
    const source = selectReportWaveSource(current, 'ppg');
    assert.deepEqual(source, { ...ppg, timestampColumn });
    const data = parseReportWaveCsv(`${timestampColumn},ppg\n100000,2\n100043.5,-1\n`, source);
    assert.deepEqual(data.samples, [[0, 2], [43.5, -1]]);
    assert.equal(data.durationMs, 43.5);
    assert.equal(selectReportWaveSource(current, 'scg')?.logicalName ?? null, modelCode === 'ppg_acc.active.offline.bp' ? 'processed_scg' : null);
  }
  assert.equal(selectReportWaveSource(task('未支持模型'), 'ppg'), null);
  assert.equal(selectReportWaveSource({ ...task(), status: 'FAILED' }, 'ppg'), null);
  assert.equal(selectReportWaveSource({ ...task(), isExample: true }, 'ppg'), null);
  assert.equal(selectReportWaveSource(task('ppg.active.offline.hr', { output_files: {} }), 'ppg'), null);
});

test('独立BR仅有timestamp与rsp呼吸输出，不提供PPG或SCG来源', () => {
  const current = task('ppg.active.offline.br', {
    br: 16, quality: { score: 81, threshold: 72 }, output_files: { processed_rsp: 'opaque:呼吸波' },
  });
  assert.equal(selectReportWaveSource(current, 'ppg'), null);
  assert.equal(selectReportWaveSource(current, 'scg'), null);
  current.result.output_files.processed_ppg = 'opaque:不能借用';
  assert.equal(selectReportWaveSource(current, 'ppg'), null);
});

test('CSV 保留不等间隔真实毫秒轴及原始值，支持 BOM、CRLF、标准引号与列顺序', () => {
  const csv = '\uFEFF"ppg","timestamp"\r\n"-3.5","1750000000100"\r\n"0","1750000000127.5"\r\n"2e-1","1750000001250"\r\n';
  const data = parseReportWaveCsv(csv, ppg);
  assert.deepEqual(data.samples, [[0, -3.5], [27.5, 0], [1150, 0.2]]);
  assert.equal(data.durationMs, 1150);
  assert.deepEqual(getReportWaveWindow(data.durationMs, -100), { startTimeMs: 0, endTimeMs: 1150 });
  assert.deepEqual(getReportWaveWindow(data.durationMs, 9000), { startTimeMs: 0, endTimeMs: 1150 });
  assert.equal(data.samples.length, 3, '短段不补点或按 FPS 重造坐标');
});

test('长文件六秒窗口按真实末端约束，两种信号视窗互不关联', () => {
  const duration = 11_234.5;
  assert.deepEqual(getReportWaveWindow(duration), { startTimeMs: 0, endTimeMs: 6000 });
  assert.deepEqual(getReportWaveWindow(duration, 99_000), { startTimeMs: 5234.5, endTimeMs: duration });
  const ppgWindow = getReportWaveWindow(duration, 1000);
  const scgWindow = getReportWaveWindow(7000, 5000);
  assert.deepEqual(ppgWindow, { startTimeMs: 1000, endTimeMs: 7000 });
  assert.deepEqual(scgWindow, { startTimeMs: 1000, endTimeMs: 7000 });
  getReportWaveWindow(7000, 0);
  assert.deepEqual(ppgWindow, { startTimeMs: 1000, endTimeMs: 7000 });
});

test('报告 PPG 保留后端方向，SCG 只选 Z 幅值且两者纵轴不再取负', () => {
  const scgData = parseReportWaveCsv('timestamp,scgX,scgY,scgZ\n8000000,0,0,-2\n8000010,0,0,5\n8000025,0,0,0\n', scg);
  assert.deepEqual(scgData.samples, [[0, -2], [10, 5], [25, 0]]);
  const ppgData = parseReportWaveCsv('timestamp,ppg\n1000,-3\n1017,0\n1041,2\n', ppg);
  assert.deepEqual(ppgData.samples, [[0, -3], [17, 0], [41, 2]]);
  const position = (value, range) => (value - range.minimum) / (range.maximum - range.minimum);
  assert.ok(Math.abs(position(-2, scgData) - 0.1) < 1e-12);
  assert.ok(Math.abs(position(5, scgData) - 0.85) < 1e-12);
  assert.ok(Math.abs(position(-3, ppgData) - 0.1) < 1e-12);
  assert.ok(Math.abs(position(2, ppgData) - 0.85) < 1e-12);
  for (const points of [[[0, 0], [10, 0]], [[0, Number.MAX_VALUE], [10, -Number.MAX_VALUE]]]) {
    const range = getWaveDisplayRange(points, 'scg');
    assert.ok(Number.isFinite(range.minimum) && Number.isFinite(range.maximum) && range.maximum > range.minimum);
  }
});

test('CSV 表头、列数、数值及严格递增时间不符合合同即整体失败', () => {
  for (const csv of [
    'timestampFrame,ppg\n1,2\n2,3',
    'timestamp,ppg,ppg\n1,2,3\n2,3,4',
    'timestamp,ppg\n1,2,3\n2,3',
    'timestamp,ppg\n1,\n2,3',
    'timestamp,ppg\n1,NaN\n2,3',
    'timestamp,ppg\n1,Infinity\n2,3',
    'timestamp,ppg\n1,0x10\n2,3',
    'timestamp,ppg\n1,2\n1,3',
    'timestamp,ppg\n2,2\n1,3',
    'timestamp,ppg\n1,2\n\n2,3',
    'timestamp,ppg\n1,"2\n2,3',
  ]) assert.throws(() => parseReportWaveCsv(csv, ppg), hasCode('invalid-csv'));
  assert.throws(() => parseReportWaveCsv('timestamp,scgX,scgY,scgZ\n0,0,NaN,1\n10,0,0,2', scg), hasCode('invalid-csv'));
});

test('20,000 行与 5 MiB 均为严格上限，超出拒绝整个文件而不截断', () => {
  const exactRows = 'timestamp,ppg\n' + Array.from({ length: REPORT_WAVE_MAX_ROWS }, (_, index) => `${index},1`).join('\n');
  const data = parseReportWaveCsv(exactRows, ppg);
  assert.equal(data.samples.length, REPORT_WAVE_MAX_ROWS);
  assert.equal(data.durationMs, REPORT_WAVE_MAX_ROWS - 1);
  assert.throws(() => parseReportWaveCsv(exactRows + `\n${REPORT_WAVE_MAX_ROWS},2`, ppg), hasCode('too-many-rows'));
  const minimal = 'timestamp,ppg\n0,1\n1,2';
  const exactBytes = minimal + ' '.repeat(REPORT_WAVE_MAX_BYTES - Buffer.byteLength(minimal));
  assert.equal(parseReportWaveCsv(exactBytes, ppg).samples.length, 2);
  assert.throws(() => parseReportWaveCsv(exactBytes + ' ', ppg), hasCode('too-large'));
  assert.throws(() => parseReportWaveCsv(exactBytes.slice(0, -1) + '中', ppg), hasCode('too-large'));
});

test('Blob 超限在解码前拒绝，进度超限立即取消下载', async () => {
  let decoded = false;
  const h = harness(async () => ({ body: { size: REPORT_WAVE_MAX_BYTES + 1, text: async () => { decoded = true; return ''; } } }));
  await assert.rejects(downloadReportWaveform(h.services, task(), 'ppg', 4, new AbortController().signal), hasCode('too-large'));
  assert.equal(decoded, false);
  const progress = harness(async (options) => {
    options.onProgress({ loadedBytes: 10, totalBytes: REPORT_WAVE_MAX_BYTES + 1 });
    assert.equal(options.signal.aborted, true);
    throw new Error('请求已取消');
  });
  await assert.rejects(downloadReportWaveform(progress.services, task(), 'ppg', 4, new AbortController().signal), hasCode('too-large'));
});

test('下载前、下载后和解码后都拒绝旧认证代次，离页取消不回传样本', async () => {
  const before = harness();
  before.changeSession();
  await assert.rejects(downloadReportWaveform(before.services, task(), 'ppg', 4, new AbortController().signal), hasCode('session-changed'));
  assert.equal(before.calls.length, 0);
  const after = harness(async () => { after.changeSession(); return { body: new Blob(['timestamp,ppg\n0,1\n1,2']) }; });
  await assert.rejects(downloadReportWaveform(after.services, task(), 'ppg', 4, new AbortController().signal), hasCode('session-changed'));
  const decoding = harness(async () => ({ body: { size: 20, text: async () => { decoding.changeSession(); return 'timestamp,ppg\n0,1\n1,2'; } } }));
  await assert.rejects(downloadReportWaveform(decoding.services, task(), 'ppg', 4, new AbortController().signal), hasCode('session-changed'));
  const aborted = new AbortController();
  aborted.abort();
  const cancelled = harness();
  await assert.rejects(downloadReportWaveform(cancelled.services, task(), 'ppg', 4, aborted.signal), hasCode('cancelled'));
  assert.equal(cancelled.calls.length, 0);
  const controller = new AbortController();
  const midflight = harness(async (options) => {
    controller.abort();
    assert.equal(options.signal.aborted, true);
    return { body: new Blob(['timestamp,ppg\n0,1\n1,2']) };
  });
  await assert.rejects(downloadReportWaveform(midflight.services, task(), 'ppg', 4, controller.signal), hasCode('cancelled'));
});

test('单独重新读取失败文件只重复下载，不创建、上传或提交任务', async () => {
  let attempt = 0;
  const h = harness(async () => {
    attempt += 1;
    if (attempt === 1) throw new Error('网络失败');
    return { body: new Blob(['timestamp,ppg\n0,-1\n40,-2']) };
  });
  const current = task();
  const original = structuredClone(current);
  await assert.rejects(downloadReportWaveform(h.services, current, 'ppg', 4, new AbortController().signal));
  const data = await downloadReportWaveform(h.services, current, 'ppg', 4, new AbortController().signal);
  assert.equal(h.calls.length, 2);
  assert.equal(data.durationMs, 40);
  assert.deepEqual(current, original);
});

test('血压两图独立下载，一张失败不撤销另一张样本或成对读数', async () => {
  const current = task('ppg_acc.active.offline.all', {
    outcome: 'ALL_SUCCEEDED',
    results: { bp: { status: 'SUCCEEDED', algorithmKey: 'ppg_acc.active.offline.bp.v1', result: { sbp: 121.5, dbp: 78.25 } } },
    output_files: { bp_processed_ppg: 'opaque-a', bp_processed_scg: 'opaque-b' },
  });
  const original = structuredClone(current);
  const h = harness();
  const names = [];
  h.services.client.tasks.downloadOutput = async (_, name) => {
    names.push(name);
    if (name === 'bp_processed_ppg') throw new Error('单张文件暂不可读');
    return { body: new Blob(['timestamp,scgX,scgY,scgZ\n100000,0,0,-3\n100010,0,0,4']) };
  };
  const [ppgResult, scgResult] = await Promise.allSettled([
    downloadReportWaveform(h.services, current, 'ppg', 4, new AbortController().signal),
    downloadReportWaveform(h.services, current, 'scg', 4, new AbortController().signal),
  ]);
  assert.deepEqual(names, ['bp_processed_ppg', 'bp_processed_scg']);
  assert.equal(ppgResult.status, 'rejected');
  assert.equal(scgResult.status, 'fulfilled');
  assert.deepEqual(scgResult.value.samples, [[0, -3], [10, 4]]);
  assert.deepEqual(current, original);
});
