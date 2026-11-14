/** 定义以健康与功能页为基准的浅色视觉令牌及平台映射。 */

import { Platform } from 'react-native'
import type { ViewStyle } from 'react-native'

/** 基础色、装饰色、操作反馈和健康评估分别表达不同语义。 */
const colors = {
  /** 品牌识别及可交互的深色前景。 */
  brand: {
    /** 品牌青。 */
    primary: '#0AB6C0',
    /** 品牌渐变端点，不保证白字达到 AA 对比度。 */
    gradient: { start: '#0AB6C0', end: '#2BC7A0' },
    /** 深青文字操作和处理中状态。 */
    action: '#087D83',
    /** 深青按压态。 */
    pressed: '#075E62',
    /** 品牌浅色表面。 */
    subtle: '#E5F7F6',
  },
  /** 插画、指标图形与背景装饰，不表达健康评估结果。 */
  accent: { rose: '#DD5D7D', roseMuted: '#A64D63', blue: '#2E6F91' },
  /** 功能插画的装饰色，不代表测量值、评估结果或账号状态。 */
  illustration: {
    /** 指尖心形的浅玫瑰高光。 */
    roseLight: '#F5A5B8',
    /** 插画中的浅薄荷表面。 */
    tealLight: '#A0EAD5',
    /** 插画中的浅蓝高光。 */
    blueLight: '#A0DFEF',
    /** 人像插画的肤色高光。 */
    skinLight: '#FFE0C4',
    /** 人像插画的基础肤色。 */
    skin: '#EEB38B',
    /** 人像插画的线条色。 */
    outline: '#B57865',
    /** 人像插画的头发色。 */
    hair: '#70546B',
    /** 指尖插画中的镜头暗色。 */
    camera: '#203F59',
    /** 指尖插画中的镜头边缘色。 */
    cameraRim: '#508D9A',
    /** 指尖插画中的闪光高光。 */
    flash: '#FFD363',
  },
  /** 通用操作反馈；与健康评估色相互独立。 */
  feedback: { success: '#16836B', error: '#C54868', loading: '#087D83', information: '#2E6F91' },
  /** 页面及内容表面；card 末两位为透明度，preview 是不代表相机已启动的取景底色。 */
  surface: { canvas: '#F8F8F8', default: '#FFFFFF', subtle: '#F0F0F0', card: '#FFFFFFED', preview: '#000000' },
  /** 中性边界，不单独表达状态。 */
  border: { default: '#E6E6E6' },
  /** 主要、次要及辅助文字。 */
  text: { primary: '#262626', secondary: '#595959', muted: '#666666' },
  /** 仅用于服务端或明确规则已确认的评估结果，不由图标或原始数值推断。 */
  status: {
    /** 未评估或无数据。 */
    unknown: '#666666',
    /** 正在评估。 */
    pending: '#087D83',
    /** 明确处于目标范围。 */
    inRange: '#2E6B55',
    /** 明确需要关注。 */
    attention: '#8A5D0B',
    /** 明确超出范围或风险偏高。 */
    outOfRange: '#B33A43',
    /** 明确严重状态。 */
    critical: '#7D1F2B',
  },
} as const

/** 线性渐变以 CSS 角度表示，0 度向上、顺时针增加；位置范围为 0–1。 */
const gradients = {
  /** 主按钮沿用已确认的品牌渐变。 */
  button: { angle: 105, colors: [colors.brand.gradient.start, colors.brand.gradient.end], locations: [0, 1] },
  /** 退出等危险操作沿用 Demo 的错误色至玫红渐变。 */
  dangerButton: { angle: 105, colors: [colors.feedback.error, colors.accent.rose], locations: [0, 1] },
  /** 健康主卡的白色到浅青表面。 */
  healthCard: { angle: 120, colors: ['#FFFFFFF5', '#E5F7F6EB'], locations: [0, 1] },
  /** 功能卡的 84% 白、76% 白、76% 浅青表面。 */
  functionCard: { angle: 120, colors: ['rgba(255,255,255,0.84)', 'rgba(255,255,255,0.76)', 'rgba(229,247,246,0.76)'], locations: [0, 0.6, 1] },
} as const

