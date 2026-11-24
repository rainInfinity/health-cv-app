# 健康记录接口与前端数据消费

## 1. 合同依据与范围

本文说明原生首页、接触式报告及历史的数据合同和消费边界。权威依据是后端 `health-service/docs/frontend-integration.md` 第 6、7 节及[测试环境 OpenAPI](https://test-backend.myhealthyclub.com/api/v1/openapi.json)；SDK 用法见[云端请求接口](cloud-client-api.md)，流程见[采集上传协议](acquisition-upload-protocol.md)。

原先本文提出的 `capturedAt` 归档方案已被正式 **`submittedAt` 合同替代**，不得再发送、补造或依赖该字段。接口存在不表示目标渠道模型、制品和推理消费者已部署，也不表示真实人体采集或医学有效性已完成验证。

面部与无扰 RPPG 仍为本地路径，不进入这些云端健康记录；个人资料、健康资料及反馈编辑不因此开放。不增加后端接口、任务取消／删除、离线队列、重启恢复或自动文件清理。

## 2. 复用现有推理与文件接口

以下路径省略 `/api/v1/{channel}`，继续使用当前普通渠道 Bearer、账号隔离、JSON 成功封套和结构化错误。

| 能力 | 接口 |
| --- | --- |
| 当前渠道目录 | `GET /models` |
| 创建草稿 | `POST /tasks` |
| 上传逻辑输入 | `POST /tasks/{taskId}/files` |
| 最终提交 | `POST /tasks/{taskId}/submit` |
| 查询状态和完整结果 | `GET /tasks/{taskId}` |
| 下载处理后文件 | `GET /tasks/{taskId}/outputs/{logicalName}/download` |
| 最新健康结果 | `GET /measurements/latest` |
| 按指标日期读取记录 | `GET /measurements` |

指尖入口统一绑定 `modelCode=ppg.active.offline.all`，新算法为 `ppg.active.offline.all.v2`、发布版本为 `2.0.0`；客户端仍使用目录实际返回的 `modelId` 与创建响应固定版本，不硬编码版本。上传一份 `ppg`，固定 `hr`、`br`、`spo2`、`diabetes` 四成员，算法分别为 `ppg.active.offline.hr.v1`、`ppg.active.offline.br.v1`、`ppg.active.offline.spo2.v1`、`ppg.active.offline.diabetes.v1`；入口目标不切换独立算法。血压绑定 `ppg_acc.active.offline.all`，上传同轮 `ppg` 和 `acc`，当前只有 `bp` 成员。不能硬编码示例 ID，不能按名称或输入要求猜模型。

独立 HR（`modelCode=ppg.active.offline.hr`）仅读取 `result.hr` 和自身 `quality`，独立 BR（`ppg.active.offline.br`）仅读取 `result.br` 和自身 `quality`，分别判断任务成败。场景须检查任务状态、`outcome` 和各成员状态；HR／BR 分别读取成功 `results.hr.result.hr`、`results.br.result.br` 及各自 `result.quality`，不再同成同败。部分成功只展示有效成员；合法 `ALL_FAILED` 仍是任务 `SUCCEEDED`，但不生成健康读数和输出文件。旧融合与旧 PPG 场景 v1 不属于现行支持映射。

处理后文件使用顶层 `result.output_files` 的逻辑名键，不将不透明引用当作 URL。指尖报告只取成功 `hr` 的 `hr_processed_ppg`，不得借其他成员文件。独立 HR 输出为 `processed_ppg`（`timestamp,ppg`），独立 BR 输出为 `processed_rsp`（`timestamp,rsp`）；BR 文件不是 PPG，不增加呼吸波形 UI。血压仍使用成功 `bp` 的 `bp_processed_ppg/bp_processed_scg`。

## 3. 提交属性与产品检测时间

接触式正常完成后自动提交，`measurement` 与可选 `clientMetadata` 并列：

```json
{
  "measurement": {
    "captureMethod": "fingertip_chest",
    "captureMode": "active",
    "durationMs": 30001
  }
}
```

| 字段 | 正式语义 |
| --- | --- |
| `captureMethod` | 当前流程为 `fingertip` 或 `fingertip_chest` |
| `captureMode` | 当前流程为 `active`，不因此开放被动上传 |
| `durationMs` | 原生实际正式窗口的整数毫秒，不含准备、文件收尾、上传及推理 |
| `submittedAt` | 服务端最终接受提交的冻结时刻，由服务端返回，不由客户端提交 |

SDK 保留不传请求体及已有 `clientMetadata` 的能力；旧任务的采集属性为 null，不默认补成主动或指尖。账号、渠道和固定版本由服务端确定，客户端不能覆盖。采集属性不证明设备身份、信号质量或医学准确性。

产品检测时间统一使用 `submittedAt`，不是采集起点、`createdAt` 或 `finishedAt`。上传延迟可能让记录归入次日。响应无时区后缀的 `YYYY-MM-DD HH:mm:ss` 明确按北京时间 UTC+8 解释，DTO 原字符串不改写；中文日期及24小时制显示不受设备时区影响。

## 4. 统一健康记录

一条记录表示一个任务产生的一个有效指标身份。统一 PPG 任务可生成多条记录，共享 `taskId`，但各有自己的 `recordId`；血压必须来自同一任务的成对双读数。

```json
{
  "recordId": "101:bloodPressure",
  "taskId": 101,
  "metric": "bloodPressure",
  "submittedAt": "2026-11-22 08:30:00",
  "captureMethod": "fingertip_chest",
  "captureMode": "active",
  "durationMs": 30001,
  "readings": [
    {"code": "sbp", "value": 118.2, "unit": "mmHg"},
    {"code": "dbp", "value": 73.1, "unit": "mmHg"}
  ],
  "quality": {"score": 82, "threshold": 70},
  "riskLevel": null,
  "modelId": 7,
  "versionId": 12,
  "version": "1.0.0",
  "algorithmKey": "ppg_acc.active.offline.bp.v1"
}
```

以上仅为字段说明，ID 和版本不代表目标环境的部署配置。

| `metric` | `readings` 代码 | 单位 |
| --- | --- | --- |
| `bloodPressure` | `sbp`、`dbp` | `mmHg` |
| `heartRate` | `hr` | `beats_per_minute` |
| `respirationRate` | `br` | `breaths_per_minute` |
| `oxygenSaturation` | `spo2` | `percent` |
| `diabetesRisk` | `diabetes_probability` | `ratio` |

- `recordId` 是稳定唯一身份，不能以日期替代；同一天可有多条记录。
- `readings` 按代码识别，不依赖数组位置。原值保留精度，展示时才格式化，不补零。
- `versionId/version` 为任务固定模型版本；场景时是场景版本，`algorithmKey` 是实际成功成员算法，不是独立成员模型发布版本。
- `captureMethod/captureMode/durationMs` 可空；未知来源保持未知，不能从模型或文件存在推断。
- `quality` 使用实际分数与阈值，缺失为 null；心率、呼吸率分别使用成功 `hr`、`br` 成员或各自独立任务的质量，失败及质量拒绝也只影响对应指标，不共享或补造分数。
- BR 成功值必须为有限数且在 `[8,20]` 内，独立任务和场景规则相同；前端只校验，不补默认值、不限幅，原始读数精度与展示截断约定不变。
- `riskLevel` 保留原 `risk_level` 整数编码。概率不是血糖值或临床患病概率，编码不作为医学风险分层，不重算档位。

只有已支持正式独立算法及场景的有效成功结果生成记录；失败成员、`ALL_FAILED`、示例和未知算法不进入摘要。任务或最近一次采集失败不覆盖此前有效结果。旧任务只要具有已保存 `submittedAt` 和有效权威结果即可参与查询，不要求回填采集属性或重跑推理。

## 5. 最新与历史查询

### 5.1 最新五键

`GET /measurements/latest` 返回固定 `bloodPressure/heartRate/respirationRate/oxygenSaturation/diabetesRisk` 五键，每项为统一记录或 null。

各指标独立按服务端提交顺序选择最近有效结果，不共用一个展示时间；最新失败不覆盖以前成功记录。null 表示真实无记录，不表示请求失败。首页只在已确认认证时读取，首次骨架、刷新局部旋转；请求失败保留内部错误和缓存，但可见读数清空并以 Toast 反馈。指标入口进入对应指标的北京时间当日日区间，不经过指标详情。退出、换号及身份不可确认立即清空展示。

### 5.2 指标日期区间

```http
GET /measurements?metric=bloodPressure&from=2026-11-01&to=2026-11-23&offset=0&limit=100
```

| 参数 | 合同 |
| --- | --- |
| `metric` | 必填，使用上述五项稳定标识 |
| `from/to` | 必填，北京时间 `YYYY-MM-DD`，包含首尾 |
| `offset` | 非负整数，默认 0 |
| `limit` | 1–100，接口默认 20；前端完整区间加载每页使用 100 |

返回 `items/total/offset/limit`，按内部提交时间精度及任务 ID 稳定倒序。`total` 是全区间有效记录数，不是本页条数；无记录返回空分页，非法指标、日期、反向区间和分页边界仍为 `422 INVALID_INPUT`，不能转为空列表。

历史默认截至北京时间当天的七天，保留日／7天／30天／自定义、日历草稿和 Tab 内筛选。最近十条、完整虚拟化列表和单条详情均派生自同一区间，数据层保留关联 `taskId`，不为数据接入新增报告按钮或其他产品入口。

### 5.3 完整性与当前筛选区间

普通 offset 分页不提供固定快照。前端连续取得全区间后才统一发布记录、趋势、均值和极值，不发布本轮部分页。首次读取、切换筛选、同区间刷新及重新获取共用筛选下方的大加载圈；任一页失败共用“历史数据获取失败／重新获取”，从当前区间第一页重读。内部可保留上次完整缓存，但加载或失败不继续展示旧记录、统计及声明；历史不使用 Toast，也不显示分页完成度。

发现 total 变化、重复 `recordId` 或已知任务产生新有效结果，丢弃该轮页面并整段刷新，不只刷新第一页，不把去重当快照保证；不无界自动重取。接口不能检测所有并发变化。

当前指标及日期范围的全部有效记录统一参与趋势和统计，不按 `captureMethod/captureMode/algorithmKey/versionId` 分组或增加选择入口。原始来源、版本、概率和风险编码保留在DTO，不直接展示原始技术信息。列表与详情保留日期、时间和实际结果；风险只将 `riskLevel` 的0／1／2映射为较低风险／中风险／较高风险，以20／26两行居中显示并使用读数主文字色，不输出概率或按概率重算档位，不生成趋势或均值。血压两项独立计算，缺失日期不补零；数值计算保留原精度，最终展示直接舍弃小数。

查询按服务、渠道、认证代次、指标和日期隔离；最新和区间30秒新鲜期、十分钟无观察者回收，不持久化健康数据。首页首次无缓存时读取，后续由下拉刷新或新有效结果更新，不因返回、重新聚焦或重新进入自动请求；新有效结果失效当前代次对应的 latest 键，并重取该键已有缓存，无论是否正在展示。历史首次进入、每次导航重新聚焦及筛选变化仍读取整轮，不增加常驻刷新按钮。任务有效终态使相关查询失效，由服务端重新读取，不手工追加本地读数。

## 6. 展示与验证边界

状态展示沿用已确认的Demo设计，保留成功卡片、报告、原配色、参考信息及非诊断声明，不展示后端技术阶段。没有评估合同的位置及失败读数用 `--`；指尖部分成功只调整失败项、保留有依据的质量及空血氧仪表，不固定“正常”或风险等级；风险文案只来自后端已有档位映射，缺失不兜底为较低风险。详细报告首次只显示顶栏和居中加载，获取失败可重查原任务；成功／部分成功声明仅一次，失败任务不形成详细报告。波形在原画布独立显示加载或“波形暂时无法获取”，不隐藏有效读数、不提供样例兜底或重跑推理。

接口合同与消费者回归应覆盖独立算法、场景部分成功、全部失败、血压成对、同日多条、北京时间日界、分页失败、集合变化及账号／渠道隔离。真实设备、人体信号质量和部署可用性仍须通过相应环境实际验证，不能由模拟数据或接口文档推断。

实现职责及长期约定见[代码组织](../architecture/code-organization.md)、[前端开发约定](frontend-development.md)和[测量说明](measurement.md)。本文不记录联调或验收流水，也不替代后端正式合同。
