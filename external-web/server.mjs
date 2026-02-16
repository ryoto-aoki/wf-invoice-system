import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const port = Number(process.env.PORT || 5173);
const gasUrlRaw = process.env.GAS_WEBAPP_URL || '';

if (!gasUrlRaw) {
  console.error('GAS_WEBAPP_URL is required');
  process.exit(1);
}

const gasBase = new URL(gasUrlRaw);

function send(res, code, body, type = 'text/plain; charset=utf-8') {
  res.writeHead(code, { 'Content-Type': type });
  res.end(body);
}

async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return Buffer.concat(chunks).toString('utf8');
}

async function proxyToGas(req, res, pathname, searchParams) {
  const target = new URL(gasBase.toString());
  if (pathname.startsWith('/gas')) {
    target.search = searchParams.toString();
  }

  const init = { method: req.method, headers: { 'Content-Type': req.headers['content-type'] || 'application/json' } };
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    init.body = await readBody(req);
  }

  const r = await fetch(target, init);
  const text = await r.text();
  send(res, r.status, text, 'application/json; charset=utf-8');
}

function serveStatic(req, res, pathname) {
  const rel = pathname === '/' ? '/index.html' : pathname;
  const file = path.join(__dirname, rel.replace(/^\/+/, ''));
  if (!file.startsWith(__dirname)) return send(res, 403, 'forbidden');
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) return send(res, 404, 'not found');

  const ext = path.extname(file).toLowerCase();
  const type = ext === '.html' ? 'text/html; charset=utf-8'
    : ext === '.js' ? 'application/javascript; charset=utf-8'
    : ext === '.css' ? 'text/css; charset=utf-8'
    : 'application/octet-stream';

  send(res, 200, fs.readFileSync(file), type);
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://localhost:${port}`);
    if (url.pathname.startsWith('/gas')) {
      return await proxyToGas(req, res, url.pathname, url.searchParams);
    }
    return serveStatic(req, res, url.pathname);
  } catch (err) {
    return send(res, 500, JSON.stringify({ ok: false, error: String(err.message || err) }), 'application/json; charset=utf-8');
  }
});

server.listen(port, () => {
  console.log(`external-web listening on http://localhost:${port}`);
});
