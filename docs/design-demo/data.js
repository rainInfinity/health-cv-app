/** 只读演示数据；与真实账户、设备采集及医疗判断无关。 */
export const tokens = {
  brand: { primary: '#0AB6C0', gradientEnd: '#2BC7A0', action: '#087D83', subtle: '#E5F7F6' },
  text: { primary: '#262626', secondary: '#595959', muted: '#666666' },
  surface: { canvas: '#F8F8F8', default: '#FFFFFF', subtle: '#F0F0F0' },
  border: '#E6E6E6',
  status: { low: '#B33A43', attention: '#8A5D0B', inRange: '#2E6B55' },
};

/** 页面标识及中文导航名。 */
export const routes = {
  home: '健康', functions: '功能', history: '历史', account: '我的',
  login: '登录', register: '注册', desktop: '桌面', welcome: '开屏', onboarding: '功能引导', privacy: '授权引导',
  'measure-face': '面部特征检测', 'measure-fingertip': '指尖脉搏检测', 'measure-chest': '血压检测',
  'face-measurement': '面部心率检测',
  'fingertip-measurement': '指尖检测',
};

/** 固定时间序列，以实际日期过滤；空数组表示暂无样例。 */
export const records = [
  { key: 'bp', name: '血压', title: '血压测量', unit: 'mmHg', labels: ['收缩压', '舒张压'], domain: [60, 90, 120, 150], values: [[124,120,126,122,119,121,118],[81,78,82,79,76,79,76]], description: '相机检测方式的血压估计结果。仅供健康管理参考，非医学诊断依据。' },
  { key: 'heart', name: '心率', title: '心率', unit: '次/分', labels: ['心率'], domain: [50, 70, 90, 110], values: [[78,74,80,76,70,75,72]], description: '每分钟心跳次数。样例最近一条来源为主动式；实际来源应随记录展示。' },
  { key: 'breath', name: '呼吸', title: '呼吸率', unit: '次/分', labels: ['呼吸率'], domain: [8, 12, 16, 20], values: [[17,16,18,15,16,17,16]], description: '每分钟呼吸次数。演示图形不是实时呼吸信号。' },
  { key: 'oxygen', name: '血氧', title: '血氧饱和度', unit: '%', labels: ['血氧'], domain: [85, 90, 95, 100], values: [[97,98,97,99,98,97,98]], description: '血氧百分比。仪表量程 85–100%，共15格，红、黄、绿显示区间仅用于本轮视觉演示。' },
  { key: 'risk', name: '风险', title: '糖尿病风险', unit: '', labels: [], domain: [], values: [], description: '当前没有风险评估样例，不生成分数或等级；不作为糖尿病确诊依据。' },
];

/** 演示记录时间，不随着浏览器日期漂移。 */
export const dates = Array.from({ length: 7 }, (_, index) => '2026-10-' + (25 + index));

/** 各测量方式的最近样例时间；沿用历史最后一天的 08:30，时区为北京时间。 */
const latestSampleAt = `${dates.at(-1)}T08:30:00+08:00`;

/** 功能页按方式独立读取时间；null 表示该方式没有演示记录。 */
export const lastMeasurements = {
  fingertip: latestSampleAt, // 现有主动心率、呼吸率样例归入指尖联合采集。
  face: null, // 面部心率没有独立样例，不复用指尖时间。
  bp: latestSampleAt, // 血压最近一条样例。
  oxygen: latestSampleAt, // 血氧最近一条样例。
  risk: null, // 尚无风险评估样例。
};
