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
  'fingertip-results': '指尖详细结果',
  'blood-pressure-measurement': '血压检测',
  'blood-pressure-results': '血压详细结果',
};

/** 只映射既有档位；默认两行，详细结果使用单行，不由概率推算或补造评估。 */
export function formatRiskLevel(level, stacked = true) {
  switch (level) {
    case 0: return stacked ? '较低\n风险' : '较低风险';
    case 1: return stacked ? '中\n风险' : '中风险';
    case 2: return stacked ? '较高\n风险' : '较高风险';
    default: return '--';
  }
}

/** 固定时间序列，以实际日期过滤；空数组表示暂无样例。 */
export const records = [
  { key: 'bp', name: '血压', title: '血压测量', unit: 'mmHg', labels: ['收缩压', '舒张压'], domain: [60, 90, 120, 150], values: [[132,130,134,131,129,128,130,127,126,129,128,126,125,127,124,126,125,123,126,124,125,122,124,123,124,120,126,122,119,121,118,119],[86,84,87,85,83,84,82,81,83,82,84,81,80,82,81,79,80,78,81,79,80,78,79,80,81,78,82,79,76,79,76,77]], description: '相机检测方式的血压估计结果。仅供健康管理参考，非医学诊断依据。' },
  { key: 'heart', name: '心率', title: '心率', unit: '次/分', labels: ['心率'], domain: [50, 70, 90, 110], values: [[83,81,85,82,80,79,82,78,80,79,81,77,78,80,76,79,77,75,78,76,79,75,77,76,78,74,80,76,70,75,72,74]], description: '每分钟心跳次数。样例最近一条来源为主动式；实际来源应随记录展示。' },
  { key: 'breath', name: '呼吸', title: '呼吸率', unit: '次/分', labels: ['呼吸率'], domain: [8, 12, 16, 20], values: [[18,17,19,18,17,18,16,17,18,17,19,18,17,16,18,17,16,17,18,16,17,15,16,17,17,16,18,15,16,17,16,16]], description: '每分钟呼吸次数。演示图形不是实时呼吸信号。' },
  { key: 'oxygen', name: '血氧', title: '血氧饱和度', unit: '%', labels: ['血氧'], domain: [85, 90, 95, 100], values: [[96,97,96,98,97,98,96,97,98,97,99,98,97,98,99,97,98,96,98,99,97,98,99,98,97,98,97,99,98,97,98,99]], description: '血氧百分比。仪表量程 85–100%，共15格，红、黄、绿显示区间仅用于本轮视觉演示。' },
  { key: 'risk', name: '风险', title: '糖尿病风险', unit: '', labels: [], domain: [], values: [], description: '当前没有风险评估样例，不生成分数或等级；不作为糖尿病确诊依据。' },
];

/** 固定覆盖十月整月及11月1日的跨月记录，每日 08:30 一条，不随浏览器日期漂移。 */
export const dates = Array.from({ length: 32 }, (_, index) => new Date(Date.UTC(2026, 9, index + 1)).toISOString().slice(0, 10));

