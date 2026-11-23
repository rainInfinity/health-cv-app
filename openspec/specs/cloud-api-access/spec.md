# cloud-api-access Specification

## Purpose

为原生 App 和其上层业务提供普通渠道后端接口的稳定调用契约，统一请求成功、失败、取消与文件传输的可观察行为，使调用方无需了解 HTTP 实现细节，也不被迫接受请求模块内置的认证、缓存或任务流程。

## Requirements

### Requirement: 请求固定服务地址和普通渠道作用域
客户端 MUST 在创建时显式接收服务根地址和普通渠道，随后在该作用域内调用接口。服务根地址不含 `/api/v1`；客户端 MUST 在其下组装 `/api/v1/{channel}`。受保护请求 MUST 从外部取得当前 Access Token，并通过 Bearer 请求头发送；认证入口 MUST 不要求 Access Token，凭据 MUST 不进入 URL。

#### Scenario: 使用服务根地址构造 API 路径
- **WHEN** 调用方以 `https://example.test` 和普通渠道创建客户端
- **THEN** 请求路径以 `/api/v1/{channel}` 开始，不要求调用方在 `baseUrl` 中重复填写 API 版本前缀

#### Scenario: 同一账号的不同渠道互不借用凭据
- **WHEN** 调用方分别创建不同渠道的客户端并为其提供各自的令牌来源
- **THEN** 每个客户端使用自己的渠道路径和令牌，不因账号相同而复用另一渠道的令牌或缓存

#### Scenario: 调用认证入口
- **WHEN** 调用方尚无 Access Token 并执行注册、登录、刷新或登出请求
- **THEN** 客户端按该入口的请求体契约发送请求，不先查询用户、不附带自动认证操作

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

### Requirement: JSON 成功响应解包
客户端 MUST 仅将符合已接入契约的成功 HTTP 响应及 `code=OK` 视为 JSON 请求成功，并直接返回包装中的 `data`。合法的 `data=null` MUST 原样保留；缺失响应封套、无效 JSON 或缺失 `data` 字段 MUST 被拒绝。客户端 MUST NOT 对 `data` 内部的业务 DTO 字段执行运行时形状校验或改写。

#### Scenario: 创建接口成功
- **WHEN** 后端返回 HTTP 201、`code=OK` 及合法业务对象
- **THEN** 调用方取得该业务对象，而不是响应包装或 HTTP 客户端响应实例

#### Scenario: 无业务载荷的成功响应
- **WHEN** 后端返回 HTTP 200、`code=OK`、`data=null`
- **THEN** 调用方取得 `null`，而不是失败、空对象或布尔值

#### Scenario: 网关返回非契约成功正文
- **WHEN** 请求返回成功 HTTP 状态但正文是 HTML、缺少响应封套或缺少 `data` 字段
- **THEN** 请求以响应协议错误 reject，不将正文强制转换成声明的业务类型；有效封套中的 `data` 按声明类型直接交给调用方

### Requirement: 失败提供可判别且不泄密的信息
客户端 MUST 将 API、网络、超时、取消和协议失败统一通过 reject 表达，并提供可判别的错误类别。存在有效业务包装时 MUST 保留后端错误码和安全消息，存在响应时 MUST 保留 HTTP 状态及可取得的请求标识和等待提示；无响应时 MUST 不伪造状态或业务码。错误 MUST 不携带可供普通日志输出的密码、令牌、健康资料、文件内容或完整请求配置。

#### Scenario: HTTP 与业务错误码分别保留
- **WHEN** 登录返回 HTTP 401、`code=INVALID_CREDENTIALS`、安全消息及 `requestId`
- **THEN** 错误分别提供 HTTP 401 和业务码 `INVALID_CREDENTIALS`，不以 HTTP 实现内部的错误码替代后端业务码

#### Scenario: 未知业务错误码和限流提示
- **WHEN** 有效错误包装包含尚未接入的业务码，或 HTTP 429 响应携带 `Retry-After`
- **THEN** 客户端保留原业务码及可取得的等待提示，不因未识别该码而丢失整个错误，也不自动等待后重试

#### Scenario: 上传被网关拒绝
- **WHEN** 上传收到非 JSON 的 HTTP 错误响应
- **THEN** 客户端 reject 并保留 HTTP 状态和可取得的请求标识，不将网关正文当作安全业务提示直接输出

### Requirement: 保留资料局部更新语义
资料更新 MUST 仅发送调用方显式提交的允许字段，区分字段缺席、`null` 和具体值；MUST 保留病史中明确的 `false`，并遵守性别未知使用 0、不能显式为 `null` 的约束。响应中的扩展字段 MUST 不自动变成可写请求字段。

#### Scenario: 局部编辑资料
- **WHEN** 调用方仅更新姓名并将出生日期显式清空
- **THEN** 请求只包含姓名和 `birthDate=null`，不将未编辑字段批量改为 `null`

#### Scenario: 更新三态病史
- **WHEN** 调用方提交 `isDiabetic=false`、`isHypertensive=null`
- **THEN** 请求保留这两个不同含义，未提交的病史键不被隐式清除

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

