/** 集中定义普通渠道 API 的响应 DTO。 */

export namespace Rsp {
  /** 注册、登录与令牌续期响应。 */
  export namespace Auth {
    /** 当前渠道签发的令牌对。 */
    export interface TokenPair {
      /** 用于受保护请求的短期令牌。 */
      accessToken: string;
      /** 用于显式刷新请求的轮换令牌。 */
      refreshToken: string;
    }
  }

  /** 本人账号与资料响应。 */
  export namespace Users {
    /** 后端公开的当前账号标识。 */
    export interface UserAccount {
      /** 全局账号 ID。 */
      userId: number;
      /** 全局唯一用户名。 */
      username: string;
    }

    /** 本人资料中的结构化病史；保留后端允许的扩展键。 */
    export interface StructuredHistory {
      /** 是否有糖尿病病史；缺席表示未填写。 */
      isDiabetic?: boolean;
      /** 是否有高血压病史；缺席表示未填写。 */
      isHypertensive?: boolean;
      /** 后端可能返回的其他结构化病史字段。 */
      [key: string]: unknown;
    }

    /** 本人健康资料响应；数值和时间均保留后端原始表示。 */
    export interface MyProfile {
      /** 姓名；未填写时通常为 null，字段可能缺席。 */
      name?: string | null;
      /** 性别原始整数：0 未知、1 男、2 女。 */
      gender?: 0 | 1 | 2;
      /** 出生日期原字符串；未填写时为 null。 */
      birthDate?: string | null;
      /** 身高，单位 cm；后端以十进制字符串或 null 返回。 */
      heightCm?: string | null;
      /** 体重，单位 kg；后端以十进制字符串或 null 返回。 */
      weightKg?: string | null;
      /** 病史文字；未填写时为 null。 */
      medicalHistory?: string | null;
      /** 结构化病史；未填写时为 null，扩展字段保持原样。 */
      historyJson?: StructuredHistory | null;
    }
  }

  /** 当前渠道模型目录响应。 */
  export namespace Models {
    /** 当前普通渠道可用的已发布模型。 */
    export interface AvailableModel {
      /** 模型主键。 */
      modelId: number;
      /** 稳定模型编码。 */
      modelCode: string;
      /** 面向用户的模型名称。 */
      modelName: string;
      /** 当前已发布模型版本主键。 */
      versionId: number;
      /** 当前已发布模型版本号。 */
      version: string;
      /** 算法要求上传的输入逻辑名。 */
      requiredInputs: string[];
      /** 是否为非临床示例算法。 */
      isExample: boolean;
    }

    /** 当前普通渠道模型目录分页结果。 */
    export interface AvailableModelPage {
      /** 当前页可用模型。 */
      items: AvailableModel[];
      /** 当前渠道模型总数。 */
      total: number;
      /** 本页起始偏移。 */
      offset: number;
      /** 本页条数上限。 */
      limit: number;
    }
  }

  /** 当前账号的最新健康结果与指标历史响应。 */
  export namespace Measurements {
    /** 后端公开的五种健康指标。 */
    export type Metric = 'bloodPressure' | 'heartRate' | 'respirationRate' | 'oxygenSaturation' | 'diabetesRisk';

    /** 单项原始读数；代码、数值及单位不作转换。 */
    export interface Reading {
      /** 算法读数代码，例如 hr、sbp 或 diabetes_probability。 */
      code: string;
      /** 未舍入或重新分级的原始数值。 */
      value: number;
      /** 后端原始单位代码。 */
      unit: string;
    }

    /** 本次算法实际采用的质量分数和阈值。 */
    export interface Quality {
      /** 实际质量分数。 */
      score: number;
      /** 实际接受阈值。 */
      threshold: number;
    }

    /** 服务端权威健康记录；旧采集来源及质量保持 null。 */
    export interface MeasurementRecord {
      /** 稳定记录身份，同任务不同指标分别标识。 */
      recordId: string;
      /** 可读取完整报告的关联任务主键。 */
      taskId: number;
      /** 本条记录的健康指标。 */
      metric: Metric;
      /** 冻结提交时间原字符串（Asia/Shanghai），不解析为 Date。 */
      submittedAt: string;
      /** 客户端自报采集方式；旧任务未知时为 null。 */
      captureMethod: 'fingertip' | 'fingertip_chest' | null;
      /** 客户端自报采集来源；旧任务未知时为 null。 */
      captureMode: 'active' | null;
      /** 原始实际毫秒时长；旧任务未知时为 null。 */
      durationMs: number | null;
      /** 原始读数；血压两项来自同一任务。 */
      readings: Reading[];
      /** 实际合法质量信息；缺失时为 null。 */
      quality: Quality | null;
      /** 风险原始 0/1/2 编码；其他指标为 null。 */
      riskLevel: 0 | 1 | 2 | null;
      /** 任务固定模型主键，场景记录保留场景模型。 */
      modelId: number;
      /** 任务固定版本主键，不跟随当前渠道版本。 */
      versionId: number;
      /** 任务固定版本原字符串。 */
      version: string;
      /** 实际成功成员或独立算法标识。 */
      algorithmKey: string;
    }

