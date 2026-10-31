/** 定义应用共用的浅色设计令牌、控件角色与平台表面层级。 */

import { Platform } from 'react-native'
import type { ViewStyle } from 'react-native'

/** 应用中性及品牌色的唯一来源。 */
export const lightTheme = {
  /** 按视觉语义组织的颜色。 */
  colors: {
    /** 品牌识别、渐变与控件状态。 */
    brand: {
      /** 品牌主色。 */
      primary: '#0AB6C0',
      /** 品牌渐变起点与终点。 */
      gradient: { start: '#0AB6C0', end: '#2BC7A0' },
      /** 主要操作及处理中状态。 */
      action: '#087D83',
      /** 主要操作按压状态。 */
      pressed: '#075E62',
      /** 品牌浅色背景。 */
      subtle: '#E5F7F6',
    },
    /** 页面、内容与次级表面。 */
    surface: {
      /** 页面画布。 */
      canvas: '#F8F8F8',
      /** 默认内容表面。 */
      default: '#FFFFFF',
      /** 次级内容表面。 */
      subtle: '#F0F0F0',
    },
    /** 边界及文字颜色。 */
    border: { default: '#E6E6E6' },
    text: {
      /** 主要正文。 */
      primary: '#262626',
      /** 次要正文。 */
      secondary: '#595959',
      /** 辅助及禁用文字。 */
      muted: '#666666',
    },
    /** 仅用于明确评估状态的颜色。 */
    status: {
      /** 未评估或无数据。 */
      unknown: '#666666',
      /** 处理中。 */
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
    /** 按生理领域固定使用的指标图标颜色。 */
    metricDomain: {
      /** 心率与血压。 */
      circulation: '#A64D63',
      /** 呼吸率与血氧饱和度。 */
      respiratory: '#2E6F91',
      /** 糖尿病风险筛查。 */
      screening: '#087D83',
    },
  },
  /** 系统字体的字号、行高和字重。 */
  typography: {
    /** 字号级别。 */
    size: { xs: 12, sm: 14, md: 16, lg: 18, xl: 20, xxl: 24, display: 32 },
    /** 与字号一一对应的行高。 */
    lineHeight: { xs: 16, sm: 20, md: 24, lg: 24, xl: 28, xxl: 32, display: 40 },
    /** 系统字体字重。 */
    weight: { regular: '400', medium: '500', semibold: '600', bold: '700' },
    /** 重点数字使用等宽数字。 */
    numericVariant: ['tabular-nums'] as const,
  },
  /** 以 dp 表示的间距刻度。 */
  spacing: { xxs: 4, xs: 8, sm: 12, md: 16, lg: 20, xl: 24, xxl: 32, xxxl: 40, xxxxl: 48 },
  /** 以 dp 表示的圆角刻度。 */
  radius: { sm: 4, md: 8, lg: 24, pill: 9999 },
  /** Lucide 图标的统一尺寸和线宽。 */
  icon: { compact: 20, default: 24, strokeWidth: 2, touchTarget: 48 },
  /** 遵循系统减少动态效果设置的动效时长，单位为毫秒。 */
  motion: { fast: 120, standard: 220, overlay: 280 },
  /** 普通表面无阴影，浮起与浮层按平台映射一级、二级层级。 */
  surfaceElevation: {
    /** 普通表面不增加阴影或高度。 */
    base: {} satisfies ViewStyle,
    /** 一级浮起表面。 */
    raised: Platform.select<ViewStyle>({
      ios: { shadowColor: '#262626', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.12, shadowRadius: 3 },
      android: { elevation: 1 },
      default: {},
    }) ?? {},
    /** 二级浮层。 */
    overlay: Platform.select<ViewStyle>({
      ios: { shadowColor: '#262626', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.16, shadowRadius: 8 },
      android: { elevation: 2 },
      default: {},
    }) ?? {},
  },
  /** 集中定义的通用控件角色，不改变基础色板。 */
  roles: {
    /** 按钮表面和文字映射。 */
    button: {
      /** 主要按钮的默认、按压和前景颜色。 */
      primary: { background: '#087D83', pressed: '#075E62', foreground: '#FFFFFF' },
      /** 次要按钮的表面、边界和文字颜色。 */
      secondary: { background: '#FFFFFF', border: '#087D83', foreground: '#087D83' },
      /** 禁用按钮的表面和文字颜色。 */
      disabled: { background: '#F0F0F0', foreground: '#666666' },
    },
    /** 焦点边界使用品牌操作色。 */
    focusBorder: '#087D83',
    /** 普通操作错误以图标和文案表达，不借用评估状态色。 */
    error: { icon: '#262626', title: '#262626', description: '#262626' },
    /** 仅作内容分隔，不单独表达交互边界。 */
    divider: '#E6E6E6',
  },
} as const

/** 由令牌对象推导的 styled-components 主题类型。 */
export type AppTheme = typeof lightTheme
