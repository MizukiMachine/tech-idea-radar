#!/usr/bin/env node
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const host = process.env.PREVIEW_HOST ?? '127.0.0.1';
const frontendPort = parsePort(process.env.PREVIEW_FRONTEND_PORT ?? process.env.FRONTEND_PORT, 5191, 'PREVIEW_FRONTEND_PORT');
const backendUrl = (process.env.PREVIEW_BACKEND_URL ?? process.env.VITE_PROXY_TARGET ?? 'http://127.0.0.1:3020').replace(/\/$/, '');
const stackId = process.env.BAC_DEV_STACK_ID?.trim() ?? 'manual-retention-3020';
const frontendDistDir = path.resolve(rootDir, process.env.FRONTEND_DIST_DIR?.trim() || 'frontend/dist');

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