    /** 固定五键，每个指标独立取最新有效记录。 */
    export interface LatestMeasurements {
      bloodPressure: MeasurementRecord | null;
      heartRate: MeasurementRecord | null;
      respirationRate: MeasurementRecord | null;
      oxygenSaturation: MeasurementRecord | null;
      diabetesRisk: MeasurementRecord | null;
    }

    /** 单页健康记录，不表示区间已完整加载或固定快照。 */
    export interface MeasurementPage {
      /** 当前页记录。 */
      items: MeasurementRecord[];
      /** 整个筛选区间的有效记录总数。 */
      total: number;
      /** 本页起始偏移。 */
      offset: number;
      /** 本页条数上限。 */
      limit: number;
    }
  }

  /** 当前渠道任务响应。 */
  export namespace Tasks {
    /** 任务状态原样使用服务端字符串，不推断状态枚举。 */
    export interface TaskSummary {
      /** 任务主键。 */
      taskId: number;
      /** 固定模型主键。 */
      modelId: number;
      /** 固定模型编码。 */
      modelCode: string;
      /** 固定模型名称。 */
      modelName: string;
      /** 固定模型版本主键。 */
      versionId: number;
      /** 固定模型版本号。 */
      version: string;
      /** 服务端任务状态，保留未知的新状态值。 */
      status: string;
      /** 是否为非临床示例算法。 */
      isExample: boolean;
      /** 创建时间原字符串（Asia/Shanghai），不解析为 Date。 */
      createdAt: string;
      /** 提交时间原字符串；未提交时为 null。 */
      submittedAt: string | null;
      /** 首次开始时间原字符串；未开始时为 null。 */
      startedAt: string | null;
      /** 终结时间原字符串；未终结时为 null。 */
      finishedAt: string | null;
    }

    /** 普通渠道任务列表分页结果。 */
    export interface TaskPage {
      /** 当前页任务摘要。 */
      items: TaskSummary[];
      /** 符合条件的任务总数。 */
      total: number;
      /** 本页起始偏移。 */
      offset: number;
      /** 本页条数上限。 */
      limit: number;
    }

    /** 低于质量阈值时返回的评分及阈值；数值可为整数或小数。 */
    export interface LowScoreQualityFailureDetails {
      /** 本次质量评分。 */
      score: number;
      /** 接受质量的最低阈值。 */
      threshold: number;
    }

    /** 低于质量阈值的拒绝结果。 */
    export interface LowScoreQualityFailure {
      /** 稳定的拒绝原因标识。 */
      reason: 'LOW_SCORE';
      /** 本次评分及最低阈值。 */
      details: LowScoreQualityFailureDetails;
    }

    /** 缺少有效信号的拒绝结果。 */
    export interface NoValidSignalQualityFailure {
      /** 稳定的拒绝原因标识。 */
      reason: 'NO_VALID_SIGNAL';
      /** 该拒绝原因不附带评分明细。 */
      details: null;
    }

    /** 任务详情的质量拒绝信息；非拒绝任务及无有效历史明细时为 null。 */
    export type QualityFailure = LowScoreQualityFailure | NoValidSignalQualityFailure;

    /** 服务端随提交冻结的采集属性。 */
    export interface Measurement {
      /** 客户端自报的采集方式。 */
      captureMethod: 'fingertip' | 'fingertip_chest';
      /** 客户端自报的主动采集来源。 */
      captureMode: 'active';
      /** 原生正式窗口的实际整数毫秒时长。 */
      durationMs: number;
    }

    /** 任务详情；算法结果仅作为后端原始对象保留。 */
    export interface TaskDetail extends TaskSummary {
      /** 冻结采集属性；草稿及缺少属性的旧任务为 null。 */
      measurement: Measurement | null;
      /** 质量拒绝详情；成功、普通失败或无有效历史明细时为 null。 */
      qualityFailure: QualityFailure | null;
      /** 成功任务的权威完整结果；任务处理中或失败时可能缺席或为 null。 */
      result?: Record<string, unknown> | null;
      /** 安全失败代码；非失败任务可能缺席或为 null。 */
      failureCode?: string | null;
      /** 安全失败摘要；非失败任务可能缺席或为 null。 */
      failureMessage?: string | null;
    }

    /** 后端登记的任务输入文件元数据。 */
    export interface TaskInputFile {
      /** 输入文件记录主键。 */
      fileId: number;
      /** 算法声明的输入逻辑名。 */
      logicalName: string;
      /** 文件大小，单位字节。 */
      sizeBytes: number;
      /** 完整上传登记时间原字符串（Asia/Shanghai）。 */
      uploadedAt: string;
      /** 是否为当前选中的输入。 */
      isSelected: boolean;
    }
    /** 下载的二进制文件及后端可提供的响应头信息。 */
    export interface TaskFileDownload {
      /** 原生 Blob 文件载荷，不自动写入本地文件系统。 */
      body: Blob;
      /** 响应的媒体类型；服务端未提供时为 null。 */
      contentType: string | null;
      /** 原始附件响应头；服务端未提供时为 null。 */
      contentDisposition: string | null;
    }
  }
}
