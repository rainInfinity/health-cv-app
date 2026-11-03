/** 从原生主题生成只读预览数据，供浏览器重绘主题令牌总览图。 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(new URL('../../apps/native/package.json', import.meta.url));
const ts = require('typescript');
const port = Number(process.argv[2] || 4177);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('端口必须为 1–65535');

/** 文档只选择主题的 Web 阴影映射，不启动 React Native 运行时。 */
async function loadTheme() {
  const source = await readFile(new URL('../../apps/native/src/shared/theme/theme.ts', import.meta.url), 'utf8');
  const platformIndependentSource = source.replace(/^import .* from 'react-native'\r?\n/gm, '');
  const { outputText } = ts.transpileModule(platformIndependentSource, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  });
  const webAdapter = 'const Platform = { select: (entries) => entries.web ?? entries.default };\n';
  const module = await import(`data:text/javascript;base64,${Buffer.from(webAdapter + outputText).toString('base64')}`);
  return module.lightTheme;
}

/** 仅提供总览源码与由实际主题导出的数据，不暴露其他文件。 */
async function respond(request, response) {
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  if (request.url === '/theme.json') {
    response.setHeader('Content-Type', 'application/json; charset=utf-8');
    response.end(JSON.stringify(await loadTheme()));
  } else if (request.url === '/') {
    response.setHeader('Content-Type', 'text/html; charset=utf-8');
    response.end(await readFile(new URL('./assets/health-theme-token-sheet.html', import.meta.url)));
  } else {
    response.writeHead(404);
    response.end();
  }
}

const server = createServer((request, response) => {
  respond(request, response).catch((error) => {
    console.error(error);
    response.writeHead(500);
    response.end('主题预览生成失败');
  });
});
server.on('error', (error) => { console.error(error); process.exitCode = 1; });
server.listen(port, '127.0.0.1', () => {
  console.log(`主题令牌总览：http://127.0.0.1:${port}/`);
  console.log(`图片路径：${fileURLToPath(new URL('./assets/health-theme-token-sheet.png', import.meta.url))}`);
});
