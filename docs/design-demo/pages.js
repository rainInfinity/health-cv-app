/** 保存已确认的页面结构；数据与交互由 app.js 统一接管。 */

/** 登录和注册共享品牌组合，避免标志、名称或 Slogan 出现差异。 */
const authBrand = `
<header class="auth-brand">
<div class="auth-brand-row">
<img src="/brand-assets/xinmu-logo.svg" width="64" height="64" alt="">
<div class="auth-brand-copy"><h1>心沐</h1><p>关心每一次心动。</p></div>
</div>
</header>
`;

export const pages = {
  desktop: `
<div class="phone brand-desktop">
<div class="status"><span>9:41</span><span class="system" aria-hidden="true">▮▮▮ ▰</span></div>
<main class="content desktop-content">
<div class="desktop-calendar"><p>星期一</p><div class="desktop-clock">09:41</div></div>
<button type="button" class="desktop-app" data-action="navigate" data-route="welcome" aria-label="打开心沐，进入开屏">
<img src="/brand-assets/icon.png" width="72" height="72" alt="">
<span>心沐</span>
</button>
<p class="desktop-note">轻触心沐，关心每一次心动。</p>
</main>
<div class="gesture"></div>
</div>
  `,
  home: `
<div class="phone home">
<div class="status">
<span>9:41</span>
<span class="system">▮▮▮ <svg width="16" height="12" viewBox="0 0 16 12">
<path d="M1 4Q8-2 15 4M4 7q4-4 8 0M7 10h2" fill="none" stroke="currentColor" stroke-width="2">
</path>
</svg> <svg width="23" height="12" viewBox="0 0 23 12">
<rect x="1" y="1" width="18" height="10" rx="3" fill="none" stroke="currentColor">
</rect>
<rect x="3" y="3" width="14" height="6" rx="1" fill="currentColor">
</rect>
<path d="M21 4v4" stroke="currentColor" stroke-width="2">
</path>
</svg>
</span>
</div>
<main class="content">
<header class="header home-header">
<div class="home-heading">
<img class="home-logo" src="/brand-assets/xinmu-logo.svg" width="40" height="40" alt="">
<h2 class="home-brand-name">心沐</h2>
</div>
<p class="header-disclaimer">仅供健康管理参考，<br>非医学诊断依据。</p>
</header>
<section class="card revised-bp">
<div class="bp-heading">
<span>血压状态</span>
<div class="bp-detail">详情 <svg class="icon " viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
<path d="m9 6 6 6-6 6">
</path>
</svg>
</div>
</div>
<div class="bp-last">
<span>最近一次测量</span>
<time>10月31日 08:30</time>
</div>
<div class="bp-pair">
<div>
<div class="pressure-number">118 <small>mmHg</small>
</div>
<div class="pressure-label">收缩压</div>
</div>
<div>
<div class="pressure-number">76 <small>mmHg</small>
</div>
<div class="pressure-label">舒张压</div>
</div>
</div>
<button class="cta">前往测量 <svg class="icon " viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
<path d="M5 12h14m-6-6 6 6-6 6">
</path>
</svg>
</button>
</section>
<div class="sectionhead">
<h2>更多健康指标</h2>
</div>
<div class="revised-grid">
<section class="revised-metric">
<div class="revised-heading heart-heading">
<span>心率</span>
<span class="source-tag">主动式</span>
<svg class="icon jump" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
<path d="m9 6 6 6-6 6">
</path>
</svg>
</div>
<div class="lively-body">
<div class="lively-number">
<strong>72</strong>
<small>次/分</small>
</div>
<div class="lively-heart">
<div class="heart-halo">
<svg class="icon" viewBox="0 0 1024 1024" aria-hidden="true">
<circle cx="512" cy="512" r="480" fill="var(--surface)"/>
<path d="M512 992C246.905 992 32 777.095 32 512 32 246.905 246.905 32 512 32c265.095 0 480 214.905 480 480 0 265.095-214.905 480-480 480z m308.595-527.61c0-49.005-19.92-95.955-55.26-130.32-63.975-62.505-167.115-52.365-245.85 9.345-78.735-61.725-181.845-71.85-245.85-9.33a181.8 181.8 0 0 0-55.23 130.305 181.8 181.8 0 0 0 55.26 130.35L468.35 784.85a73.35 73.35 0 0 0 102.24 0l194.76-190.14a181.755 181.755 0 0 0 55.23-130.32zM738.5 361.595a143.37 143.37 0 0 1 43.65 102.795 143.37 143.37 0 0 1-43.65 102.81L543.77 757.37a34.89 34.89 0 0 1-48.525 0L300.5 567.23a143.43 143.43 0 0 1-43.65-102.84 143.4 143.4 0 0 1 43.62-102.81c50.925-49.74 139.755-37.815 206.265 21.21l12.75 11.325 12.78-11.325c66.48-59.025 155.34-70.95 206.25-21.195zM450.59 563.03l32.865 79.245c6.825 16.44 30.435 15.555 36-1.35l40.5-122.7 15.72 53.985c2.52 8.625 10.695 14.355 19.68 13.8l66.39-4.245a19.2 19.2 0 1 0-2.445-38.325l-51.015 3.24-28.74-98.595c-5.28-18.105-30.795-18.555-36.705-.63l-43.68 132.345-29.01-69.93c-6.285-15.15-27.42-15.975-34.875-1.38l-17.82 34.905h-44.25a19.2 19.2 0 1 0 0 38.415h56.025c7.23 0 13.845-4.05 17.115-10.485l4.245-8.295z m-54.405-162.39a70.455 70.455 0 0 0-70.47 70.425 19.2 19.2 0 0 0 38.43 0c0-17.67 14.34-32.01 32.04-32.01a19.2 19.2 0 1 0 0-38.4z" fill="currentColor"/>
</svg>
</div>
</div>
</div>
<time class="revised-time">10月31日 08:30</time>
</section>
<section class="revised-metric">
<div class="revised-heading">
<span>呼吸率</span>
<svg class="icon jump" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
<path d="m9 6 6 6-6 6">
</path>
</svg>
</div>
<div class="lively-body">
<div class="lively-number">
<strong>16</strong>
<small>次/分</small>
</div>
<div class="breathing-art">
<svg class="icon" viewBox="0 0 1024 1024" aria-hidden="true">
<path d="M991.72665875 511.72499A479.72148469 479.72148469 0 1 1 513.85025656 32.00350531a479.72148469 479.72148469 0 0 1 477.87640219 479.72148469z" fill="var(--metric-green)"/>
<path d="M791.90420937 465.22890781c-51.10878938-152.95735031-154.80243281-172.33071844-154.80243281-172.3307175-20.48041687-10.14795469-22.87902469-11.43951188-47.78764031 3.32114813s-18.45082594 59.41166063-17.15926875 73.80330562a166.05743719 166.05743719 0 0 1-1.10704875 22.69451625A77.67797906 77.67797906 0 0 1 532.30108344 364.11837969c0-56.82854531 7.1958225-153.69538313 7.19582156-153.69538313h-36.90165281s5.35074 90.40904906 3.69016593 150.00521813a97.9738875 97.9738875 0 0 1-33.76501218 26.01566531 131.00086688 131.00086688 0 0 1 0-17.34377719c1.29155812-13.83811969 7.93385531-58.30461094-16.97476032-73.80330562s-27.30722344-13.46910281-47.78764031-3.32114813c0 0-103.69364438 18.45082594-154.98694125 172.3307175s-45.57354094 245.39599031 6.82680563 275.10182063 151.48128469 18.45082594 189.12097031-4.61270625 26.20017375-68.45256563 25.09312313-86.71888407a403.88858813 403.88858813 0 0 1 6.64229812-76.57092937 738.03305344 738.03305344 0 0 0 1.10704969-92.25413156 48.34116469 48.34116469 0 0 1 35.42558625-20.29590844 56.64403687 56.64403687 0 0 1 45.57354094 26.38468125 707.22017344 707.22017344 0 0 0 1.10704968 85.42732594 419.20277437 419.20277437 0 0 1 6.82680563 76.57092937c-1.10704969 18.45082594-12.54656156 63.83985937 25.09312406 86.71888406s136.53611531 34.31853656 188.93646188 4.61270625 58.67362781-120.48389625 7.38033-273.44124656z" fill="var(--surface)"/>
</svg>
</div>
</div>
<time class="revised-time">10月31日 08:30</time>
</section>
<section class="revised-metric">
<div class="revised-heading">
<span>血氧饱和度</span>
<svg class="icon jump" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
<path d="m9 6 6 6-6 6">
</path>
</svg>
</div>
<svg class="oxygen-dial" viewBox="0 0 140 84" role="img" aria-label="血氧饱和度98%，示例数据；量程85至100%，15格，其中13格填充，灰色底轨">
<g>
<line class="dial-segment" data-filled="true" x1="19.27938333621806" y1="59.66904837334966" x2="9.334164382535327" y2="58.62376374067312" stroke="#2BC7A0" stroke-width="6" stroke-linecap="round" stroke-opacity="0.65">
</line>
<line class="dial-segment" data-filled="true" x1="21.49611766894717" y1="49.24013328687768" x2="11.985552505995635" y2="46.149963343128206" stroke="#2BC7A0" stroke-width="6" stroke-linecap="round" stroke-opacity="0.65">
</line>
<line class="dial-segment" data-filled="true" x1="25.832704406993628" y1="39.5" x2="17.17245036914924" y2="34.5" stroke="#2BC7A0" stroke-width="6" stroke-linecap="round" stroke-opacity="0.65">
</line>
<line class="dial-segment" data-filled="true" x1="32.099613900652905" y1="30.874339075698217" x2="24.668165645878965" y2="24.183033012109632" stroke="#2BC7A0" stroke-width="6" stroke-linecap="round" stroke-opacity="0.65">
</line>
<line class="dial-segment" data-filled="true" x1="40.022952133083876" y1="23.74013328687768" x2="34.14509961015914" y2="15.649963343128206" stroke="#2BC7A0" stroke-width="6" stroke-linecap="round" stroke-opacity="0.65">
</line>
<line class="dial-segment" data-filled="true" x1="49.256431203134184" y1="18.409181660227354" x2="45.189064772376184" y2="9.273727083801347" stroke="#2BC7A0" stroke-width="6" stroke-linecap="round" stroke-opacity="0.65">
</line>
<line class="dial-segment" data-filled="true" x1="59.39650376829428" y1="15.11447236257591" x2="57.31738686011669" y2="5.332996355237853" stroke="#2BC7A0" stroke-width="6" stroke-linecap="round" stroke-opacity="0.65">
</line>
<line class="dial-segment" data-filled="true" x1="69.99999999999999" y1="14" x2="69.99999999999999" y2="4" stroke="#2BC7A0" stroke-width="6" stroke-linecap="round" stroke-opacity="0.65">
</line>
<line class="dial-segment" data-filled="true" x1="80.60349623170573" y1="15.114472362575917" x2="82.68261313988333" y2="5.33299635523786" stroke="#2BC7A0" stroke-width="6" stroke-linecap="round" stroke-opacity="0.65">
</line>
<line class="dial-segment" data-filled="true" x1="90.74356879686582" y1="18.409181660227354" x2="94.81093522762382" y2="9.273727083801347" stroke="#2BC7A0" stroke-width="6" stroke-linecap="round" stroke-opacity="0.65">
</line>
<line class="dial-segment" data-filled="true" x1="99.97704786691614" y1="23.74013328687768" x2="105.85490038984086" y2="15.649963343128206" stroke="#2BC7A0" stroke-width="6" stroke-linecap="round" stroke-opacity="0.65">
</line>
<line class="dial-segment" data-filled="true" x1="107.9003860993471" y1="30.874339075698224" x2="115.33183435412104" y2="24.18303301210964" stroke="#2BC7A0" stroke-width="6" stroke-linecap="round" stroke-opacity="0.65">
</line>
<line class="dial-segment" data-filled="true" x1="114.16729559300637" y1="39.50000000000001" x2="122.82754963085077" y2="34.500000000000014" stroke="#2BC7A0" stroke-width="6" stroke-linecap="round" stroke-opacity="0.65">
</line>
<line class="dial-segment" data-filled="false" x1="118.50388233105284" y1="49.24013328687768" x2="128.01444749400437" y2="46.149963343128206" stroke="#E6E6E6" stroke-width="6" stroke-linecap="round">
</line>
<line class="dial-segment" data-filled="false" x1="120.72061666378195" y1="59.66904837334969" x2="130.66583561746467" y2="58.623763740673155" stroke="#E6E6E6" stroke-width="6" stroke-linecap="round">
</line>
</g>
<text x="66" y="61" text-anchor="middle" font-size="32" font-weight="600" fill="#262626">98</text>
<text x="91" y="52" font-size="14" fill="#666666">%</text>
<text x="8" y="82" font-size="12" fill="#666666">85</text>
<text x="109" y="82" font-size="12" fill="#666666">100</text>
</svg>
<time class="revised-time">10月31日 08:30</time>
</section>
<section class="revised-metric">
<div class="revised-heading">
<span>糖尿病风险</span>
<svg class="icon jump" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
<path d="m9 6 6 6-6 6">
</path>
</svg>
</div>
<div class="risk-body">
<span class="empty-state">暂无数据</span>
<div class="risk-emblem">
<svg class="icon" viewBox="0 0 1024 1024" aria-hidden="true">
<circle cx="512" cy="512" r="480" fill="var(--surface)"/>
<path d="M512 992c265.104 0 480-214.896 480-480S777.104 32 512 32 32 246.896 32 512s214.896 480 480 480z m16.176-717.408c3.36 1.728 6.24 4.224 8.4 7.248 47.376 66.192 166.224 240.24 166.224 322.224a185.424 185.424 0 0 1-370.8 0c0-81.984 118.8-256.032 166.176-322.224a23.616 23.616 0 0 1 30-7.2z m-95.616 443.52a25.776 25.776 0 0 0 16.608-45.456c-47.04-39.552-31.2-99.84-30.432-102.72a25.728 25.728 0 0 0-49.44-14.208c-1.152 3.84-26.4 94.8 46.704 156.384a25.776 25.776 0 0 0 16.56 6.048z m42.96 14.688a27.36 27.36 0 1 0 54.768-.096 27.36 27.36 0 0 0-54.72.096z" fill="currentColor"/>
</svg>
</div>
</div>
<div class="revised-time">最近记录：—</div>
</section>
</div>
</main>
<nav aria-label="主导航">
<div class="navitem selected">
<svg class="icon " viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z">
</path>
</svg>
<span>健康</span>
</div>
<div class="navitem ">
<svg class="icon " viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
<rect x="3" y="3" width="7" height="7" rx="2">
</rect>
<rect x="14" y="3" width="7" height="7" rx="2">
</rect>
<rect x="3" y="14" width="7" height="7" rx="2">
</rect>
<rect x="14" y="14" width="7" height="7" rx="2">
</rect>
</svg>
<span>功能</span>
</div>
<div class="navitem ">
<svg class="icon " viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
<path d="M3 11a9 9 0 1 1 2.7 7M3 4v7h7M12 7v5l3 2">
</path>
</svg>
<span>历史</span>
</div>
<div class="navitem ">
<svg class="icon " viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
<circle cx="12" cy="8" r="4">
</circle>
<path d="M4 21v-2a8 8 0 0 1 16 0v2">
</path>
</svg>
<span>我的</span>
</div>
</nav>
<div class="gesture">
</div>
</div>
  `,
  functions: `
<div class="phone functions">
<div class="status">
<span>9:41</span>
<span class="system">▮▮▮ <svg width="16" height="12" viewBox="0 0 16 12">
<path d="M1 4Q8-2 15 4M4 7q4-4 8 0M7 10h2" fill="none" stroke="currentColor" stroke-width="2"/>
</svg> <svg width="23" height="12" viewBox="0 0 23 12">
<rect x="1" y="1" width="18" height="10" rx="3" fill="none" stroke="currentColor"/>
<rect x="3" y="3" width="14" height="6" rx="1" fill="currentColor"/>
<path d="M21 4v4" stroke="currentColor" stroke-width="2"/>
</svg>
</span>
</div>
<main class="content">
<header class="header">
<h2 class="title">健康功能</h2>
<p class="header-disclaimer">测量结果仅供参考，非医学诊断依据</p>
</header>
<section class="function-grid" aria-label="健康功能">
<button type="button" class="function-card" data-measurement="fingertip" aria-label="指尖心率与呼吸率功能说明">
<svg class="function-illustration" data-illustration="fingertip" viewBox="0 0 100 84" fill="none" aria-hidden="true">
<defs>
<linearGradient id="finger-skin" x1="440" y1="400" x2="700" y2="1540" gradientUnits="userSpaceOnUse"><stop stop-color="var(--illustration-skin-light)"/><stop offset="1" stop-color="var(--illustration-skin)"/></linearGradient>
<linearGradient id="finger-heart" x2="1" y2="1"><stop stop-color="var(--illustration-rose-light)"/><stop offset="1" stop-color="var(--illustration-rose)"/></linearGradient>
<linearGradient id="finger-phone" x2="1" y2="1"><stop stop-color="var(--illustration-teal-light)"/><stop offset="1" stop-color="var(--mint)"/></linearGradient>
</defs>
<!-- 按实际图形范围等比缩放并居中，保留内部手势与图标的相对位置。 -->
<g class="function-artwork" transform="translate(12.381 4.342) scale(.9198)">
<ellipse cx="27" cy="79" rx="26" ry="3" fill="var(--brand-subtle)"/>
<g transform="translate(-6 -15.6) scale(.06)">
<rect x="224" y="258" width="632" height="1200" rx="100" fill="var(--surface)"/>
<rect x="235" y="270" width="610" height="1180" rx="90" fill="url(#finger-phone)" stroke="var(--illustration-camera-rim)" stroke-width="13"/>
<rect x="350" y="350" width="390" height="390" rx="110" fill="var(--illustration-camera-rim)"/>
<g fill="var(--illustration-camera)" stroke="var(--illustration-blue-light)" stroke-width="12">
<circle cx="450" cy="450" r="55"/><circle cx="620" cy="480" r="55"/>
<circle cx="450" cy="620" r="55"/><circle cx="620" cy="620" r="55"/>
</g>
<circle cx="545" cy="425" r="31" fill="var(--illustration-flash)" fill-opacity=".35"/>
<rect x="534" y="400" width="22" height="50" rx="11" fill="var(--illustration-flash)" stroke="var(--surface)" stroke-width="7"/>
<path d="M110 1568c20-178 11-348 25-478 4-80 55-125 80-195 10-37 26-65 38-56 21 19 5 127 27 264 41-106 64-214 75-345l38-264c8-65 17-113 59-117 45-5 69 33 69 91l-8 387c-1 64 22 96 51 96 38-2 69-30 105-72l86-116c35-63 60-141 78-197 13-32 39-16 54 16 44 78 37 172-5 279 53 23 97 121 63 180 8 77-45 139-81 206-33 53-74 91-91 163l-42 158Z" fill="url(#finger-skin)" stroke="var(--surface)" stroke-width="24" stroke-linejoin="round"/>
<rect x="431" y="394" width="70" height="95" rx="32" fill="var(--illustration-skin-light)" transform="rotate(-5 466 442)"/>
</g>
<g class="function-symbols" transform="translate(-24 -6)">
<svg class="function-heart-symbol" x="55" y="37" width="30" height="30" viewBox="0 0 200 200" transform="rotate(-12 70 52)">
<path d="M100 30C79 15 54 16 34 28 9 42 1 69 15 99 30 132 68 163 100 183 132 163 170 132 185 99 199 69 191 42 166 28 146 16 121 15 100 30Z" fill="url(#finger-heart)" stroke="var(--surface)" stroke-width="12.5" stroke-linejoin="round"/>
<path d="M35 104h34l13-30 17 51 18-69 13 48h35" stroke="var(--surface)" stroke-width="8.5" stroke-linecap="round" stroke-linejoin="round"/>
</svg>
<svg class="function-breath-symbol" x="68.5" y="23" width="33.75" height="30" viewBox="0 0 32 32" preserveAspectRatio="none" transform="rotate(10 85.375 38)">
<path d="M14 8C8 7 4 13 3 22c-1 6 2 8 6 6l5-4Zm4 0c6-1 10 5 11 14 1 6-2 8-6 6l-5-4Z" fill="var(--illustration-blue-light)" stroke="var(--surface)" stroke-width="1.5" stroke-linejoin="round"/>
<path d="M16 3v11m0-2-6 8m6-8 6 8" stroke="var(--accent-blue)" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>
</svg>
</g>
</g>
</svg>
<span class="function-copy"><span class="function-title">心率与呼吸率</span><span class="function-description">指尖采集，一次了解两项指标。</span><span class="function-recency"></span></span>
<span class="function-chevron" aria-hidden="true">›</span>
</button>
<button type="button" class="function-card" data-measurement="face" aria-label="面部心率功能说明">
<svg class="function-illustration" viewBox="0 0 100 84" fill="none" aria-hidden="true">
<defs>
<linearGradient id="face-skin" x1="36" y1="24" x2="63" y2="55" gradientUnits="userSpaceOnUse"><stop stop-color="var(--illustration-skin-light)"/><stop offset="1" stop-color="var(--illustration-skin)"/></linearGradient>
<linearGradient id="face-shirt" x2="1" y2="1"><stop stop-color="var(--illustration-teal-light)"/><stop offset="1" stop-color="var(--mint)"/></linearGradient>
<linearGradient id="face-heart" x2="1" y2="1"><stop stop-color="var(--illustration-rose-light)"/><stop offset="1" stop-color="var(--illustration-rose)"/></linearGradient>
</defs>
<g class="function-artwork" transform="translate(-9.582 -4.713) scale(1.0576)">
<ellipse cx="49" cy="74" rx="31" ry="4" fill="var(--brand-subtle)"/>
<path d="M25 70c0-12 10-18 18-19V42h15v9c11 2 19 8 19 19Z" fill="url(#face-shirt)" stroke="var(--surface)" stroke-width="4" stroke-linejoin="round"/>
<path d="M43 45v11q7 7 15 0V45" fill="url(#face-skin)"/>
<path d="M29 36c-4-32 46-36 43-1v18c-8 7-35 7-43-1Z" fill="var(--illustration-hair)" stroke="var(--surface)" stroke-width="3"/>
<path d="M34 31c10 0 17-8 20-13 1 8 8 13 13 14v10c0 24-33 24-33 0Z" fill="url(#face-skin)"/>
<path d="M41 39h2m14 0h2m-13 9q5 3 9 0" stroke="var(--illustration-outline)" stroke-width="1.4" stroke-linecap="round"/>
<path d="M23 27v-9h9m36 0h10v9M23 53v10h9m36 0h10V53" stroke="var(--primary)" stroke-width="1.7" stroke-linecap="round"/>
<g transform="rotate(30 79 40) translate(65.95 26.95) scale(.1305)">
<path d="M100 30C79 15 54 16 34 28 9 42 1 69 15 99 30 132 68 163 100 183 132 163 170 132 185 99 199 69 191 42 166 28 146 16 121 15 100 30Z" fill="url(#face-heart)" stroke="var(--surface)" stroke-width="12.5" stroke-linejoin="round"/>
<path d="M35 104h34l13-30 17 51 18-69 13 48h35" stroke="var(--surface)" stroke-width="8.5" stroke-linecap="round" stroke-linejoin="round"/>
</g>
</g>
</svg>
<span class="function-copy"><span class="function-title">面部心率</span><span class="function-description">面向前摄，非接触估计心率。</span><span class="function-recency"></span></span>
<span class="function-chevron" aria-hidden="true">›</span>
</button>
<button type="button" class="function-card" data-metric="0" aria-label="血压测量功能说明">
<svg class="function-illustration" data-illustration="bp" viewBox="0 0 100 84" fill="none" aria-hidden="true">
<defs>
<linearGradient id="pressure-heart" x2="1" y2="1"><stop stop-color="var(--illustration-rose-light)"/><stop offset="1" stop-color="var(--illustration-rose)"/></linearGradient>
<linearGradient id="pressure-dial" x2="1" y2="1"><stop stop-color="var(--surface)"/><stop offset="1" stop-color="var(--illustration-teal-light)"/></linearGradient>
</defs>
<g class="function-artwork" transform="translate(.406 -1.223) scale(.9392)">
<ellipse cx="50" cy="74" rx="34" ry="4" fill="var(--brand-subtle)"/>
<g transform="translate(10 8) scale(.32)">
<path d="M100 30C79 15 54 16 34 28 9 42 1 69 15 99 30 132 68 163 100 183 132 163 170 132 185 99 199 69 191 42 166 28 146 16 121 15 100 30Z" fill="url(#pressure-heart)" stroke="var(--surface)" stroke-width="9" stroke-linejoin="round"/>
<path d="M35 104h34l13-30 17 51 18-69 13 48h35" stroke="var(--surface)" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>
<path d="M55 39c-19 3-30 16-32 31" stroke="var(--surface)" stroke-width="10" stroke-linecap="round" opacity=".65"/>
</g>
<circle cx="73" cy="57" r="20" fill="url(#pressure-dial)" stroke="var(--surface)" stroke-width="4"/>
<path d="M59 59a14 14 0 0 1 28 0" stroke="var(--mint)" stroke-width="3" stroke-linecap="round"/>
<path d="m73 58 8-10M60 68h26" stroke="var(--action)" stroke-width="1.6" stroke-linecap="round"/>
<circle cx="73" cy="58" r="2.5" fill="var(--primary)"/>
</g>
</svg>
<span class="function-copy"><span class="function-title">血压测量</span><span class="function-description">指尖采集，获取血压估计值。</span><span class="function-recency"></span></span>
<span class="function-chevron" aria-hidden="true">›</span>
</button>
<button type="button" class="function-card" data-metric="3" aria-label="血氧饱和度功能说明">
<svg class="function-illustration" data-illustration="oxygen" viewBox="0 0 100 84" fill="none" aria-hidden="true">
<defs>
<radialGradient id="oxygen-bubble" cx=".32" cy=".25" r=".8"><stop stop-color="var(--surface)"/><stop offset=".4" stop-color="var(--illustration-blue-light)"/><stop offset="1" stop-color="var(--primary)"/></radialGradient>
<linearGradient id="oxygen-tile" x2="1" y2="1"><stop stop-color="var(--surface)"/><stop offset="1" stop-color="var(--illustration-teal-light)"/></linearGradient>
</defs>
<g class="function-artwork" transform="translate(5.167 3.125) scale(.9017)">
<ellipse cx="50" cy="74" rx="34" ry="4" fill="var(--brand-subtle)"/>
<circle cx="47" cy="36" r="28" fill="url(#oxygen-bubble)" stroke="var(--surface)" stroke-width="3"/>
<path d="M28 29q2-11 13-13" stroke="var(--surface)" stroke-width="3" stroke-linecap="round" opacity=".9"/>
<text x="31" y="45" fill="var(--action)" font-size="25" font-weight="500">O<tspan font-size="14" dy="4">2</tspan></text>
<circle cx="79" cy="19" r="9" fill="url(#oxygen-bubble)" stroke="var(--surface)" stroke-width="2"/>
<circle cx="16" cy="50" r="6" fill="url(#oxygen-bubble)" stroke="var(--surface)" stroke-width="2"/>
<rect x="40" y="51" width="48" height="24" rx="9" fill="url(#oxygen-tile)" stroke="var(--surface)" stroke-width="3" transform="rotate(-8 64 63)"/>
<path d="M48 64h7l4-6 5 12 5-9 4 3h7" stroke="var(--primary)" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>
</g>
</svg>
<span class="function-copy"><span class="function-title">血氧饱和度</span><span class="function-description">指尖采集，了解血氧估计值。</span><span class="function-recency"></span></span>
<span class="function-chevron" aria-hidden="true">›</span>
</button>
<button type="button" class="function-card" data-metric="4" aria-label="糖尿病风险功能说明">
<svg class="function-illustration" data-illustration="risk" viewBox="0 0 100 84" fill="none" aria-hidden="true">
<defs>
<linearGradient id="risk-paper" x2="1" y2="1"><stop stop-color="var(--surface)"/><stop offset="1" stop-color="var(--illustration-teal-light)"/></linearGradient>
<linearGradient id="risk-glass" x2="1" y2="1"><stop stop-color="var(--surface)"/><stop offset="1" stop-color="var(--mint)" stop-opacity=".65"/></linearGradient>
</defs>
<g class="function-artwork" transform="translate(3.717 1.298) scale(.9469)">
<ellipse cx="50" cy="75" rx="34" ry="4" fill="var(--brand-subtle)"/>
<g transform="rotate(-8 40 42)">
<path d="M23 10h29l12 12v45a5 5 0 0 1-5 5H23a5 5 0 0 1-5-5V15a5 5 0 0 1 5-5Z" fill="url(#risk-paper)" stroke="var(--surface)" stroke-width="4"/>
<path d="M52 10v12h12" fill="var(--mint)" fill-opacity=".7"/>
<path d="M28 29h19m-19 8h24m-24 8h16m-16 9h11" stroke="var(--primary)" stroke-opacity=".75" stroke-width="2" stroke-linecap="round"/>
<path d="M30 14c-2 4-6 7-6 10a6 6 0 0 0 12 0c0-3-4-6-6-10Z" fill="var(--illustration-rose)"/>
<text x="39" y="24" fill="var(--action)" font-size="7" font-weight="600">GLU</text>
</g>
<path d="m69 59 14 15" stroke="var(--surface)" stroke-width="11" stroke-linecap="round"/>
<path d="m69 59 14 15" stroke="var(--primary)" stroke-width="7" stroke-linecap="round"/>
<circle cx="61" cy="48" r="20" fill="url(#risk-glass)" stroke="var(--surface)" stroke-width="4"/>
<circle cx="61" cy="48" r="17" stroke="var(--primary)" stroke-width="1.5"/>
<path d="m61 36 10 6v12l-10 6-10-6V42Z" fill="var(--mint)" fill-opacity=".8" stroke="var(--action)" stroke-width="1"/>
<text x="61" y="53" text-anchor="middle" fill="var(--action)" font-size="16" font-weight="600">G</text>
</g>
</svg>
<span class="function-copy"><span class="function-title">糖尿病风险</span><span class="function-description">了解糖尿病相关风险评估信息。</span><span class="function-recency"></span></span>
<span class="function-chevron" aria-hidden="true">›</span>
</button>
</section>
</main>
<nav aria-label="主导航">
<div class="navitem ">
<svg class="icon " viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z"/>
</svg>
<span>健康</span>
</div>
<div class="navitem selected">
<svg class="icon " viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
<rect x="3" y="3" width="7" height="7" rx="2"/>
<rect x="14" y="3" width="7" height="7" rx="2"/>
<rect x="3" y="14" width="7" height="7" rx="2"/>
<rect x="14" y="14" width="7" height="7" rx="2"/>
</svg>
<span>功能</span>
</div>
<div class="navitem ">
<svg class="icon " viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
<path d="M3 11a9 9 0 1 1 2.7 7M3 4v7h7M12 7v5l3 2"/>
</svg>
<span>历史</span>
</div>
<div class="navitem ">
<svg class="icon " viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
<circle cx="12" cy="8" r="4"/>
<path d="M4 21v-2a8 8 0 0 1 16 0v2"/>
</svg>
<span>我的</span>
</div>
</nav>
<div class="gesture">
</div>
</div>
  `,
  history: `
<div class="phone history">
<div class="status">
<span>9:41</span>
<span class="system">▮▮▮ <svg width="16" height="12" viewBox="0 0 16 12">
<path d="M1 4Q8-2 15 4M4 7q4-4 8 0M7 10h2" fill="none" stroke="currentColor" stroke-width="2"/>
</svg> <svg width="23" height="12" viewBox="0 0 23 12">
<rect x="1" y="1" width="18" height="10" rx="3" fill="none" stroke="currentColor"/>
<rect x="3" y="3" width="14" height="6" rx="1" fill="currentColor"/>
<path d="M21 4v4" stroke="currentColor" stroke-width="2"/>
</svg>
</span>
</div>
<main class="content">
<header class="header">
<div>
<h2 class="title">健康历史</h2>
<div class="hello" style="margin-top:4px">回看记录，了解变化</div>
</div>
<span class="chip" style="margin-left:0">仅供健康管理参考，<br>非医学诊断依据。</span>
</header>
<section class="datecard">
<div class="datehead">
<b>
<svg class="icon " viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
<rect x="3" y="5" width="18" height="16" rx="3"/>
<path d="M16 3v4M8 3v4M3 11h18"/>
</svg>日期范围</b>
<button>最近 7 天</button>
</div>
<div class="date-inputs">
<input type="date" aria-label="开始日期" id="from-date" value="2026-10-25">
<span>至</span>
<input type="date" aria-label="结束日期" id="to-date" value="2026-10-31">
</div>
<div id="date-error" class="error-date" hidden>开始日期不能晚于结束日期</div>
</section>
<div class="hist-tabs" role="tablist" aria-label="历史指标">
<button role="tab" id="hist-tab-0" aria-selected="true" aria-controls="history-panel">血压</button>
<button role="tab" id="hist-tab-1" aria-selected="false" aria-controls="history-panel">心率</button>
<button role="tab" id="hist-tab-2" aria-selected="false" aria-controls="history-panel">呼吸</button>
<button role="tab" id="hist-tab-3" aria-selected="false" aria-controls="history-panel">血氧</button>
<button role="tab" id="hist-tab-4" aria-selected="false" aria-controls="history-panel">风险</button>
</div>
<div id="history-panel" role="tabpanel" aria-labelledby="hist-tab-0">
</div>
</main>
<nav aria-label="主导航">
<div class="navitem ">
<svg class="icon " viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z"/>
</svg>
<span>健康</span>
</div>
<div class="navitem ">
<svg class="icon " viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
<rect x="3" y="3" width="7" height="7" rx="2"/>
<rect x="14" y="3" width="7" height="7" rx="2"/>
<rect x="3" y="14" width="7" height="7" rx="2"/>
<rect x="14" y="14" width="7" height="7" rx="2"/>
</svg>
<span>功能</span>
</div>
<div class="navitem selected">
<svg class="icon " viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
<path d="M3 11a9 9 0 1 1 2.7 7M3 4v7h7M12 7v5l3 2"/>
</svg>
<span>历史</span>
</div>
<div class="navitem ">
<svg class="icon " viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
<circle cx="12" cy="8" r="4"/>
<path d="M4 21v-2a8 8 0 0 1 16 0v2"/>
</svg>
<span>我的</span>
</div>
</nav>
<div class="gesture">
</div>
</div>
  `,
  account: `
<div class="phone account">
<div class="status">
<span>9:41</span>
<span class="system">▮▮▮ <svg width="16" height="12" viewBox="0 0 16 12">
<path d="M1 4Q8-2 15 4M4 7q4-4 8 0M7 10h2" fill="none" stroke="currentColor" stroke-width="2"/>
</svg> <svg width="23" height="12" viewBox="0 0 23 12">
<rect x="1" y="1" width="18" height="10" rx="3" fill="none" stroke="currentColor"/>
<rect x="3" y="3" width="14" height="6" rx="1" fill="currentColor"/>
<path d="M21 4v4" stroke="currentColor" stroke-width="2"/>
</svg>
</span>
</div>
<main class="content">
<header class="header" style="margin-bottom:0">
<h2 class="title">我的</h2>
<div class="circle-btn">
<svg class="icon " viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
<path d="M4 6h16M4 12h16M4 18h16"/>
<circle cx="9" cy="6" r="2" fill="white"/>
<circle cx="15" cy="12" r="2" fill="white"/>
<circle cx="9" cy="18" r="2" fill="white"/>
</svg>
</div>
</header>
<button type="button" class="profile">
<div class="avatar">
<svg class="icon " viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
<circle cx="12" cy="8" r="4"/>
<path d="M4 21v-2a8 8 0 0 1 16 0v2"/>
</svg>
</div>
<div>
<h2>未登录</h2>
<p>点击登录体验完整功能</p>
</div>
<svg class="icon " viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
<path d="m9 6 6 6-6 6"/>
</svg>
</button>
<section class="card menu">
<div class="row">
<svg class="icon " viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
<path d="M14 2H5v20h14V7Z M14 2v6h5M8 13h8M8 17h6"/>
</svg>我的健康记录<svg class="icon " viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
<path d="m9 6 6 6-6 6"/>
</svg>
</div>
<div class="row">
<svg class="icon " viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
<circle cx="12" cy="8" r="4"/>
<path d="M4 21v-2a8 8 0 0 1 16 0v2"/>
</svg>个人资料<svg class="icon " viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
<path d="m9 6 6 6-6 6"/>
</svg>
</div>
<div class="row">
<svg class="icon " viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/>
</svg>通知设置<svg class="icon " viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
<path d="m9 6 6 6-6 6"/>
</svg>
</div>
</section>
<section class="card menu">
<div class="row">
<svg class="icon " viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
<path d="M12 3 3 7v5c0 5 9 10 9 10s9-5 9-10V7Z"/>
<path d="m8 12 3 3 5-6"/>
</svg>隐私与授权<svg class="icon " viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
<path d="m9 6 6 6-6 6"/>
</svg>
</div>
<div class="row">
<svg class="icon " viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
<path d="M4 6h16M4 12h16M4 18h16"/>
<circle cx="9" cy="6" r="2" fill="white"/>
<circle cx="15" cy="12" r="2" fill="white"/>
<circle cx="9" cy="18" r="2" fill="white"/>
</svg>语言<small>简体中文</small>
<svg class="icon " viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
<path d="m9 6 6 6-6 6"/>
</svg>
</div>
<div class="row">
<svg class="icon " viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
<circle cx="12" cy="12" r="9"/>
<path d="M9 9a3 3 0 0 1 6 0c0 2-3 2-3 5M12 17h.01"/>
</svg>帮助与反馈<svg class="icon " viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
<path d="m9 6 6 6-6 6"/>
</svg>
</div>
</section>
<div class="privacyline">
<svg class="icon " viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
<path d="M12 3 3 7v5c0 5 9 10 9 10s9-5 9-10V7Z"/>
<path d="m8 12 3 3 5-6"/>
</svg>你的健康数据，由你掌握</div>
<button type="button" class="cta account-action account-login" data-action="login-route">登录</button>
<button type="button" class="cta account-action account-logout" data-action="logout-demo" hidden>退出登录</button>
</main>
<nav aria-label="主导航">
<div class="navitem ">
<svg class="icon " viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z"/>
</svg>
<span>健康</span>
</div>
<div class="navitem ">
<svg class="icon " viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
<rect x="3" y="3" width="7" height="7" rx="2"/>
<rect x="14" y="3" width="7" height="7" rx="2"/>
<rect x="3" y="14" width="7" height="7" rx="2"/>
<rect x="14" y="14" width="7" height="7" rx="2"/>
</svg>
<span>功能</span>
</div>
<div class="navitem ">
<svg class="icon " viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
<path d="M3 11a9 9 0 1 1 2.7 7M3 4v7h7M12 7v5l3 2"/>
</svg>
<span>历史</span>
</div>
<div class="navitem selected">
<svg class="icon " viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
<circle cx="12" cy="8" r="4"/>
<path d="M4 21v-2a8 8 0 0 1 16 0v2"/>
</svg>
<span>我的</span>
</div>
</nav>
<div class="gesture">
</div>
</div>
  `,
  login: `
<section class="auth-scene" id="scene-login" >
<div class="phone auth-phone login">
<div class="status">
<span>9:41</span>
<span class="system">▮▮▮ <svg width="16" height="12" viewBox="0 0 16 12">
<path d="M1 4Q8-2 15 4M4 7q4-4 8 0M7 10h2" fill="none" stroke="currentColor" stroke-width="2"/>
</svg> <svg width="23" height="12" viewBox="0 0 23 12">
<rect x="1" y="1" width="18" height="10" rx="3" fill="none" stroke="currentColor"/>
<rect x="3" y="3" width="14" height="6" rx="1" fill="currentColor"/>
<path d="M21 4v4" stroke="currentColor" stroke-width="2"/>
</svg>
</span>
</div>
<main class="auth-main">
<div class="auth-topbar">
<button class="auth-back" type="button" aria-label="返回" >
<svg class="icon " viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
<path d="m15 18-6-6 6-6"/>
</svg>
</button>
<button class="auth-top-link" type="button">注册账户</button>
</div>
${authBrand}
<form class="auth-form" id="form-login" novalidate>
<div class="auth-field">
<label for="login-username">用户名</label>
<div class="auth-input-wrap">
<input class="auth-input" id="login-username" name="username" type="text" autocomplete="username" autocapitalize="none" spellcheck="false" maxlength="150" placeholder="请输入用户名" required>
</div>
</div>
<div class="auth-field">
<label for="login-password">密码</label>
<div class="auth-input-wrap">
<input class="auth-input password" id="login-password" type="password" autocomplete="current-password" placeholder="请输入密码" required>
<button class="password-toggle" type="button" aria-label="显示密码" aria-pressed="false" data-password="login-password">
<svg class="icon " viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7S2 12 2 12Z"/>
<circle cx="12" cy="12" r="3"/>
</svg>
</button>
</div>
</div>
<p class="auth-error" id="error-login" role="alert" hidden>
</p>
<button class="auth-primary" type="submit">登录 <svg class="icon " viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
<path d="M5 12h14m-6-6 6 6-6 6"/>
</svg>
</button>
</form>
<div class="auth-alternate">
<span>还没有账户？</span>
<button type="button">注册账户</button>
</div>
<div class="auth-footnote">
<svg class="icon " viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
<path d="M12 3 3 7v5c0 5 9 10 9 10s9-5 9-10V7Z"/>
<path d="m8 12 3 3 5-6"/>
</svg>
<span>健康资料与采集授权，在相关功能中单独说明。</span>
</div>
</main>
<div class="gesture">
</div>
</div>
</section>
  `,
  register: `
<section class="auth-scene" id="scene-register">
<div class="phone auth-phone register">
<div class="status">
<span>9:41</span>
<span class="system">▮▮▮ <svg width="16" height="12" viewBox="0 0 16 12">
<path d="M1 4Q8-2 15 4M4 7q4-4 8 0M7 10h2" fill="none" stroke="currentColor" stroke-width="2"/>
</svg> <svg width="23" height="12" viewBox="0 0 23 12">
<rect x="1" y="1" width="18" height="10" rx="3" fill="none" stroke="currentColor"/>
<rect x="3" y="3" width="14" height="6" rx="1" fill="currentColor"/>
<path d="M21 4v4" stroke="currentColor" stroke-width="2"/>
</svg>
</span>
</div>
<main class="auth-main">
<div class="auth-topbar">
<button class="auth-back" type="button" aria-label="返回登录">
<svg class="icon " viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
<path d="m15 18-6-6 6-6"/>
</svg>
</button>
<button class="auth-top-link" type="button">已有账号？登录</button>
</div>
${authBrand}
<form class="auth-form" id="form-register" novalidate>
<div class="auth-field">
<label for="register-username">用户名</label>
<div class="auth-input-wrap">
<input class="auth-input" id="register-username" name="username" type="text" autocomplete="username" autocapitalize="none" spellcheck="false" maxlength="150" placeholder="请输入用户名" required>
</div>
</div>
<div class="auth-field">
<label for="register-password">密码</label>
<div class="auth-input-wrap">
<input class="auth-input password" id="register-password" type="password" autocomplete="new-password" placeholder="请输入密码" required>
<button class="password-toggle" type="button" aria-label="显示密码" aria-pressed="false" data-password="register-password">
<svg class="icon " viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7S2 12 2 12Z"/>
<circle cx="12" cy="12" r="3"/>
</svg>
</button>
</div>
</div>
<div class="auth-helper">不建议使用常见密码或纯数字密码</div>
<div class="auth-field">
<label for="register-confirm">确认密码</label>
<div class="auth-input-wrap">
<input class="auth-input password" id="register-confirm" type="password" autocomplete="new-password" placeholder="请再次输入密码" required>
<button class="password-toggle" type="button" aria-label="显示确认密码" aria-pressed="false" data-password="register-confirm">
<svg class="icon " viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7S2 12 2 12Z"/>
<circle cx="12" cy="12" r="3"/>
</svg>
</button>
</div>
</div>
<p class="auth-error" id="error-register" role="alert" hidden>
</p>
<button class="auth-primary" type="submit">创建账户 <svg class="icon " viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
<path d="M5 12h14m-6-6 6 6-6 6"/>
</svg>
</button>
<p class="auth-notice">注册成功后，返回登录</p>
</form>
<div class="auth-alternate">
<span>已有账户？</span>
<button type="button">前往登录</button>
</div>
<div class="auth-footnote">
<svg class="icon " viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
<path d="M12 3 3 7v5c0 5 9 10 9 10s9-5 9-10V7Z"/>
<path d="m8 12 3 3 5-6"/>
</svg>
<span>健康资料与采集授权，在相关功能中单独说明。</span>
</div>
</main>
<div class="gesture">
</div>
</div>
</section>
  `,
  welcome: `
<div class="phone welcome">
<div class="status">
<span>9:41</span>
<span class="system">▮▮▮ <svg width="16" height="12" viewBox="0 0 16 12">
<path d="M1 4Q8-2 15 4M4 7q4-4 8 0M7 10h2" fill="none" stroke="currentColor" stroke-width="2"/>
</svg> <svg width="23" height="12" viewBox="0 0 23 12">
<rect x="1" y="1" width="18" height="10" rx="3" fill="none" stroke="currentColor"/>
<rect x="3" y="3" width="14" height="6" rx="1" fill="currentColor"/>
<path d="M21 4v4" stroke="currentColor" stroke-width="2"/>
</svg>
</span>
</div>
<main class="content">
<div class="splashart">
<img src="/brand-assets/xinmu-logo.svg" width="144" height="144" alt="心沐：圆润心形与内外两层水意环">
</div>
<div class="splashcopy">
<h2>心沐</h2>
<p>关心每一次心动。</p>
</div>
<div class="splashbottom">日常健康，从了解自己开始</div>
</main>
<div class="gesture">
</div>
</div>
  `,
  onboarding: `
<div class="phone intro">
<div class="status">
<span>9:41</span>
<span class="system">▮▮▮ <svg width="16" height="12" viewBox="0 0 16 12">
<path d="M1 4Q8-2 15 4M4 7q4-4 8 0M7 10h2" fill="none" stroke="currentColor" stroke-width="2"/>
</svg> <svg width="23" height="12" viewBox="0 0 23 12">
<rect x="1" y="1" width="18" height="10" rx="3" fill="none" stroke="currentColor"/>
<rect x="3" y="3" width="14" height="6" rx="1" fill="currentColor"/>
<path d="M21 4v4" stroke="currentColor" stroke-width="2"/>
</svg>
</span>
</div>
<main class="content intro-content">
<div class="intro-topbar">
<div class="intro-brand"><img src="/brand-assets/xinmu-logo.svg" width="28" height="28" alt=""><span>心沐</span></div>
<button type="button" class="intro-text-button" data-action="home-route" aria-label="跳过功能引导，进入首页">跳过</button>
</div>
<div class="intro-copy">
<h1>从一次测量，<br>开始了解自己</h1>
<p>从血压估计开始，记录心率、呼吸率与血氧，慢慢了解身体的日常变化。</p>
</div>
<div class="intro-feature-visual" aria-label="了解健康测量与风险筛查功能">
<div class="intro-primary-art" data-feature-art="bp" aria-hidden="true"></div>
<div class="intro-feature-caption">从血压估计开始</div>
<ul class="intro-feature-list">
<li><div data-feature-art="fingertip" aria-hidden="true"></div><span>心率与呼吸</span></li>
<li><div data-feature-art="oxygen" aria-hidden="true"></div><span>血氧估计</span></li>
<li><div data-feature-art="risk" aria-hidden="true"></div><span>糖尿病风险筛查</span></li>
</ul>
</div>
<footer class="intro-footer">
<div class="intro-progress" role="img" aria-label="首次引导，第 1 步，共 2 步"><span class="current"></span><span></span></div>
<button type="button" class="cta" data-action="onboarding-next">下一步 <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14m-6-6 6 6-6 6"/></svg></button>
<p class="intro-footnote">估计与筛查结果仅供参考，不能替代医学诊断</p>
</footer>
</main>
<div class="gesture">
</div>
</div>
  `,
  privacy: `
<div class="phone intro privacy">
<div class="status">
<span>9:41</span>
<span class="system">▮▮▮ <svg width="16" height="12" viewBox="0 0 16 12">
<path d="M1 4Q8-2 15 4M4 7q4-4 8 0M7 10h2" fill="none" stroke="currentColor" stroke-width="2"/>
</svg> <svg width="23" height="12" viewBox="0 0 23 12">
<rect x="1" y="1" width="18" height="10" rx="3" fill="none" stroke="currentColor"/>
<rect x="3" y="3" width="14" height="6" rx="1" fill="currentColor"/>
<path d="M21 4v4" stroke="currentColor" stroke-width="2"/>
</svg>
</span>
</div>
<main class="content intro-content">
<div class="intro-topbar">
<button type="button" class="intro-text-button intro-back" data-action="onboarding-route" aria-label="返回功能引导"><svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>返回</button>
<span class="intro-top-note">隐私与测量</span>
</div>
<div class="intro-copy">
<h1>需要时，<br>再由你授权</h1>
<p>不在这里一次性索取权限。使用相关功能时，再说明用途并由你决定。</p>
</div>
<ul class="intro-permission-list">
<li><span class="intro-permission-icon"><svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m8 5 1-2h6l1 2h3a2 2 0 0 1 2 2v12H3V7a2 2 0 0 1 2-2Z"/><circle cx="12" cy="12" r="4"/></svg></span><div><h2>相机，用于相关测量</h2><p>使用指尖或面部测量时再申请，进入首页不会启动相机。</p></div></li>
<li><span class="intro-permission-icon"><svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></svg></span><div><h2>通知，由你选择</h2><p>用于测量提醒，可按需开启；不影响你查看和测量。</p></div></li>
<li><span class="intro-permission-icon"><svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="6" width="18" height="12" rx="6"/><circle cx="9" cy="12" r="3"/></svg></span><div><h2>被动采集，单独启用</h2><p>另行说明采集方式与授权，未经你启用不会开始。</p></div></li>
</ul>
<footer class="intro-footer">
<div class="intro-progress" role="img" aria-label="首次引导，第 2 步，共 2 步"><span></span><span class="current"></span></div>
<button type="button" class="cta" data-action="home-route">进入首页 <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14m-6-6 6 6-6 6"/></svg></button>
<p class="intro-footnote">本页仅说明权限用途，不会发起系统授权</p>
</footer>
</main>
<div class="gesture">
</div>
</div>
  `
};
