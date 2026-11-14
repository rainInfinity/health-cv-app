/** 三种检测前说明页；展示检测方式与准备动作，不启动设备采集或绑定指标。 */

/** 绘制统一的线性准备提示图标。 */
function preparationIcon(path) {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;
}

/** 生成非对称长弧，叠加缓慢起伏，避免等距重复产生机械感。 */
function waterArc(radius, startAngle, sweep, phase) {
  const points = Array.from({ length: 97 }, (_, index) => {
    const progress = index / 96;
    const angle = (startAngle + progress * sweep) * Math.PI / 180;
    const wave = Math.sin(progress * Math.PI) * (
      1.6 * Math.sin(progress * Math.PI * 2.6 + phase)
      + .8 * Math.sin(progress * Math.PI * 5 + phase)
    );
    return {
      x: (180 + (radius + wave) * Math.cos(angle)).toFixed(2),
      y: (180 + (radius + wave) * Math.sin(angle)).toFixed(2),
    };
  });
  return {
    path: points.map(({ x, y }, index) => `${index ? 'L' : 'M'}${x} ${y}`).join(' '),
    start: points[0],
    end: points.at(-1),
  };
}

/** 两条错位水纹共用几何，端点渐隐蒙版由各页面独立命名。 */
const waterWaves = [
  waterArc(149, -124, 286, 0),
  waterArc(156, -18, 248, 1.8),
];

/** 照片与花边共享坐标系，保证任意屏幕比例下都保持正圆。 */
function operationPhoto(kind, guide) {
  return `<svg viewBox="0 0 360 360" role="img" aria-labelledby="guide-photo-title-${kind}">
    <title id="guide-photo-title-${kind}">${guide.imageAlt}</title>
    <defs>
      <clipPath id="guide-photo-clip-${kind}"><circle cx="180" cy="180" r="138"/></clipPath>
      <radialGradient id="guide-water-fade-${kind}"><stop offset="0" stop-color="black"/><stop offset=".2" stop-color="black"/><stop offset="1" stop-color="white"/></radialGradient>
      ${waterWaves.map((wave, index) => `<mask id="guide-water-mask-${kind}-${index}" maskUnits="userSpaceOnUse" x="0" y="0" width="360" height="360">
        <rect width="360" height="360" fill="white"/>
        <circle cx="${wave.start.x}" cy="${wave.start.y}" r="24" fill="url(#guide-water-fade-${kind})"/>
        <circle cx="${wave.end.x}" cy="${wave.end.y}" r="24" fill="url(#guide-water-fade-${kind})"/>
      </mask>`).join('')}
    </defs>
    <circle cx="180" cy="180" r="143" fill="var(--surface)"/>
    <image href="/brand-assets/${guide.image}" x="42" y="42" width="276" height="276" preserveAspectRatio="xMidYMid slice" clip-path="url(#guide-photo-clip-${kind})"/>
    <circle cx="180" cy="180" r="143" fill="none" stroke="var(--primary)" stroke-opacity=".5" stroke-width="1"/>
    <g fill="none" stroke="var(--primary)" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${waterWaves.map((wave, index) => `<path d="${wave.path}" stroke-width="${index ? 1.2 : 1.6}" stroke-opacity="${index ? .18 : .32}" mask="url(#guide-water-mask-${kind}-${index})"/>`).join('')}</g>
  </svg>`;
}

