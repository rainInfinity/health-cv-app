/** 只读本地静态服务；仅暴露演示资源，不接受写入或代理任何 API。 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const port = Number(process.argv[2] || 4173);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('端口参数必须是 1–65535 的整数');
}

const files = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/index.html', ['index.html', 'text/html; charset=utf-8']],
  ['/styles.css', ['styles.css', 'text/css; charset=utf-8']],
  ...['app.js', 'pages.js', 'measurement-pages.js', 'face-measurement.js', 'contact-measurement.js', 'fingertip-results.js', 'contact-illustrations.js', 'chest-reference-illustrations.js', 'pulse-wave.js', 'data.js', 'history.js', 'ui.js', 'profile.js'].map((name) => [`/${name}`, [name, 'text/javascript; charset=utf-8']]),
  ['/vendor/echarts.esm.min.js', ['../../node_modules/echarts/dist/echarts.esm.min.js', 'text/javascript; charset=utf-8']],
  ...[
    ['xinmu-logo.svg', 'image/svg+xml'],
    ['icon.png', 'image/png'],
    ['favicon.png', 'image/png'],
    ...['op1.png', 'op2.png', 'op3.png'].map((name) => [name, 'image/png']),
  ].map(([name, type]) => [`/brand-assets/${name}`, [`../../apps/native/assets/${name}`, type]]),
]);

/** 精确白名单避免路径穿越和项目文件意外暴露。 */
async function respond(request, response) {
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Referrer-Policy', 'no-referrer');
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'none'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'none'");
  if (!['GET', 'HEAD'].includes(request.method)) {
    response.writeHead(405, { Allow: 'GET, HEAD' });
    response.end('只读演示服务');
    return;
  }
  let pathname;
  try {
    pathname = new URL(request.url, 'http://127.0.0.1').pathname;
  } catch {
    response.writeHead(400);
    response.end('无效请求');
    return;
  }
  const resource = files.get(pathname);
  if (!resource) {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('页面不存在');
    return;
  }
  try {
    const body = await readFile(fileURLToPath(new URL(resource[0], import.meta.url)));
    response.writeHead(200, { 'Content-Type': resource[1] });
    response.end(request.method === 'HEAD' ? undefined : body);
  } catch (error) {
    console.error('演示资源读取失败：', error.code || 'UNKNOWN');
    response.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('演示资源读取失败，请检查文件是否完整');
  }
}

const server = createServer((request, response) => {
  respond(request, response).catch((error) => {
    console.error('请求处理失败：', error.message);
    if (!response.headersSent) response.writeHead(500);
    response.end();
  });
});
server.on('error', (error) => {
  console.error(`演示服务启动失败：${error.message}`);
  process.exitCode = 1;
});
server.listen(port, '127.0.0.1', () => {
  console.log(`心沐设计演示：http://127.0.0.1:${port}/`);
});
