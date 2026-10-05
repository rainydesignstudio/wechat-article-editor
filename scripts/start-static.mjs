import fs from 'node:fs';
import crypto from 'node:crypto';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseStaticServerOptions, STATIC_SERVER_HELP } from './static-server-options.mjs';

const host = '127.0.0.1';
let options;
try { options = parseStaticServerOptions(process.argv.slice(2)); }
catch (error) {
  console.error(`启动参数错误：${error.message}`);
  process.exit(1);
}
if (options.help) {
  console.log(STATIC_SERVER_HELP);
  process.exit(0);
}
const { port } = options;
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'out');

if (!fs.existsSync(path.join(output, 'index.html'))) {
  console.error('启动失败：缺少 out/index.html 静态构建产物，请先在项目目录执行 npm run build，再运行 npm start。');
  process.exit(1);
}

function contentType(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  return {
    '.css': 'text/css; charset=utf-8',
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.txt': 'text/x-component; charset=utf-8',
  }[extension] ?? 'application/octet-stream';
}

function inlineScriptHashes(filePath) {
  if (path.extname(filePath).toLowerCase() !== '.html') return [];
  const html = fs.readFileSync(filePath, 'utf8');
  const hashes = [];
  const pattern = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  for (const match of html.matchAll(pattern)) {
    const attributes = match[1] ?? '';
    const body = match[2] ?? '';
    if (/\bsrc\s*=/.test(attributes) || body.trim() === '') continue;
    const digest = crypto.createHash('sha256').update(body).digest('base64');
    hashes.push(`'sha256-${digest}'`);
  }
  return [...new Set(hashes)];
}

function contentSecurityPolicy(filePath) {
  const scriptHashes = inlineScriptHashes(filePath);
  const scriptSource = ["'self'", ...scriptHashes].join(' ');
  return [
    "default-src 'self'",
    "base-uri 'none'",
    "img-src 'self' data: blob:",
    "style-src 'self' 'unsafe-inline'",
    `script-src ${scriptSource}`,
    "connect-src 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
  ].join('; ');
}

const server = http.createServer((request, response) => {
  const requestUrl = new URL(request.url ?? '/', `http://${host}:${port}`);
  const requested = decodeURIComponent(requestUrl.pathname);
  const relative = requested === '/' ? '/index.html' : requested;
  const requestedPath = path.resolve(output, `.${relative}`);
  if (!requestedPath.startsWith(`${output}${path.sep}`) && requestedPath !== output) {
    response.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('Forbidden');
    return;
  }
  fs.stat(requestedPath, (requestError, requestedStat) => {
    const filePath = !requestError && requestedStat.isDirectory()
      ? path.join(requestedPath, 'index.html')
      : requestedPath;
    fs.stat(filePath, (error, stat) => {
      if (!error && stat.isFile()) {
        response.writeHead(200, {
          'cache-control': 'no-store',
          'content-security-policy': contentSecurityPolicy(filePath),
          'content-type': contentType(filePath),
          'x-content-type-options': 'nosniff',
        });
        fs.createReadStream(filePath).pipe(response);
        return;
      }
      response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      response.end('Not found');
    });
  });
});

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`启动失败：127.0.0.1:${port} 已被占用；请另选端口或手动处理已有服务。`);
  } else {
    console.error(error);
  }
  process.exitCode = 1;
});

server.listen(port, host, () => {
  console.log(`Rainy 微信编辑器静态服务：http://${host}:${port}`);
});
