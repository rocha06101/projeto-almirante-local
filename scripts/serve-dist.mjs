// Serve o build de produção (dist/) para validar PWA/service worker localmente.
// Uso:  npm run build && node scripts/serve-dist.mjs [--port 4300] [--api https://localhost:8444] [--http]
//
//  - fallback de SPA para index.html (rotas do Angular);
//  - `--api <url>` encaminha /api/* ao backend (SÓ para desenvolvimento local: aceita o
//    certificado autoassinado do backend local; não use contra ambientes reais);
//  - HTTPS com certificado autoassinado gerado via openssl (se disponível); `--http` força HTTP
//    (localhost já é contexto seguro para service workers).
import { spawnSync } from 'node:child_process';
import { createReadStream, existsSync, mkdtempSync, readFileSync, statSync } from 'node:fs';
import { createServer as createHttpServer, request as httpRequest } from 'node:http';
import { createServer as createHttpsServer, request as httpsRequest } from 'node:https';
import { tmpdir } from 'node:os';
import { extname, join, normalize, resolve } from 'node:path';

const args = process.argv.slice(2);
const flag = name => args.includes(`--${name}`);
const option = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : fallback;
};

const port = Number(option('port', '4300'));
const root = resolve(option('root', 'dist/almirante-tamandare-frontend/browser'));
const apiTarget = option('api', '') ? new URL(option('api', '')) : null;

const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.txt': 'text/plain; charset=utf-8',
};

if (!existsSync(join(root, 'index.html'))) {
  console.error(`index.html não encontrado em ${root}. Execute "npm run build" antes.`);
  process.exit(1);
}

function proxy(req, res) {
  const client = apiTarget.protocol === 'https:' ? httpsRequest : httpRequest;
  const upstream = client(
    {
      protocol: apiTarget.protocol,
      hostname: apiTarget.hostname,
      port: apiTarget.port,
      path: req.url,
      method: req.method,
      headers: { ...req.headers, host: apiTarget.host },
      rejectUnauthorized: false, // certificado autoassinado do backend local
    },
    response => {
      res.writeHead(response.statusCode ?? 502, response.headers);
      response.pipe(res);
    },
  );
  upstream.on('error', () => {
    res.writeHead(502).end('Bad gateway');
  });
  req.pipe(upstream);
}

function handler(req, res) {
  const url = new URL(req.url ?? '/', 'http://localhost');

  if (apiTarget && url.pathname.startsWith('/api/')) {
    proxy(req, res);
    return;
  }

  let file = normalize(join(root, decodeURIComponent(url.pathname)));

  if (!file.startsWith(root)) {
    res.writeHead(403).end();
    return;
  }

  if (!existsSync(file) || statSync(file).isDirectory()) {
    // Requisição por arquivo inexistente é 404 de verdade; rota sem extensão cai no index (SPA).
    if (extname(file)) {
      res.writeHead(404).end('Not found');
      return;
    }
    file = join(root, 'index.html');
  }

  const headers = { 'Content-Type': types[extname(file)] ?? 'application/octet-stream' };
  // O service worker e o manifest nunca podem ficar presos em cache HTTP.
  if (/ngsw|manifest|index\.html$/.test(file)) {
    headers['Cache-Control'] = 'no-cache';
  }
  res.writeHead(200, headers);
  createReadStream(file).pipe(res);
}

function createCertificate() {
  const dir = mkdtempSync(join(tmpdir(), 'almirante-serve-'));
  const key = join(dir, 'key.pem');
  const cert = join(dir, 'cert.pem');
  const candidates = ['openssl', 'C:/Program Files/Git/usr/bin/openssl.exe'];

  for (const bin of candidates) {
    const result = spawnSync(
      bin,
      ['req', '-x509', '-newkey', 'rsa:2048', '-sha256', '-days', '2', '-nodes', '-keyout', key, '-out', cert,
        '-subj', '/CN=localhost', '-addext', 'subjectAltName=DNS:localhost,IP:127.0.0.1'],
      { stdio: 'ignore' },
    );
    if (result.status === 0) {
      return { key: readFileSync(key), cert: readFileSync(cert) };
    }
  }
  return null;
}

const credentials = flag('http') ? null : createCertificate();
const server = credentials ? createHttpsServer(credentials, handler) : createHttpServer(handler);

server.listen(port, '127.0.0.1', () => {
  console.log(`Servindo ${root} em ${credentials ? 'https' : 'http'}://localhost:${port}` + (apiTarget ? ` (/api -> ${apiTarget.origin})` : ''));
});
