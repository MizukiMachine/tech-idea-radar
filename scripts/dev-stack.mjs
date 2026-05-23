#!/usr/bin/env node
import { execFile, spawn } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import net from 'node:net';
import path from 'node:path';

const rootDir = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const host = process.env.DEV_HOST ?? '127.0.0.1';
const backendPort = parsePort(process.env.DEV_BACKEND_PORT ?? process.env.BACKEND_PORT, 3010, 'DEV_BACKEND_PORT');
const frontendPort = parsePort(process.env.DEV_FRONTEND_PORT ?? process.env.FRONTEND_PORT, 5180, 'DEV_FRONTEND_PORT');
const backendUrl = `http://${host}:${backendPort}`;
const frontendUrl = `http://${host}:${frontendPort}`;
const stackId = `dev-${process.pid}-${Date.now().toString(36)}`;
const tmpDir = path.join(rootDir, '.tmp');
const devStackInfoFile = path.join(tmpDir, 'dev-stack.json');
const children = new Set();
const allowStaleBuilderProcesses = process.env.BAC_ALLOW_STALE_BUILDER_PROCESSES === 'true';
let shuttingDown = false;
let shutdownExitCode = 0;
let shutdownTimer = null;

function parsePort(value, fallback, name) {
  if (value === undefined || value === '') return fallback;
  const port = Number(value);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error(`${name} must be a valid TCP port, got: ${value}`);
  }
  return port;
}

async function assertPortFree(port, label) {
  const server = net.createServer();
  server.on('error', () => {});
  try {
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen({ host, port }, resolve);
    });
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? error.code : 'UNKNOWN';
    throw new Error(`${label} port ${port} is not free (${code}). Stop the existing process or set ${label === 'backend' ? 'DEV_BACKEND_PORT' : 'DEV_FRONTEND_PORT'}.`);
  } finally {
    if (server.listening) {
      server.close();
      await once(server, 'close');
    }
  }
}

function execFileText(command, args) {
  return new Promise((resolve) => {
    execFile(command, args, { maxBuffer: 1024 * 1024 }, (error, stdout) => {
      if (error && error.code === 'ENOENT') {
        resolve(null);
        return;
      }
      resolve(stdout ?? '');
    });
  });
}

function parseLsofListeners(output) {
  return output
    .split(/\r?\n/)
    .slice(1)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const columns = line.split(/\s+/);
      const pid = Number(columns[1]);
      const name = columns.slice(8).join(' ');
      const port = Number(/:(\d+)\s+\(LISTEN\)$/.exec(name)?.[1]);
      return Number.isInteger(pid) && Number.isInteger(port) ? { pid, port, name } : null;
    })
    .filter(Boolean);
}

function parsePsCommands(output) {
  const commands = new Map();
  for (const line of output.split(/\r?\n/)) {
    const match = /^\s*(\d+)\s+(.*)$/.exec(line);
    if (match) commands.set(Number(match[1]), match[2]);
  }
  return commands;
}

function processCwd(pid) {
  try {
    return fs.realpathSync(`/proc/${pid}/cwd`);
  } catch {
    return '';
  }
}

function isBuilderAgentChainProcess(listener, command) {
  const cwd = processCwd(listener.pid);
  return cwd.includes('/builder-agent-chain') || command.includes('/builder-agent-chain');
}

async function findStaleBuilderAgentListeners() {
  const lsofOutput = await execFileText('lsof', ['-n', '-P', '-iTCP', '-sTCP:LISTEN']);
  if (lsofOutput === null) {
    console.warn('[dev] lsof is not available; skipping stale builder-agent-chain listener detection.');
    return [];
  }

  const listeners = parseLsofListeners(lsofOutput)
    .filter((listener) => listener.port !== backendPort && listener.port !== frontendPort);
  if (listeners.length === 0) return [];

  const psOutput = await execFileText('ps', ['-o', 'pid=,command=', '-p', listeners.map((listener) => String(listener.pid)).join(',')]);
  const commands = psOutput === null ? new Map() : parsePsCommands(psOutput);

  return listeners
    .map((listener) => ({
      ...listener,
      command: commands.get(listener.pid) ?? '',
      cwd: processCwd(listener.pid),
    }))
    .filter((listener) => isBuilderAgentChainProcess(listener, listener.command));
}

async function assertNoStaleBuilderAgentListeners() {
  if (allowStaleBuilderProcesses) return;

  const staleListeners = await findStaleBuilderAgentListeners();
  if (staleListeners.length === 0) return;

  const detail = staleListeners
    .map((listener) => {
      const where = listener.cwd || listener.command || listener.name;
      return `  - port ${listener.port}, pid ${listener.pid}: ${where}`;
    })
    .join('\n');

  throw new Error([
    'Detected existing builder-agent-chain server processes on other ports.',
    detail,
    'Stop the stale process or set BAC_ALLOW_STALE_BUILDER_PROCESSES=true if you intentionally want multiple stacks.',
  ].join('\n'));
}

