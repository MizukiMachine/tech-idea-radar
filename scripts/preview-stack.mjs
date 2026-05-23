#!/usr/bin/env node
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const devStackInfoFile = path.join(rootDir, '.tmp', 'dev-stack.json');
const explicitBackendUrl = process.env.PREVIEW_BACKEND_URL ?? process.env.VITE_PROXY_TARGET;
const explicitStackId = process.env.BAC_DEV_STACK_ID?.trim() ?? '';
const devStackInfo = readDevStackInfo();
const host = process.env.PREVIEW_HOST ?? '127.0.0.1';
const frontendPort = parsePort(process.env.PREVIEW_FRONTEND_PORT ?? process.env.FRONTEND_PORT, 5191, 'PREVIEW_FRONTEND_PORT');
const backendUrl = (explicitBackendUrl ?? devStackInfo?.backendUrl ?? '').replace(/\/$/, '');
const stackId = explicitStackId || devStackInfo?.stackId || '';
const frontendDistDir = path.resolve(rootDir, process.env.FRONTEND_DIST_DIR?.trim() || 'frontend/dist');
const allowUnverifiedBackend = process.env.BAC_ALLOW_UNVERIFIED_PREVIEW_BACKEND === 'true';

const contentTypes = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.png', 'image/png'],
  ['.ico', 'image/x-icon'],
]);

function parsePort(value, fallback, name) {
  if (value === undefined || value === '') return fallback;
  const port = Number(value);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error(`${name} must be a valid TCP port, got: ${value}`);
  }
  return port;
}

function readDevStackInfo() {
  try {
    const parsed = JSON.parse(fs.readFileSync(devStackInfoFile, 'utf8'));
    if (!parsed || typeof parsed !== 'object') return null;
    const backendUrl = typeof parsed.backendUrl === 'string' ? parsed.backendUrl.trim() : '';
    const stackId = typeof parsed.stackId === 'string' ? parsed.stackId.trim() : '';
    if (!backendUrl || !stackId) return null;
    return { backendUrl, stackId };
  } catch {
    return null;
  }
}

function sendFile(res, file) {
  fs.readFile(file, (error, data) => {
    if (error) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }

    res.writeHead(200, {
      'content-type': contentTypes.get(path.extname(file)) || 'application/octet-stream',
    });
    res.end(data);
  });
}

function isInsideDirectory(root, file) {
  const relative = path.relative(root, file);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

async function proxyToBackend(req, res, url) {
  const target = `${backendUrl}${url.pathname}${url.search}`;
  const headers = {
    ...req.headers,
    host: new URL(backendUrl).host,
    'x-bac-dev-stack-id': stackId,
  };

  try {
    const upstream = await fetch(target, {
      method: req.method,
      headers,
      body: ['GET', 'HEAD'].includes(req.method || 'GET') ? undefined : req,
      duplex: 'half',
    });
    const responseHeaders = Object.fromEntries(upstream.headers);
    delete responseHeaders['content-length'];
    delete responseHeaders['content-encoding'];
    res.writeHead(upstream.status, responseHeaders);

    if (!upstream.body) {
      res.end();
      return;
    }

    Readable.fromWeb(upstream.body).pipe(res);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    res.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' });
    res.end(message);
  }
}

async function assertVerifiedBackend() {
  if (allowUnverifiedBackend) {
    console.warn('[preview] BAC_ALLOW_UNVERIFIED_PREVIEW_BACKEND=true; skipping backend dev-stack verification.');
    return;
  }

  let response;
  try {
    response = await fetch(`${backendUrl}/health`, {
      cache: 'no-store',
      headers: {
        'x-bac-dev-stack-id': stackId,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Preview backend health check failed at ${backendUrl}/health (${message}).`);
  }

  if (!response.ok) {
    throw new Error(`Preview backend health check returned HTTP ${response.status} at ${backendUrl}/health.`);
  }

  let health;
  try {
    health = await response.json();
  } catch {
    throw new Error(`Preview backend health check at ${backendUrl}/health did not return JSON.`);
  }

  if (health?.status !== 'ok' || health?.service !== 'builder-agent-chain-backend') {
    throw new Error('Preview backend health check did not identify the expected builder-agent-chain backend.');
  }

  if (health?.process?.devStackId !== stackId) {
    throw new Error(`Preview backend devStackId mismatch; expected ${stackId}, got ${health?.process?.devStackId ?? 'none'}.`);
  }

  if (health?.config?.requireDevStackHeader !== true) {
    throw new Error('Preview backend is not enforcing the dev-stack API boundary.');
  }
}

function serveFrontend(req, res, url) {
  const requested = path.normalize(decodeURIComponent(url.pathname)).replace(/^[/\\]+/, '');
  const file = path.resolve(frontendDistDir, requested || 'index.html');
  if (!isInsideDirectory(frontendDistDir, file)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.stat(file, (error, stat) => {
    if (!error && stat.isFile()) {
      sendFile(res, file);
      return;
    }
    sendFile(res, path.join(frontendDistDir, 'index.html'));
  });
}

if (!fs.existsSync(path.join(frontendDistDir, 'index.html'))) {
  throw new Error(`frontend build was not found at ${frontendDistDir}. Run npm run frontend:build first.`);
}

if (!backendUrl) {
  throw new Error([
    `No verified dev-stack backend metadata found at ${devStackInfoFile}.`,
    'Start the stack with `npm run dev` first, or pass PREVIEW_BACKEND_URL explicitly.',
  ].join(' '));
}

if (!allowUnverifiedBackend && !stackId) {
  throw new Error([
    `No verified dev-stack id found at ${devStackInfoFile}.`,
    'Start the stack with `npm run dev` first, or pass BAC_DEV_STACK_ID explicitly.',
  ].join(' '));
}

await assertVerifiedBackend();

const server = http.createServer((req, res) => {
  const url = new URL(req.url || '/', `http://${host}:${frontendPort}`);
  if (url.pathname === '/health' || url.pathname.startsWith('/api/')) {
    void proxyToBackend(req, res, url);
    return;
  }

  serveFrontend(req, res, url);
});

server.listen(frontendPort, host, () => {
  console.log(`[preview] Frontend preview listening at http://${host}:${frontendPort}`);
  console.log(`[preview] Proxying /api and /health to ${backendUrl} with stack ${stackId}`);
});
