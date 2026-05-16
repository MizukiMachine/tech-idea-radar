import "dotenv/config";
import http from "node:http";
import app from "./app";
import {
  startBackgroundCacheRefresh,
  flushPersistentCache,
  isCacheActivityInProgress,
  waitForCacheActivity,
} from "./services/idea-cache";

const DEFAULT_PORT = 3001;
const rawPort = process.env.PORT ?? DEFAULT_PORT;
const port = typeof rawPort === "string" ? parseInt(rawPort, 10) : rawPort;

if (Number.isNaN(port)) {
  throw new Error("Invalid PORT environment variable. Please provide a numeric value.");
}

const server = http.createServer(app);

server.listen(port, () => {
  console.log(`Backend service listening on port ${port}`);
  startBackgroundCacheRefresh();

  // Signal readiness to PM2 (required for wait_ready + reload)
  if (typeof process.send === "function") {
    process.send("ready");
  }
});

// --- Graceful shutdown ---
let shuttingDown = false;
const SHUTDOWN_TIMEOUT_MS = 30_000;
const GENERATION_WAIT_MS = 25_000;

async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`\n[${signal}] Shutting down gracefully...`);

  const forceExitTimer = setTimeout(() => {
    console.warn(`[shutdown] Force exit after ${SHUTDOWN_TIMEOUT_MS / 1000}s timeout.`);
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);

  const serverClosed = new Promise<void>((resolve) => {
    server.close((error?: Error) => {
      if (error) {
        console.error("[shutdown] HTTP server close failed:", error);
      } else {
        console.log("[shutdown] HTTP server closed.");
      }
      resolve();
    });
  });
  server.closeIdleConnections?.();

  if (isCacheActivityInProgress()) {
    console.log("[shutdown] Waiting for in-progress cache activity to complete...");
    try {
      await waitForCacheActivity(GENERATION_WAIT_MS);
      console.log("[shutdown] Cache activity completed.");
    } catch {
      console.warn("[shutdown] Cache activity wait timed out, proceeding with shutdown.");
    }
  }

  await serverClosed;

  try {
    flushPersistentCache();
  } catch (e) {
    console.error("[shutdown] Failed to flush cache:", e);
  }

  clearTimeout(forceExitTimer);
  process.exit(0);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
