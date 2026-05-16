import { Router } from "express";
import os from "node:os";
import {
  getIdeaCacheStatus,
  getTrendCacheStatus,
  getCachedIdeas,
  isPublicReadonlyMode,
  isPersistentCacheEnabled,
  isGenerationInProgress,
} from "../services/idea-cache";

const healthRouter = Router();

healthRouter.get("/", (_req, res) => {
  const cached = getCachedIdeas();

  res.status(200).json({
    status: "ok",
    service: "builder-agent-chain-backend",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    system: {
      hostname: os.hostname(),
      nodeVersion: process.version,
      platform: os.platform(),
      arch: os.arch(),
      cpuCount: os.cpus().length,
      memoryUsage: {
        rss: `${Math.round(process.memoryUsage().rss / 1024 / 1024)}MB`,
        heapUsed: `${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`,
        heapTotal: `${Math.round(process.memoryUsage().heapTotal / 1024 / 1024)}MB`,
      },
      loadAvg: os.loadavg().map((v) => Math.round(v * 100) / 100),
    },
    config: {
      publicReadonlyMode: isPublicReadonlyMode(),
      persistentCacheEnabled: isPersistentCacheEnabled(),
      hasApiKey: Boolean(process.env.ZAI_API_KEY),
      port: process.env.PORT ?? "3001",
      nodeEnv: process.env.NODE_ENV ?? "development",
    },
    cache: {
      ideaStatus: getIdeaCacheStatus(),
      trendStatus: getTrendCacheStatus(),
      candidateCount: cached?.candidates.length ?? 0,
      generatedAt: cached?.generatedAt ?? null,
      generationInProgress: isGenerationInProgress(),
    },
    process: {
      pid: process.pid,
      ppid: process.ppid,
      appInstance: process.env.NODE_APP_INSTANCE ?? null,
    },
  });
});

export default healthRouter;
