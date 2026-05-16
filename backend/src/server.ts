import "dotenv/config";
import http from "node:http";
import app from "./app";
import { startBackgroundCacheRefresh, flushPersistentCache } from "./services/idea-cache";

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
});

// --- Graceful shutdown ---
let shuttingDown = false;

function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`\n[${signal}] Shutting down gracefully...`);

  server.close(() => {
    console.log("[shutdown] HTTP server closed.");
    try {
      flushPersistentCache();
    } catch (e) {
      console.error("[shutdown] Failed to flush cache:", e);
    }
    process.exit(0);
  });

  // Force exit after 10s if connections don't drain
  setTimeout(() => {
    console.warn("[shutdown] Force exit after 10s timeout.");
    process.exit(1);
  }, 10_000);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
