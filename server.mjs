import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), 'build');
const host = '127.0.0.1';
const port = Number(process.env.CLARITY_PORT || 8768);
const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.ico': 'image/x-icon'
};

function sendFile(response, filePath) {
  fs.stat(filePath, (error, stats) => {
    if (error || !stats.isFile()) {
      response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('Nije pronađeno.');
      return;
    }
    response.writeHead(200, {
      'Content-Type': mimeTypes[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'Permissions-Policy': 'microphone=(self), screen-wake-lock=(self)'
    });
    fs.createReadStream(filePath).pipe(response);
  });
}

const server = http.createServer((request, response) => {
  const requestUrl = new URL(request.url || '/', `http://${host}:${port}`);
  const pathname = decodeURIComponent(requestUrl.pathname);
  const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const requested = path.resolve(root, relative);

  if (requested !== root && !requested.startsWith(`${root}${path.sep}`)) {
    response.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
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

server.listen(port, host, () => console.log(`[Clarity] Pokrenut na http://${host}:${port}`));

let shuttingDown = false;
function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;

  // Chrome može ostaviti keep-alive vezu otvorenom. Zatvaramo je kako port ne bi ostao zauzet.
  server.closeIdleConnections?.();
  server.closeAllConnections?.();
  server.close(() => process.exit(0));

  // Sigurnosni izlaz ako neka veza ipak spriječi uredno zatvaranje.
  setTimeout(() => process.exit(0), 500).unref();
}

for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, shutdown);
