import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const appRoot = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(appRoot, 'build');
const host = process.env.HOST || '0.0.0.0';
const port = Number(process.env.PORT || process.env.CLARITY_PORT || 8768);
const version = (() => {
  try { return fs.readFileSync(path.join(appRoot, 'VERSION'), 'utf8').trim() || 'dev'; }
  catch { return 'dev'; }
})();

const mimeTypes = {
  '.html': 'text/html; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8', '.txt': 'text/plain; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json; charset=utf-8', '.png': 'image/png', '.ico': 'image/x-icon'
};

const baseSecurityHeaders = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'SAMEORIGIN',
  'Permissions-Policy': 'microphone=(self), screen-wake-lock=(self)'
};

function headersFor(filePath = '') {
  const ext = path.extname(filePath).toLowerCase();
  const noStoreShell = ['.html', '.json', '.webmanifest', '.js', '.mjs', '.css'].includes(ext) || path.basename(filePath) === 'sw.js';
  const cache = noStoreShell
    ? 'no-store, no-cache, must-revalidate'
    : 'public, max-age=3600';
  return { ...baseSecurityHeaders, 'Cache-Control': cache };
}

function sendJson(response, status, value) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', ...baseSecurityHeaders, 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(value));
}

function sendFile(response, filePath) {
  fs.stat(filePath, (error, stats) => {
    if (error || !stats.isFile()) {
      response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', ...baseSecurityHeaders });
      response.end('Nije pronađeno.');
      return;
    }
    response.writeHead(200, {
      'Content-Type': mimeTypes[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
      ...headersFor(filePath)
    });
    fs.createReadStream(filePath).pipe(response);
  });
}

const server = http.createServer((request, response) => {
  const origin = `http://${request.headers.host || `${host}:${port}`}`;
  const requestUrl = new URL(request.url || '/', origin);
  const pathname = decodeURIComponent(requestUrl.pathname);

  if (pathname === '/clarity-health.json' || pathname === '/api/health') {
    sendJson(response, 200, {
      ok: true, app: 'Clarity', version, mode: 'web-platform-speech', language: 'hr-HR',
      storage: 'indexeddb/local browser storage', transcription: 'SpeechRecognition / Web Speech API supplied by the client browser/platform'
    });
    return;
  }

  const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const requested = path.resolve(root, relative);
  if (requested !== root && !requested.startsWith(`${root}${path.sep}`)) {
    response.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8', ...baseSecurityHeaders });
    response.end('Zabranjeno.');
    return;
  }

  fs.stat(requested, (error, stats) => {
    if (!error && stats.isFile()) sendFile(response, requested);
    else sendFile(response, path.join(root, 'index.html'));
  });
});

server.on('error', error => {
  console.error(`[Clarity] Server se nije mogao pokrenuti: ${error.message}`);
  process.exit(1);
});
server.listen(port, host, () => console.log(`[Clarity ${version}] http://${host}:${port}`));

let shuttingDown = false;
function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  server.closeIdleConnections?.();
  server.closeAllConnections?.();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 500).unref();
}
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, shutdown);
