/**
 * Clarity phone preview: static build/ + ephemeral HTTPS link + terminal QR.
 * Uses Python's standard HTTP server and Cloudflare Quick Tunnel.
 * No changes to the production server or STT pipeline.
 */
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import { request } from 'node:http';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const directory = resolve(root, 'build');
const port = 5173;
const address = `http://127.0.0.1:${port}`;
const children = [];
let stopping = false;

function available(command) {
  const result = spawnSync(command, ['--version'], { stdio: 'ignore', timeout: 5000 });
  return !result.error && result.status === 0;
}

function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (child && !child.killed) child.kill('SIGTERM');
  }
  process.exitCode = code;
}

for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => stop());

async function ensurePortAvailable() {
  return new Promise((done, reject) => {
    const test = createServer();
    test.once('error', reject);
    test.listen(port, '127.0.0.1', () => test.close(done));
  });
}

function checkHttp() {
  return new Promise(resolveCheck => {
    const req = request(`${address}/`, { method: 'GET', timeout: 1000 }, res => {
      res.resume();
      resolveCheck(res.statusCode === 200);
    });
    req.once('error', () => resolveCheck(false));
    req.once('timeout', () => { req.destroy(); resolveCheck(false); });
    req.end();
  });
}

async function waitForServer() {
  for (let attempt = 0; attempt < 35; attempt += 1) {
    if (await checkHttp()) return;
    await new Promise(r => setTimeout(r, 100));
  }
  throw new Error('Lokalni preview se nije pokrenuo na portu 5173.');
}

async function main() {
  if (!existsSync(resolve(directory, 'index.html'))) {
    throw new Error('Nedostaje build/index.html. Pokreni naredbu u rootu Clarity projekta.');
  }
  if (!available('python3')) {
    throw new Error('Nedostaje python3. Instaliraj Python 3 ili provjeri naredbu python3 --version.');
  }
  if (!available('cloudflared')) {
    throw new Error('Nedostaje cloudflared. Na Macu pokreni: brew install cloudflared qrencode');
  }
  await ensurePortAvailable();

  const local = spawn('python3', [
    '-m', 'http.server', String(port), '--bind', '127.0.0.1', '--directory', directory
  ], { stdio: ['ignore', 'ignore', 'pipe'] });
  children.push(local);
  let localErrors = '';
  local.stderr.setEncoding('utf8');
  local.stderr.on('data', data => { localErrors += data; });
  local.once('exit', code => {
    if (!stopping) {
      console.error(`\nLokalni server je zaustavljen (kod ${code ?? '?'}). ${localErrors.trim()}`);
      stop(1);
    }
  });

  await waitForServer();
  console.log(`\nClarity web preview: http://localhost:${port}`);
  console.log('Pokrecem privremenu HTTPS adresu za telefon...\n');

  const tunnel = spawn('cloudflared', [
    'tunnel', '--url', address
  ], { stdio: ['ignore', 'pipe', 'pipe'] });
  children.push(tunnel);

  let found = false;
  let buffer = '';
  const inspect = chunk => {
    if (found) return;
    buffer = (buffer + chunk.toString('utf8')).slice(-8000);
    const match = buffer.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com\/?/i);
    if (!match) return;
    found = true;
    const url = match[0];
    console.log('--- CLARITY PHONE PREVIEW ---');
    console.log(`HTTPS: ${url}`);
    console.log('Na telefonu skeniraj QR kod ili otvori gornji HTTPS link.');
    console.log('Za prekid: Ctrl+C\n');

    if (available('qrencode')) {
      const qr = spawn('qrencode', ['-t', 'ANSIUTF8', '-m', '1', url], { stdio: 'inherit' });
      qr.once('error', () => console.log('QR nije moguce ispisati. Otvori HTTPS adresu iznad.'));
    } else {
      console.log('Za QR kod instaliraj: brew install qrencode');
    }
  };

  tunnel.stdout.on('data', inspect);
  tunnel.stderr.on('data', inspect);
  tunnel.once('error', error => { console.error(`Cloudflare Tunnel: ${error.message}`); stop(1); });
  tunnel.once('exit', code => {
    if (!stopping) {
      console.error(`\nHTTPS tunnel je zavrsio (kod ${code ?? '?'}).`);
      stop(1);
    }
  });
}

main().catch(error => { console.error(`\nClarity preview: ${error.message}`); stop(1); });