### Requirement: 保留 Task 详情质量拒绝字段协议
任务详情 MUST 包含可空 `qualityFailure`。合法低分拒绝 MUST 提供 `reason="LOW_SCORE"` 及包含数值 `score`、`threshold` 的 `details`；无可用信号拒绝 MUST 提供 `reason="NO_VALID_SIGNAL"` 且 `details=null`。成功任务、普通失败及缺少或损坏质量明细的历史任务 MUST 返回 `qualityFailure=null`。任务摘要与列表项 MUST 不包含该字段。

#### Scenario: 查询低分质量拒绝
- **WHEN** 任务详情成功返回低分质量拒绝及其实际分数和阈值
- **THEN** 客户端保留 `qualityFailure.reason="LOW_SCORE"` 及原始 `score`、`threshold`，不舍入或改写数值

#### Scenario: 查询无可用信号拒绝
- **WHEN** 任务详情成功返回 `reason="NO_VALID_SIGNAL"`
- **THEN** `qualityFailure.details` 保留为 `null`，客户端不造出分数或阈值

#### Scenario: 查询普通失败或任务列表
- **WHEN** 任务详情是普通失败，或调用方读取任务列表
- **THEN** 详情的 `qualityFailure` 为 `null`，列表摘要不包含 `qualityFailure`

### Requirement: 上传使用文件引用和后端逻辑名
上传接口 MUST 每次发送一个 `logicalName` 与一个文件引用，使用运行时构造的 multipart 边界。客户端 MUST 正确保留文件 URI，不无条件重复添加 `file://`；MUST 不先将完整文件读取为字符串、Base64 或样本数组，也不管理文件目录和删除。成功结果 MUST 保留本次上传的服务端文件元数据。

#### Scenario: 上传已有文件 URI
- **WHEN** 调用方提供合法上传 URI、文件名、媒体类型和逻辑名
- **THEN** 客户端通过文件引用发送 multipart 请求，不生成双重 URI 前缀或手工拼接 multipart 边界

#### Scenario: 同名重传取得新回执
- **WHEN** 同一草稿和逻辑名的后续上传成功并返回新的 `fileId`
- **THEN** 客户端返回本次回执，不将旧文件标识复用为新的选择，也不宣称重传覆盖了同一条记录

### Requirement: 下载区分文件成功和错误正文
下载 MUST 使用鉴权请求，并返回二进制载荷及可取得的媒体类型、附件响应信息，不自动落盘或返回临时文件路径。下载失败 MUST 尝试解析安全 JSON 错误，不能因为响应被按二进制接收而丢失认证错误。输出逻辑名 MUST 按路径段编码，不透明的输出标识 MUST 不被当作 URL 或路径。

#### Scenario: 成功下载输入或输出
- **WHEN** 下载接口返回合法文件响应
- **THEN** 调用方取得二进制内容和可取得的响应元信息，客户端不创建本地文件或推断服务端存储路径

#### Scenario: 下载返回认证错误
- **WHEN** 下载响应为 HTTP 401 的 JSON 错误包装
- **THEN** 客户端 reject 并保留业务码和请求标识，不把错误 JSON 当作成功文件

### Requirement: 上传下载提供可选的逐请求进度
文件方法 MUST 支持可选进度回调，提供已传输字节数和可选总字节数。无法取得总量时 MUST 明确表示未知，不伪造百分比；有总量时 MUST 使用实际传输事件的口径，不用本地文件大小替代 multipart 请求体总量。进度 MUST 不改变最终成功或失败语义，也不要求调用方接入某种状态管理机制。

#### Scenario: 传输总量已知
- **WHEN** 运行时报告已传输字节数和有效的正总量
- **THEN** 回调提供二者，调用方能够计算该次传输的比例

#### Scenario: 传输总量未知
- **WHEN** 运行时只报告已传输字节数
- **THEN** 回调的总量为未知，客户端不生成固定或估算的完成百分比

#### Scenario: 上传字节完成后服务端拒绝
- **WHEN** 上传进度已达到总量，但后端随后返回校验失败
- **THEN** 操作仍以错误 reject，不能因进度达到 100% 而提前 resolve

#### Scenario: 文件很小或平台合并事件
- **WHEN** 实际运行只产生少量进度事件
- **THEN** 客户端不为平滑展示伪造中间事件，也不承诺固定回调频率

### Requirement: 超时和取消不等价于服务端撤销
客户端 MUST 支持调用方传入取消信号和合理的超时选项，分别表达主动取消和超时，不自动重试写入请求。请求结束后 MUST 不再向调用方发布该请求的进度。调用方取消或没有收到响应 MUST 不被表述为后端写入未生效、任务已取消或文件已删除。

#### Scenario: 取消正在传输的请求
- **WHEN** 调用方取消上传或下载
- **THEN** 实际传输收到取消信号，操作以取消类别 reject，结束后的迟到进度不再通知调用方

#### Scenario: 创建或提交超时
- **WHEN** 创建草稿或提交任务没有在超时内收到响应
- **THEN** 客户端返回超时错误，不重复请求，也不判定服务端任务仍不存在或仍是草稿

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