/** 每种方式的单行标题和准备动作，不宣称时长、准确率或医学认证。 */
const guides = {
  face: {
    name: '面部特征检测',
    description: '面向前摄，让整张脸自然入镜。',
    image: 'op3.png', imageAlt: '面对手机前置相机，面部无遮挡，自然平视屏幕。',
    steps: [
      ['<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>', '光线均匀', '避免逆光'],
      ['<path d="M8 3H3v5m13-5h5v5M3 16v5h5m8 0h5v-5"/><ellipse cx="12" cy="11" rx="4" ry="5"/><path d="M7 19q5-4 10 0"/>', '完整入镜', '正对前摄'],
      ['<path d="M8 4v4m8-4v4M5 11h14M7 15q5 5 10 0M3 3v18m18-18v18"/>', '自然静止', '不要说话'],
    ],
  },
  fingertip: {
    name: '指尖脉搏检测',
    description: '轻覆后置镜头，保持指尖与手机稳定。',
    image: 'op1.png', imageAlt: '食指指腹覆盖手机后置摄像头，其他手指自然握稳手机。',
    steps: [
      ['<rect x="5" y="2" width="14" height="20" rx="3"/><circle cx="9" cy="6" r="1.5"/><path d="M10 16V9a2 2 0 0 1 4 0v5m0-2 3 1"/>', '覆盖后摄', '后置镜头'],
      ['<path d="M8 13V6a2 2 0 0 1 4 0v6m0-2 5 2a3 3 0 0 1 2 3v3a3 3 0 0 1-3 3h-5l-6-6a2 2 0 0 1 3-3l2 2M3 4l2 2m12-2-2 2"/>', '轻放指尖', '不要用力'],
      ['<path d="M4 8V4h4m8 0h4v4M4 16v4h4m8 0h4v-4M8 12h8m-4-4v8"/>', '保持稳定', '手臂支撑'],
    ],
  },
  chest: {
    name: '血压检测',
    description: '手指不离开镜头，手机轻贴胸口。',
    image: 'op2.png', imageAlt: '指腹保持覆盖后置摄像头，同时将手机贴近胸口。',
    steps: [
      ['<rect x="5" y="2" width="14" height="20" rx="3"/><circle cx="9" cy="6" r="1.5"/><path d="M10 16V9a2 2 0 0 1 4 0v5m0-2 3 1"/>', '覆盖后摄', '后置镜头'],
      ['<circle cx="12" cy="5" r="3"/><path d="M4 21v-6a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v6"/><rect x="10" y="12" width="6" height="8" rx="1"/>', '贴近胸口', '轻贴胸口'],
      ['<path d="M4 8V4h4m8 0h4v4M4 16v4h4m8 0h4v-4M8 12h8m-4-4v8"/>', '稳定持机', '自然呼吸'],
    ],
  },
};

/** 生成单屏说明结构，返回入口与开始动作由统一事件分发处理。 */
function measurementPage(kind, guide) {
  return `<div class="phone measurement-guide" data-guide="${kind}">
  <div class="status"><span>9:41</span><span class="system" aria-hidden="true">▮▮▮ ▰</span></div>
  <header class="guide-topbar">
    <button type="button" class="guide-back" data-action="measurement-back" aria-label="返回上一页">${preparationIcon('<path d="m15 18-6-6 6-6"/>')}</button>
    <span>检测准备</span><img src="/brand-assets/xinmu-logo.svg" width="28" height="28" alt="心沐">
  </header>
  <main class="guide-main">
    <div class="guide-copy"><h1 tabindex="-1">${guide.name}</h1><p>${guide.description}</p></div>
    <figure class="guide-visual">${operationPhoto(kind, guide)}<figcaption class="guide-disclaimer">非医疗设备检测结果仅供参考，请勿用于医疗诊断</figcaption></figure>
    <section class="guide-preparation" aria-label="检测前准备"><ol><li>${preparationIcon('<path d="m11 4-5 4H3v8h3l5 4V4Z"/><path d="M15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>')}<h2>打开声音</h2><p>听取引导</p></li>${guide.steps.map(([path, title, description]) => `<li>${preparationIcon(path)}<h2>${title}</h2><p>${description}</p></li>`).join('')}</ol></section>
    <footer class="guide-footer"><label class="guide-skip"><input type="checkbox" data-skip-guide="${kind}"><span>以后不再提示</span></label><button type="button" class="cta" data-action="measurement-preview">开始检测</button></footer>
  </main>
  <div class="gesture"></div>
  </div>`;
}

/** 可直接预览的三个独立 hash 页面。 */
export const measurementPages = Object.fromEntries(
  Object.entries(guides).map(([kind, guide]) => [`measure-${kind}`, measurementPage(kind, guide)]),
);
