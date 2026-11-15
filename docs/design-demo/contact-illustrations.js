/** 指尖与血压检测共用的持机、后摄覆盖及贴胸操作插画。 */
import { chestFrontReference, chestSideReference } from './chest-reference-illustrations.js';

/** 共用后摄与持机轮廓；切换示意仅移动手指，不表达前后摄切换。 */
export function rearCameraIllustration(id, switching = false) {
  return `<svg class="finger-step-art${switching ? ' finger-switch-art' : ''}" viewBox="${switching ? '15 0 95 128' : '15 0 80 128'}" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="${id}-skin" x1="440" y1="400" x2="700" y2="1540" gradientUnits="userSpaceOnUse"><stop stop-color="var(--illustration-skin-light)"/><stop offset="1" stop-color="var(--illustration-skin)"/></linearGradient>
        <linearGradient id="${id}-phone" x2="1" y2="1"><stop stop-color="var(--illustration-teal-light)"/><stop offset="1" stop-color="var(--mint)"/></linearGradient>
      </defs>
      <ellipse cx="56" cy="122" rx="30" ry="3" fill="var(--brand-subtle)"/>
      <g transform="translate(18 -8) scale(.075)">
        <rect x="224" y="258" width="632" height="1200" rx="100" fill="var(--surface)"/>
        <rect x="235" y="270" width="610" height="1180" rx="90" fill="url(#${id}-phone)" stroke="var(--illustration-camera-rim)" stroke-width="13"/>
        <rect x="350" y="350" width="390" height="390" rx="110" fill="var(--illustration-camera-rim)"/>
        <g fill="var(--illustration-camera)" stroke="var(--illustration-blue-light)" stroke-width="12"><circle cx="450" cy="450" r="55"/><circle cx="620" cy="480" r="55"/><circle cx="450" cy="620" r="55"/><circle cx="620" cy="620" r="55"/></g>
        <rect x="534" y="400" width="22" height="50" rx="11" fill="var(--illustration-flash)" stroke="var(--surface)" stroke-width="7"/>
        <circle class="${switching ? 'finger-switch-source' : 'finger-cover-feedback'}" cx="450" cy="450" r="90" stroke="var(--primary)" stroke-width="20"/>
        ${switching ? `<circle class="finger-switch-target" cx="620" cy="480" r="90" stroke="var(--primary)" stroke-width="20"/>
        <path class="finger-switch-arrow" d="M490 320Q590 255 675 365m-58-13 58 13-12-58" stroke="var(--action)" stroke-width="18" stroke-linecap="round" stroke-linejoin="round"/>` : ''}
        <g class="${switching ? 'finger-switch-hand' : 'finger-back-hand'}">
          <path d="M110 1568c20-178 11-348 25-478 4-80 55-125 80-195 10-37 26-65 38-56 21 19 5 127 27 264 41-106 64-214 75-345l38-264c8-65 17-113 59-117 45-5 69 33 69 91l-8 387c-1 64 22 96 51 96 38-2 69-30 105-72l86-116c35-63 60-141 78-197 13-32 39-16 54 16 44 78 37 172-5 279 53 23 97 121 63 180 8 77-45 139-81 206-33 53-74 91-91 163l-42 158Z" fill="url(#${id}-skin)" stroke="var(--surface)" stroke-width="24" stroke-linejoin="round"/>
          <rect x="431" y="394" width="70" height="95" rx="32" fill="var(--illustration-skin-light)" transform="rotate(-5 466 442)"/>
        </g>
      </g>
    </svg>`;
}

/** 背面沿用功能页的持机轮廓，正面补充稳定握持；插图不代表实时采集状态。 */
export const fingertipInstructions = `<div class="finger-guidance" id="finger-guidance" role="group" aria-label="第 1 页，共 2 页：流程说明">
  <figure class="finger-step">
    ${rearCameraIllustration('guide-back')}
    <figcaption><h2>轻覆后置镜头</h2><p>指腹轻放，不要按压</p></figcaption>
  </figure>
  <figure class="finger-step">
    <svg class="finger-step-art" viewBox="15 0 80 128" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="guide-front-skin" x1="34" y1="54" x2="80" y2="120" gradientUnits="userSpaceOnUse"><stop stop-color="var(--illustration-skin-light)"/><stop offset="1" stop-color="var(--illustration-skin)"/></linearGradient>
        <linearGradient id="guide-front-phone" x2="1" y2="1"><stop stop-color="var(--illustration-teal-light)"/><stop offset="1" stop-color="var(--mint)"/></linearGradient>
      </defs>
      <ellipse cx="56" cy="122" rx="30" ry="3" fill="var(--brand-subtle)"/>
      <path d="M42 119c-2-9-16-18-16-29v-4c0-5 5-7 9-3l7 5 21-5c12-3 22 0 22 10 0 10-6 18-10 26Z" fill="url(#guide-front-skin)" stroke="var(--surface)" stroke-width="2" stroke-linejoin="round" transform="translate(120 0) scale(-1 1)"/>
      <path d="M26 86V72c0-8 8-9 10-2l5 18c2 7 1 12-2 17" fill="url(#guide-front-skin)" stroke="var(--surface)" stroke-width="2" stroke-linecap="round" transform="translate(120 0) scale(-1 1)"/>
      <rect x="33" y="12" width="54" height="96" rx="9" fill="var(--surface)"/>
      <rect x="35" y="14" width="50" height="92" rx="8" fill="url(#guide-front-phone)" stroke="var(--illustration-camera-rim)" stroke-width="1"/>
      <rect x="38" y="17" width="44" height="86" rx="6" fill="var(--surface)"/>
      <rect x="50" y="20" width="20" height="4" rx="2" fill="var(--illustration-camera)"/>
      <circle cx="60" cy="57" r="15" fill="var(--brand-subtle)"/>
      <circle class="finger-front-feedback" cx="60" cy="57" r="18" stroke="var(--primary)" stroke-width="2" stroke-dasharray="83 30" transform="rotate(-90 60 57)"/>
      <path d="M52 80h16m-12 5h8" stroke="var(--illustration-camera-rim)" stroke-width="2" stroke-linecap="round"/>
      <g fill="url(#guide-front-skin)" stroke="var(--surface)" stroke-width="1.6" transform="translate(120 0) scale(-1 1)">
        <rect x="80" y="58" width="12" height="18" rx="6" transform="rotate(12 86 67)"/>
        <rect x="80" y="75" width="12" height="17" rx="6" transform="rotate(12 86 83.5)"/>
        <rect x="78" y="91" width="12" height="15" rx="6" transform="rotate(12 84 98.5)"/>
      </g>
    </svg>
    <figcaption><h2>正面稳住手机</h2><p>自然呼吸，保持稳定</p></figcaption>
  </figure>
</div>`;

/** 直接使用参考动图提取的逐帧轮廓，不另行拼画手部或改变持机角度。 */
export const chestInstructions = `<div class="finger-guidance chest-guidance" id="chest-guidance" role="group" aria-label="第 2 页，共 2 页：手机贴靠胸口" inert>
  <figure class="finger-step">
    ${chestSideReference}
    <figcaption><h2>正手持机，轻贴胸口</h2><p>保持覆盖，缓缓移近</p></figcaption>
  </figure>
  <figure class="finger-step">
    ${chestFrontReference}
    <figcaption><h2>贴靠左侧胸口</h2><p>手指不离镜头，保持稳定</p></figcaption>
  </figure>
</div>`;