/** 背景层半径通常以 dp 表示；开屏配方改用视口宽高比例。 */
const backgrounds = {
  /** 健康页的四层柔和径向渐变。 */
  home: {
    base: colors.surface.canvas,
    /** center 为相对页面宽高的坐标，可超出 0–1；radius 为椭圆半径，单位 dp。 */
    layers: [
      { color: '#0AB6C04D', center: { x: -0.1, y: 0 }, radius: { x: 320, y: 300 } },
      { color: '#2E6F9130', center: { x: 1.1, y: 0.08 }, radius: { x: 300, y: 350 } },
      { color: '#A64D6329', center: { x: 1.05, y: 0.57 }, radius: { x: 280, y: 330 } },
      { color: '#2BC7A02E', center: { x: -0.2, y: 0.92 }, radius: { x: 300, y: 300 } },
    ],
  },
  /** 功能页的三层柔和径向渐变。 */
  functions: {
    base: colors.surface.canvas,
    /** 坐标及半径语义与健康页相同。 */
    layers: [
      { color: '#2E6F9138', center: { x: 1, y: -0.05 }, radius: { x: 350, y: 350 } },
      { color: '#0AB6C035', center: { x: -0.2, y: 0.35 }, radius: { x: 320, y: 400 } },
      { color: '#A64D632B', center: { x: 1.05, y: 0.8 }, radius: { x: 300, y: 350 } },
    ],
  },
  /** 用户中心的玫瑰、薄荷与蓝色散射光。 */
  account: {
    base: colors.surface.canvas,
    layers: [
      { color: '#2BC7A040', center: { x: -0.1, y: 0 }, radius: { x: 350, y: 350 } },
      { color: '#A64D6326', center: { x: 1.1, y: 0.3 }, radius: { x: 300, y: 400 } },
      { color: '#2E6F9128', center: { x: 0, y: 0.9 }, radius: { x: 300, y: 350 } },
    ],
  },
  /** 认证页在品牌青、蓝与玫瑰色之间保持低对比渐变。 */
  auth: {
    base: colors.surface.canvas,
    layers: [
      { color: '#0AB6C03B', center: { x: -0.15, y: 0.08 }, radius: { x: 320, y: 350 } },
      { color: '#2E6F912B', center: { x: 1.1, y: 0.15 }, radius: { x: 300, y: 380 } },
      { color: '#A64D6322', center: { x: 1.05, y: 0.7 }, radius: { x: 320, y: 320 } },
      { color: '#2BC7A02E', center: { x: -0.1, y: 0.95 }, radius: { x: 300, y: 320 } },
    ],
  },
  /** 与设计 Demo 一致的右上青色和左下薄荷色柔光。 */
  startup: {
    base: colors.surface.default,
    layers: [
      { color: '#0AB6C01A', center: { x: 1, y: 0 }, radius: { x: 0.92, y: 0.92 } },
      { color: '#2BC7A01C', center: { x: 0, y: 1 }, radius: { x: 0.92, y: 0.92 } },
    ],
  },
} as const

/** 系统文字角色；size 和 lineHeight 单位为 dp，fontWeight 为系统字重。 */
const typography = {
  size: { xs: 12, sm: 14, md: 16, lg: 18, xl: 20, xxl: 24, display: 32 },
  lineHeight: { xs: 16, sm: 20, md: 24, lg: 24, xl: 28, xxl: 32, display: 40 },
  weight: { regular: '400', medium: '500', semibold: '600', bold: '700' },
  numericVariant: ['tabular-nums'] as const,
  /** 角色不覆盖所有局部排版；紧凑标题等特例仍由组件选择刻度。 */
  roles: {
    pageTitle: { fontSize: 24, lineHeight: 32, fontWeight: '600' },
    sectionTitle: { fontSize: 18, lineHeight: 24, fontWeight: '600' },
    body: { fontSize: 16, lineHeight: 24, fontWeight: '400' },
    label: { fontSize: 14, lineHeight: 20, fontWeight: '500' },
    caption: { fontSize: 12, lineHeight: 18, fontWeight: '400' },
    metric: { fontSize: 32, lineHeight: 40, fontWeight: '600' },
  },
} as const

