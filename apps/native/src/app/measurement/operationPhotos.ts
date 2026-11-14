/** 按页面显示面积选择操作照片，保留原图作为缩放资源的生成来源。 */

/** 三种检测方式的卡片缩略图和引导页图片，尺寸单位为像素。 */
export const OPERATION_PHOTOS = {
  /** 面部操作：卡片 480×480，引导 828×828。 */
  face: {
    card: require('../../../assets/op3-card.png'),
    guide: require('../../../assets/op3-guide.png'),
  },
  /** 指尖操作：卡片 480×480，引导 828×828。 */
  fingertip: {
    card: require('../../../assets/op1-card.png'),
    guide: require('../../../assets/op1-guide.png'),
  },
  /** 贴胸操作：卡片 480×480，引导 828×828。 */
  chest: {
    card: require('../../../assets/op2-card.png'),
    guide: require('../../../assets/op2-guide.png'),
  },
} as const
