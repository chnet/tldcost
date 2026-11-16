// Minimal static server for the e2e tests, same URL rules as the CloudFront viewer-request
// function: `/x/` -> `/x/index.html`, `/x` (no dot) -> 301 `/x/` with query. HTML pages get the
// site's Content-Security-Policy (infra/lib/content-security-policy.json, the same file the CloudFront
// response headers policy uses), so the e2e tests fail on anything the CSP would block.
// Usage: node tests/e2e/static-server.mjs <dir> <port>
import { createReadStream, readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';

const [dirArg, portArg] = process.argv.slice(2);
const root = resolve(dirArg ?? 'dist');
const port = Number(portArg ?? 4400);
// upgrade-insecure-requests is left out: this server is plain http on 127.0.0.1.
const CSP = JSON.parse(
  readFileSync(new URL('../../../infra/lib/content-security-policy.json', import.meta.url), 'utf8'),
)
  .filter((d) => d !== 'upgrade-insecure-requests')
  .join('; ');
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.txt': 'text/plain; charset=utf-8',
};

createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  if (url.pathname === '/__health') return res.writeHead(200).end('ok');
  let path = decodeURIComponent(url.pathname);
  const last = path.slice(path.lastIndexOf('/') + 1);
  if (!path.endsWith('/') && !last.includes('.')) {
    return res.writeHead(301, { location: `${path}/${url.search}` }).end();
  }
  if (path.endsWith('/')) path += 'index.html';
  const file = normalize(join(root, path));
  if (!file.startsWith(root)) return res.writeHead(400).end();
  try {
    if (!statSync(file).isFile()) throw new Error('not a file');
  } catch {
    return res.writeHead(404, { 'content-type': 'text/plain' }).end('not found');
  }
  const type = TYPES[extname(file)] ?? 'application/octet-stream';
  const csp = extname(file) === '.html' ? { 'content-security-policy': CSP } : {};
  res.writeHead(200, { 'content-type': type, ...csp });
  createReadStream(file).pipe(res);
}).listen(port, '127.0.0.1');