/** 应用共用的浅色主题；Demo 仅映射这些值，不导入 React Native。 */
export const lightTheme = {
  colors,
  gradients,
  backgrounds,
  typography,
  /** 以 dp 表示的通用间距刻度。 */
  spacing: { xxs: 4, xs: 8, sm: 12, md: 16, lg: 20, xl: 24, xxl: 32, xxxl: 40, xxxxl: 48 },
  /** 页面及卡片布局角色，窄屏阈值与 Demo 一致。 */
  layout: { narrowMaxWidth: 359, pageGutter: 24, pageGutterNarrow: 16, cardPadding: 16, cardPaddingCompact: 14, homeBottom: 20, homeBottomNarrow: 12, onboardingContentInset: 36, onboardingHeroStageHeight: 152, onboardingProgressGap: 6, permissionRowPadding: 18, permissionDescriptionGap: 6 },
  /** 卡片、弹窗和 Toast 统一使用 lg，按钮使用 pill。 */
  radius: { sm: 4, md: 8, lg: 22, pill: 9999 },
  /** 通用线性操作图标；业务和反馈图标可采用面性图形。 */
  icon: { compact: 20, default: 24, strokeWidth: 2, touchTarget: 48 },
  /** 时长单位毫秒；旋转动画应遵循减少动态效果设置。 */
  motion: { fast: 120, standard: 220, overlay: 280, loadingCycle: 900 },
  /** 平台阴影：无阴影、普通卡片、浮层分别使用独立语义。 */
  surfaceElevation: {
    base: {} satisfies ViewStyle,
    raised: Platform.select<ViewStyle>({
      ios: { shadowColor: colors.text.primary, shadowOffset: { width: 2, height: 4 }, shadowOpacity: 0.065, shadowRadius: 12 },
      // Android 9+ 用 boxShadow 精确映射 Demo，旧 API 回退到原生 elevation。
      android: Number(Platform.Version) >= 28
        ? { boxShadow: '2px 4px 12px rgba(38,38,38,0.065)' }
        : { elevation: 2, shadowColor: '#26262610' },
      web: { boxShadow: '2px 4px 12px rgba(38,38,38,0.065)' },
      default: {},
    }) ?? {},
    overlay: Platform.select<ViewStyle>({
      ios: { shadowColor: colors.text.primary, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.12, shadowRadius: 28 },
      android: { elevation: 4, shadowColor: colors.text.primary },
      web: { boxShadow: '0 8px 28px rgba(38,38,38,0.12)' },
      default: {},
    }) ?? {},
  },
  /** 共享控件角色：不以健康评估颜色表示普通操作状态。 */
  roles: {
    button: {
      /** background 是纯色基础层，渐变层由按钮实际渲染。 */
      primary: { background: colors.brand.primary, gradient: gradients.button, pressed: colors.brand.pressed, foreground: colors.surface.default },
      /** 用于退出等会离开当前账号的危险操作。 */
      danger: { background: colors.feedback.error, gradient: gradients.dangerButton, foreground: colors.surface.default },
      secondary: { background: colors.surface.default, border: colors.brand.action, foreground: colors.brand.action },
      disabled: { background: colors.surface.subtle, foreground: colors.text.muted },
    },
    /** 反馈浮层统一白底，正文中性，状态色仅用于图形。 */
    feedback: { background: colors.surface.default, border: colors.border.default, foreground: colors.text.primary },
    focusBorder: colors.brand.action,
    /** 错误图标及输入边界使用操作错误色，标题说明保持中性。 */
    error: { icon: colors.feedback.error, title: colors.text.primary, description: colors.text.primary },
    divider: colors.border.default,
  },
} as const

/** 由令牌对象推导的 styled-components 主题类型。 */
export type AppTheme = typeof lightTheme