function prefixOutput(child, label) {
  const write = (stream, chunk) => {
    for (const line of chunk.toString().split(/\r?\n/)) {
      if (line.length > 0) stream.write(`[${label}] ${line}\n`);
    }
  };
  child.stdout?.on('data', (chunk) => write(process.stdout, chunk));
  child.stderr?.on('data', (chunk) => write(process.stderr, chunk));
}

function spawnProcess(label, args, env) {
  const child = spawn(npmCommand, args, {
    cwd: rootDir,
    env: {
      ...process.env,
      ...env,
      BAC_DEV_STACK_ID: stackId,
    },
    stdio: ['inherit', 'pipe', 'pipe'],
  });

  children.add(child);
  prefixOutput(child, label);

  child.once('exit', (code, signal) => {
    children.delete(child);
    if (!shuttingDown) {
      console.error(`[dev] ${label} exited (${signal ?? code ?? 0}). Stopping dev stack.`);
      stopAll(code ?? 1);
    } else if (children.size === 0) {
      finishShutdown();
    }
  });

  return child;
}

async function waitForJson(url, validate, label, timeoutMs = 120_000) {
  const startedAt = Date.now();
  let lastError = '';

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url, { cache: 'no-store' });
      if (response.ok) {
        const json = await response.json();
        const validationError = validate(json);
        if (!validationError) return json;
        lastError = validationError;
      } else {
        lastError = `HTTP ${response.status}`;
      }
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }

    await new Promise((resolve) => setTimeout(resolve, 750));
  }

  throw new Error(`${label} did not become ready at ${url}. Last error: ${lastError || 'timeout'}`);
}

function validateBackendHealth(json) {
  if (json?.status !== 'ok') return 'health status is not ok';
  if (json?.process?.devStackId !== stackId) {
    return `health devStackId mismatch; expected ${stackId}, got ${json?.process?.devStackId ?? 'none'}`;
  }
  if (json?.config?.requireDevStackHeader !== true) {
    return 'backend is not enforcing the local dev-stack API boundary';
  }
  return '';
}

function writeDevStackInfo() {
  fs.mkdirSync(tmpDir, { recursive: true });
  fs.writeFileSync(devStackInfoFile, `${JSON.stringify({
    stackId,
    backendUrl,
    frontendUrl,
    backendPort,
    frontendPort,
    host,
    pid: process.pid,
    startedAt: new Date().toISOString(),
  }, null, 2)}\n`);
}

function removeDevStackInfo() {
  try {
    const current = JSON.parse(fs.readFileSync(devStackInfoFile, 'utf8'));
    if (current?.stackId === stackId && current?.pid === process.pid) {
      fs.rmSync(devStackInfoFile, { force: true });
    }
  } catch {
    // Missing or malformed metadata should not block shutdown.
  }
}

function stopAll(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  shutdownExitCode = code;
  process.exitCode = code;
  removeDevStackInfo();

  if (children.size === 0) {
    process.exit(code);
  }

  for (const child of children) {
    if (!child.killed) child.kill('SIGTERM');
  }

  shutdownTimer = setTimeout(() => {
    for (const child of children) {
      if (!child.killed) child.kill('SIGKILL');
    }
    process.exit(code === 0 ? 1 : code);
  }, 35_000);
}

function finishShutdown() {
  if (shutdownTimer) {
    clearTimeout(shutdownTimer);
    shutdownTimer = null;
  }
  process.exit(shutdownExitCode);
}

process.on('SIGINT', () => stopAll(0));
process.on('SIGTERM', () => stopAll(0));

try {
  await assertPortFree(backendPort, 'backend');
  await assertPortFree(frontendPort, 'frontend');
  await assertNoStaleBuilderAgentListeners();

  console.log(`[dev] Starting backend on ${backendUrl}`);
  spawnProcess('backend', ['run', 'dev', '--workspace', 'backend'], {
    PORT: String(backendPort),
    BAC_REQUIRE_DEV_STACK_HEADER: 'true',
  });

  await waitForJson(`${backendUrl}/health`, validateBackendHealth, 'backend');
  console.log(`[dev] Backend ready: ${backendUrl}`);

  console.log(`[dev] Starting frontend on ${frontendUrl}`);
  spawnProcess('frontend', ['run', 'dev', '--workspace', 'frontend', '--', '--host', host, '--port', String(frontendPort), '--strictPort'], {
    VITE_PROXY_TARGET: backendUrl,
    VITE_DEV_STACK_ID: stackId,
    VITE_API_BASE_URL: '',
  });

  await waitForJson(`${frontendUrl}/health`, validateBackendHealth, 'frontend proxy');
  writeDevStackInfo();
  console.log(`[dev] Frontend ready: ${frontendUrl}`);
  console.log(`[dev] Verified frontend proxy -> ${backendUrl} (stack ${stackId})`);
} catch (error) {
  console.error(`[dev] ${error instanceof Error ? error.message : String(error)}`);
  stopAll(1);
}
