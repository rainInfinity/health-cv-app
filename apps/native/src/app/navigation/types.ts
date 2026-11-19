/** 定义产品根栈、产品 Tab 与开发验证子栈的稳定路由契约。 */

import type { NavigatorScreenParams } from '@react-navigation/native'

/** 可从产品首页查看的只读健康指标详情。 */
export type HealthMetric =
  | 'bloodPressure'
  | 'heartRate'
  | 'respirationRate'
  | 'oxygenSaturation'
  | 'faceHeartRate'
  | 'diabetesRisk'

/** 产品准备动作对应的检测部位，不表示指标已接入。 */
export type MeasurementMethod = 'face' | 'fingertip' | 'chest'

/** 引导携带的有限目标；指尖部位入口可以不指定目标。 */
export type MeasurementTarget = HealthMetric | 'fingertipVitals'

/** 准备与展示页面共享的入口上下文。 */
export interface MeasurementRouteParams {
  /** 准备动作对应的部位。 */
  method: MeasurementMethod
  /** 可选的指标说明目标，不控制真实算法。 */
  target?: MeasurementTarget
}

/** 开发 Tab 内保留的原生验证页面栈。 */
export type DevStackParamList = {
  /** 可离线访问全部本地验证能力的入口。 */
  Entry: undefined
  /** 主动 PPG 原生验证页。 */
  Acquisition: undefined
  /** 前置相机实时 RPPG 验证页。 */
  RPPG: undefined
  /** 被动 RPPG 原生验证页。 */
  PassiveCapture: undefined
  /** 独立传感器验证页。 */
  Sensors: undefined
  /** 旧语言验证页，本版仅显示中文状态。 */
  LanguageSettings: undefined
  /** 统一弹窗与 Toast 的本地预览。 */
  FeedbackPreview: undefined
}

/** 依次展示产品页并保留各自导航状态的底部 Tab。 */
export type ProductTabParamList = {
  /** 健康摘要。 */
  Home: undefined
  /** 五项健康功能说明。 */
  Features: undefined
  /** 仅作为拦截入口的历史 Tab。 */
  History: undefined
  /** 用户中心。 */
  User: undefined
  /** 可独立返回的原生开发验证栈。 */
  Dev: NavigatorScreenParams<DevStackParamList> | undefined
}

/** 开屏、引导和产品页面共用的单一根导航栈。 */
export type RootStackParamList = {
  /** 每次进程启动先呈现一次静态品牌页。 */
  Startup: undefined
  /** 设备首次启动两步功能与授权说明。 */
  Onboarding: undefined
  /** 底部产品 Tab 容器。 */
  ProductTabs: NavigatorScreenParams<ProductTabParamList> | undefined
  /** 健康指标只读详情。 */
  MetricDetail: { metric: HealthMetric }
  /** 产品检测准备；按方式复用动作及设备级偏好。 */
  MeasurementGuide: MeasurementRouteParams
  /** 显式开始后才打开真实前摄的面部心率页。 */
  FaceMeasurement: { target?: MeasurementTarget } | undefined
  /** 明确入口后准备真实后摄的指尖检测页。 */
  FingertipMeasurement: { target?: MeasurementTarget } | undefined
  /** 已释放资源的指尖本轮详情；只传轮次身份，不携带采样。 */
  FingertipResults: { captureId: string }
  /** 覆盖及 IMU 联合准入驱动的血压本地采集页。 */
  BloodPressureMeasurement: { target?: MeasurementTarget } | undefined
  /** 真实登录表单；可仅回填用户名。 */
  Login: { username?: string } | undefined
  /** 真实注册表单；可仅回填用户名。 */
  Register: { username?: string } | undefined
  /** 相机和通知权限设置。 */
  PermissionSettings: { section: 'notifications' | 'privacy' }
  /** 本版仅支持简体中文的说明。 */
  LanguageInfo: undefined
}
