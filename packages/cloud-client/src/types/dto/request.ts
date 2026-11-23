/** 集中定义普通渠道 API 的请求 DTO。 */

import type { Rsp } from './response';

export namespace Req {
  /** 注册、登录与令牌续期请求。 */
  export namespace Auth {
    /** 注册和登录使用的用户名与密码。 */
    export interface AccountCredentialsRequest {
      /** 全局唯一用户名。 */
      username: string;
      /** 仅用于当前登录或注册调用的密码。 */
      password: string;
    }

    /** 显式认证操作使用的 Refresh Token 请求体。 */
    export interface RefreshTokenRequest {
      /** 当前渠道的一次性刷新令牌。 */
      refreshToken: string;
    }
  }

  /** 本人账号与资料更新请求。 */
  export namespace Users {
    /** 结构化病史的局部更新字段；null 表示删除对应键。 */
    export interface StructuredHistoryPatch {
      /** 糖尿病标记；null 表示删除该键，false 表示明确否。 */
      isDiabetic?: boolean | null;
      /** 高血压标记；null 表示删除该键，false 表示明确否。 */
      isHypertensive?: boolean | null;
    }

    /** 本人资料局部更新请求；缺席字段不应覆盖现有值。 */
    export interface ProfilePatchRequest {
      /** 姓名；null 清空。 */
      name?: string | null;
      /** 性别：0 未知、1 男、2 女；不能为 null。 */
      gender?: 0 | 1 | 2;
      /** 出生日期 ISO 日期字符串；null 清空。 */
      birthDate?: string | null;
      /** 身高，单位 cm；非空值须为正数，null 清空。 */
      heightCm?: number | string | null;
      /** 体重，单位 kg；非空值须为正数，null 清空。 */
      weightKg?: number | string | null;
      /** 病史文字；null 清空。 */
      medicalHistory?: string | null;
      /** 结构化病史局部更新；null 清空整个对象。 */
      historyJson?: StructuredHistoryPatch | null;
    }
  }

  /** 当前渠道模型目录请求。 */
  export namespace Models {
    /** 普通渠道模型目录分页参数。 */
    export interface ModelListParams {
      /** 本页起始偏移；缺席时由服务端使用默认值。 */
      offset?: number;
      /** 本页条数上限；缺席时由服务端使用默认值。 */
      limit?: number;
    }
  }

  /** 当前账号健康记录查询。 */
  export namespace Measurements {
    /** 按北京时间日期查询单页指标记录；包含首尾日。 */
    export interface MeasurementListParams {
      /** 要查询的健康指标。 */
      metric: Rsp.Measurements.Metric;
      /** 起始日期原字符串，格式为 YYYY-MM-DD。 */
      from: string;
      /** 截止日期原字符串，格式为 YYYY-MM-DD。 */
      to: string;
      /** 本页起始偏移；缺席时由服务端使用默认值。 */
      offset?: number;
      /** 本页条数上限，服务端允许 1–100；缺席时使用默认值。 */
      limit?: number;
    }
  }

  /** 当前渠道任务请求。 */
  export namespace Tasks {
    /** 普通渠道任务列表分页参数。 */
    export interface TaskListParams {
      /** 本页起始偏移；缺席时由服务端使用默认值。 */
      offset?: number;
      /** 本页条数上限；缺席时由服务端使用默认值。 */
      limit?: number;
    }

    /** 创建当前渠道任务草稿的请求。 */
    export interface CreateTaskRequest {
      /** 当前渠道已配置的模型主键；模型版本由服务端固定。 */
      modelId: number;
    }

    /** 随最终提交冻结的完整采集属性；不由 SDK 补默认值。 */
    export interface Measurement {
      /** 客户端自报的采集方式。 */
      captureMethod: 'fingertip' | 'fingertip_chest';
      /** 客户端自报的主动采集来源。 */
      captureMode: 'active';
      /** 原生正式窗口的实际整数毫秒时长。 */
      durationMs: number;
    }

    /** 草稿最终提交请求；后端兼容不传请求体。 */
    export interface SubmitTaskRequest {
      /** 可选完整采集属性；null 或缺席表示未知。 */
      measurement?: Measurement | null;
      /** 客户端自报的任务留档元数据；null 或缺席表示未提供。 */
      clientMetadata?: Record<string, unknown> | null;
    }


    /** React Native 本地文件引用；不把文件内容读入 JavaScript 字符串。 */
    export interface TaskInputFileReference {
      /** 文件 URI 或本地绝对路径。 */
      uri: string;
      /** multipart 文件名。 */
      name: string;
      /** multipart 媒体类型。 */
      type: string;
    }

    /** 上传单个任务输入的请求；逻辑名与文件引用分别发送。 */
    export interface UploadTaskInputRequest {
      /** 必须匹配模型声明的输入逻辑名。 */
      logicalName: string;
      /** 本次上传的文件引用。 */
      file: TaskInputFileReference;
    }
  }
}
