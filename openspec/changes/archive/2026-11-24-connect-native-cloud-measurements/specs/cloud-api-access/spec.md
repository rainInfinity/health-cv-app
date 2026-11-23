# Spec Delta

## MODIFIED Requirements

### Requirement: 普通用户接口覆盖且不自动编排
客户端 MUST 提供普通渠道注册、登录、刷新、登出，本人账号与资料读取、资料局部更新，模型目录，任务创建、单文件上传、提交、列表、详情、输入下载和输出下载，以及最新健康结果和按指标日期查询健康记录能力。一次接口方法调用 MUST 只执行对应操作，不自动刷新、重试、轮询或串联其他操作。

#### Scenario: 注册成功不自动登录
- **WHEN** 注册请求成功
- **THEN** 调用方取得注册返回的账号数据，不额外产生登录请求或改变应用认证状态

#### Scenario: 创建任务不自动上传和提交
- **WHEN** 创建任务请求成功
- **THEN** 调用方取得包含固定版本的草稿摘要，客户端不继续上传、提交或查询任务

#### Scenario: Access 请求被拒绝
- **WHEN** 受保护接口返回 401 / INVALID_TOKEN
- **THEN** 客户端返回结构化错误，不自行刷新或重发请求

#### Scenario: 获取一页健康历史
- **WHEN** 调用方按 metric、from、to、offset、limit 查询
- **THEN** 客户端只读取对应一页并返回完整分页结构，不自动取完区间或计算统计

### Requirement: 保留业务数据的原始语义
客户端 MUST 保留分页的 items/total/offset/limit、十进制字符串、空值及后端约定的时间字符串，不隐式做时区转换或递归改名。任务摘要与详情 MUST 分开表达，保留固定版本、示例标识和安全失败信息；算法结果 MUST 不被解释为通用医学指标。健康记录 MUST 保留稳定身份、关联任务、原始读数、质量、风险编码、采集属性和固定版本。

#### Scenario: 查询失败任务
- **WHEN** 详情请求返回 HTTP 200、code=OK，而任务 status=FAILED
- **THEN** 客户端正常返回任务详情及其失败信息，不抛出请求错误或自动创建新任务

#### Scenario: 读取资料和算法结果
- **WHEN** 资料包含字符串身高和空体重、任务包含无时区后缀时间，算法结果包含下划线字段或扩展对象
- **THEN** 客户端保留这些值和键名，不转为默认数值、不按宿主时区解析，也不递归转为 camelCase

#### Scenario: 保留健康记录的未知来源
- **WHEN** 历史记录的采集方式、来源、时长或质量为 null
- **THEN** 客户端原样保留，不补 active、三十秒、默认质量或任何采集时间

## ADDED Requirements

### Requirement: 任务提交与详情支持独立采集属性
客户端 MUST 支持可选完整 measurement 请求对象及详情中的可空采集属性，保持 captureMethod、captureMode、durationMs 的后端名称和语义；MUST 继续支持不传提交请求体及独立 clientMetadata。客户端 MUST 不新增 capturedAt、用户或版本覆盖字段，不在 SDK 中补默认属性。

#### Scenario: 提交实际属性
- **WHEN** 调用方提交 fingertip、active 及实际整数 durationMs
- **THEN** 属性与可选 clientMetadata 独立发送，不改写数值；详情可读取冻结三项，摘要不伪造该字段

#### Scenario: 旧任务与无请求体提交
- **WHEN** 调用方不提供提交请求体，或读取缺少采集属性的旧任务
- **THEN** 仍使用后端支持的无请求体方式，详情属性保持未知，不回填采集方式或时长

### Requirement: 最新健康结果与历史查询使用普通渠道鉴权
客户端 MUST 在当前服务与普通渠道下提供 GET measurements/latest 和 GET measurements。最新结果 MUST 保留固定五键及各自记录或 null；历史 MUST 显式发送 metric/from/to 及所选分页参数，保留 recordId、submittedAt、readings、quality、riskLevel、algorithmKey 和固定版本，不将任务列表冒充健康历史。

#### Scenario: 最新接口全部无记录
- **WHEN** 服务端成功返回五个 null
- **THEN** 调用方取得真实无记录结果，不抛出请求错误或填入默认读数

#### Scenario: 非法历史筛选
- **WHEN** 服务端返回 422 / INVALID_INPUT
- **THEN** 请求以现有结构化错误 reject，不作为空历史 resolve，也不隐式修改筛选后重试
