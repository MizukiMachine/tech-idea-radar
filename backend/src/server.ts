import "dotenv/config";
import http from "node:http";
import app from "./app";
import {
  startBackgroundCacheRefresh,
  flushPersistentCache,
  isGenerationInProgress,
  waitForGeneration,
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

  // If a generation is in progress, wait for it to finish (up to 25s)
  if (isGenerationInProgress()) {
    console.log("[shutdown] Waiting for in-progress generation to complete...");
    try {
      await waitForGeneration(GENERATION_WAIT_MS);
      console.log("[shutdown] Generation completed.");
    } catch {
      console.warn("[shutdown] Generation wait timed out, proceeding with shutdown.");
    }
  }

  server.close(() => {
    console.log("[shutdown] HTTP server closed.");
    try {
      flushPersistentCache();
    } catch (e) {
      console.error("[shutdown] Failed to flush cache:", e);
    }
    process.exit(0);
  });

  // Force exit after 30s if connections don't drain
  setTimeout(() => {
    console.warn(`[shutdown] Force exit after ${SHUTDOWN_TIMEOUT_MS / 1000}s timeout.`);
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
