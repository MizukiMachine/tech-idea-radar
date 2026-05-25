import { Router } from "express";
import os from "node:os";
import {
  getIdeaCacheStatus,
  getTrendCacheStatus,
  getCachedIdeas,
  getBatchInfos,
  isPublicReadonlyMode,
  isPersistentCacheEnabled,
  isCacheDisabled,
  isGenerationInProgress,
} from "../services/idea-cache";

const healthRouter = Router();

healthRouter.get("/", (_req, res) => {
  const cached = getCachedIdeas();
  const persistentCacheEnabled = isPersistentCacheEnabled();
  const cacheDisabled = isCacheDisabled();
  const corsConfigured = (process.env.CORS_ORIGIN ?? "").trim().length > 0;

  res.status(200).json({
    status: "ok",
    service: "tech-idea-radar-backend",
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
      persistentCacheEnabled,
      cacheDisabled,
      hasApiKey: Boolean(process.env.ZAI_API_KEY),
      corsConfigured,
      port: process.env.PORT ?? "3001",
      nodeEnv: process.env.NODE_ENV ?? "development",
      requireDevStackHeader: process.env.BAC_REQUIRE_DEV_STACK_HEADER === "true",
    },
    cache: {
      hasData: Boolean(cached && cached.candidates.length > 0),
      ideaStatus: getIdeaCacheStatus(),
      trendStatus: getTrendCacheStatus(),
      candidateCount: cached?.candidates.length ?? 0,
      generatedAt: cached?.generatedAt ?? null,
      batchCount: getBatchInfos().length,
      persistentCacheEnabled,
      cacheDisabled,
      generationInProgress: isGenerationInProgress(),
    },
    process: {
      pid: process.pid,
      ppid: process.ppid,
      appInstance: process.env.NODE_APP_INSTANCE ?? null,
      devStackId: process.env.BAC_DEV_STACK_ID ?? null,
    },
  });
});

export default healthRouter;
