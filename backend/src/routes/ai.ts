import { Router, Request, Response } from 'express';
import { z } from 'zod';
import {
  getCachedIdeas,
  getCachedTrends,
  generateAndCacheIdeas,
  filterCachedIdeas,
  getRuntimeMeta,
  getAdminApiToken,
  getIdeaCacheStatus,
  getTrendCacheStatus,
  isAdminAuthEnabled,
  isPublicReadonlyMode,
  scanAndCacheTrends,
  getBatchInfos,
  getTrendHistory,
  getCachedTrendByIndex,
  getCachedTrendSnapshots,
} from '../services/idea-cache';
import {
  RSS_ARTICLE_SUMMARY_POLICY,
  isRssSourceUnavailableError,
  type IdeaCandidate,
  type TrendScanOutput,
} from 'ai-engine';

// --- Request schemas ---

const CandidateInputSchema = z.object({
  id: z.string(),
  title: z.string(),
  tagline: z.string(),
  description: z.string(),
  tags: z.array(z.string()),
  productType: z.string(),
  targetUsers: z.string(),
  coreProblem: z.string(),
  differentiation: z.string(),
  sources: z.object({
    rssKeywords: z.array(z.string()),
    evidenceUrls: z.array(z.object({
      title: z.string(),
      url: z.string(),
      type: z.string(),
    }).passthrough()).optional(),
  }).passthrough(),
  generatedAt: z.string(),
  batchTime: z.string().optional(),
}).passthrough();

const FilterInputSchema = z.object({
  query: z.string(),
  topK: z.number().optional(),
  candidates: z.array(CandidateInputSchema).optional(),
});

const RefreshIdeasInputSchema = z.object({
  focusKeyword: z.string().trim().min(1).max(120).optional(),
});

const MAX_TREND_HISTORY_SNAPSHOT_RESPONSE = 30;

function formatZodError(error: z.ZodError): string {
  return error.issues.map((e: z.ZodIssue) => `${e.path.join('.')}: ${e.message}`).join('; ');
}

function emptyTrendScan(): TrendScanOutput {
  return {
    rssContext: {
      trendingKeywords: [],
      relatedArticles: [],
    },
    focusKeywords: [],
    generatedAt: '',
    batchTime: undefined,
    summaryPolicy: RSS_ARTICLE_SUMMARY_POLICY,
    sourceSummary: {
      rssItemCount: 0,
      usedLLMFallback: false,
    },
  };
}

function extractBearerToken(req: Request): string {
  const header = req.get('authorization') ?? '';
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match?.[1]?.trim() ?? req.get('x-admin-token')?.trim() ?? '';
}

function isAdminRequest(req: Request): boolean {
  const token = getAdminApiToken();
  if (!token) return !isPublicReadonlyMode();
  return extractBearerToken(req) === token;
}

function requireAdmin(req: Request, res: Response): boolean {
  if (isAdminRequest(req)) return true;
  const authEnabled = isAdminAuthEnabled();
  res.status(authEnabled ? 401 : 403).json({
    error: authEnabled
      ? 'Admin token required.'
      : 'This deployment is read-only. Configure ADMIN_API_TOKEN to enable refresh operations.',
  });
  return false;
}

function parseSnapshotLimit(value: unknown): number {
  const rawValue = Array.isArray(value) ? value[0] : value;
  const parsed = Number.parseInt(String(rawValue ?? ''), 10);
  if (!Number.isFinite(parsed) || parsed < 0) return MAX_TREND_HISTORY_SNAPSHOT_RESPONSE;
  return Math.min(parsed, MAX_TREND_HISTORY_SNAPSHOT_RESPONSE);
}

function shouldIncludeSnapshots(value: unknown): boolean {
  const rawValue = Array.isArray(value) ? value[0] : value;
  return ['1', 'true', 'yes'].includes(String(rawValue ?? '').trim().toLowerCase());
}

// --- SSE helper ---

function sseSend(res: Response, event: string, data: unknown, disconnected: boolean): boolean {
  if (disconnected) return false;
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  return res.write(payload);
}

// --- Routes ---

const router = Router();

// GET /api/ai/ideas/meta — runtime + cache metadata
router.get('/ideas/meta', (_req: Request, res: Response) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json(getRuntimeMeta());
});

// GET /api/ideas — cached ideas
router.get('/ideas', async (_req: Request, res: Response) => {
  try {
    const cached = getCachedIdeas();
    const batchInfos = getBatchInfos();
    if (cached) {
      res.json({ status: getIdeaCacheStatus(), ...cached, batches: batchInfos });
      return;
    }

    res.json({
      status: 'empty',
      candidates: [],
      generatedAt: '',
      sourceSummary: {
        rssItemCount: 0,
        usedLLMFallback: false,
      },
      batches: [],
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[API] GET /ideas error: ${message}`);
    res.status(500).json({ error: message });
  }
});

// GET /api/trends — cached trend context, or a fresh scan outside read-only mode
router.get('/trends', async (_req: Request, res: Response) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const cached = getCachedTrends();
    if (cached) {
      res.json({ status: getTrendCacheStatus(), ...cached });
      return;
    }

    if (isPublicReadonlyMode()) {
      res.json({ status: 'empty', ...emptyTrendScan() });
      return;
    }

    const result = await scanAndCacheTrends();
    res.json({ status: 'fresh', ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[API] GET /trends error: ${message}`);
    res.status(isRssSourceUnavailableError(error) ? 503 : 500).json({
      error: message,
      code: isRssSourceUnavailableError(error) ? 'RSS_SOURCE_UNAVAILABLE' : 'INTERNAL_ERROR',
    });
  }
});

// GET /api/trends/history — trend history metadata
router.get('/trends/history', async (_req: Request, res: Response) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const history = getTrendHistory();
    if (shouldIncludeSnapshots(_req.query.includeSnapshots)) {
      const limit = parseSnapshotLimit(_req.query.limit);
      res.json({ history, snapshots: getCachedTrendSnapshots(limit) });
      return;
    }
    res.json({ history });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[API] GET /trends/history error: ${message}`);
    res.status(500).json({ error: message });
  }
});

// GET /api/trends/history/:index — specific trend snapshot
router.get('/trends/history/:index', async (req: Request, res: Response) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const index = Number.parseInt(req.params.index, 10);
    if (Number.isNaN(index) || index < 0) {
      res.status(400).json({ error: 'Invalid index. Must be a non-negative integer.' });
      return;
    }

    const snapshot = getCachedTrendByIndex(index);
    if (!snapshot) {
      res.status(404).json({ error: `Trend snapshot at index ${index} not found.` });
      return;
    }

    res.json(snapshot);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[API] GET /trends/history/:index error: ${message}`);
    res.status(500).json({ error: message });
  }
});

// POST /api/trends/refresh — force trend context refresh
router.post('/trends/refresh', async (_req: Request, res: Response) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!requireAdmin(_req, res)) return;

  try {
    const result = await scanAndCacheTrends();
    res.json({ status: 'fresh', ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[API] POST /trends/refresh error: ${message}`);
    res.status(isRssSourceUnavailableError(error) ? 503 : 500).json({
      error: message,
      code: isRssSourceUnavailableError(error) ? 'RSS_SOURCE_UNAVAILABLE' : 'INTERNAL_ERROR',
    });
  }
});

// GET /api/ideas/stream — SSE stream for idea generation
router.get('/ideas/stream', async (_req: Request, res: Response) => {
  const cached = getCachedIdeas();
  if (!cached && !requireAdmin(_req, res)) return;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();
  res.write(': connected\n\n');

  let disconnected = false;
  res.on('close', () => { disconnected = true; });

  try {
    if (cached) {
      // Send cached ideas as rapid-fire events
      for (const idea of cached.candidates) {
        if (!sseSend(res, 'idea_generated', idea, disconnected)) break;
      }
      sseSend(res, 'generation_complete', {
        generatedAt: cached.generatedAt,
        count: cached.candidates.length,
        featuredIdea: cached.featuredIdea,
        sourceSummary: cached.sourceSummary,
        batches: getBatchInfos(),
      }, disconnected);
    } else {
      // Generate new ideas with progress streaming
      const result = await generateAndCacheIdeas((text) => {
        sseSend(res, 'generation_progress', { text }, disconnected);
      });

      for (const idea of result.candidates) {
        if (!sseSend(res, 'idea_generated', idea, disconnected)) break;
      }
      sseSend(res, 'generation_complete', {
        generatedAt: result.generatedAt,
        count: result.candidates.length,
        featuredIdea: result.featuredIdea,
        sourceSummary: result.sourceSummary,
        batches: getBatchInfos(),
      }, disconnected);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[API] GET /ideas/stream error: ${message}`);
    sseSend(res, 'error', {
      error: message,
      code: isRssSourceUnavailableError(error) ? 'RSS_SOURCE_UNAVAILABLE' : 'INTERNAL_ERROR',
    }, disconnected);
  }

  if (!disconnected) res.end();
});

// POST /api/ideas/filter — LLM semantic filter
router.post('/ideas/filter', async (req: Request, res: Response) => {
  if (isPublicReadonlyMode() && !requireAdmin(req, res)) return;

  const parsed = FilterInputSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: `Validation failed: ${formatZodError(parsed.error)}` });
    return;
  }

  const { query, topK } = parsed.data;

  try {
    const candidateSource = (parsed.data.candidates as IdeaCandidate[] | undefined)
      ?? getCachedIdeas()?.candidates;
    if (!candidateSource || candidateSource.length === 0) {
      res.status(503).json({ error: 'Ideas not yet generated. Please try again in a moment.' });
      return;
    }

    const result = await filterCachedIdeas({
      query,
      candidates: topK ? candidateSource.slice(0, topK) : candidateSource,
      topK,
    });

    res.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[API] POST /ideas/filter error: ${message}`);
    res.status(500).json({ error: message });
  }
});

// POST /api/ideas/refresh — force cache refresh (SSE)
router.post('/ideas/refresh', async (_req: Request, res: Response) => {
  if (!requireAdmin(_req, res)) return;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();
  res.write(': connected\n\n');

  let disconnected = false;
  res.on('close', () => { disconnected = true; });

  try {
    const parsed = RefreshIdeasInputSchema.safeParse(_req.body ?? {});
    if (!parsed.success) {
      sseSend(res, 'error', { error: `Validation failed: ${formatZodError(parsed.error)}` }, disconnected);
      if (!disconnected) res.end();
      return;
    }

    const focusKeywords = parsed.data.focusKeyword ? [parsed.data.focusKeyword] : undefined;
    const result = await generateAndCacheIdeas((text) => {
      sseSend(res, 'generation_progress', { text }, disconnected);
    }, focusKeywords);

    for (const idea of result.candidates) {
      if (!sseSend(res, 'idea_generated', idea, disconnected)) break;
    }
    sseSend(res, 'generation_complete', {
      generatedAt: result.generatedAt,
      count: result.candidates.length,
      featuredIdea: result.featuredIdea,
      sourceSummary: result.sourceSummary,
      batches: getBatchInfos(),
    }, disconnected);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[API] POST /ideas/refresh error: ${message}`);
    sseSend(res, 'error', {
      error: message,
      code: isRssSourceUnavailableError(error) ? 'RSS_SOURCE_UNAVAILABLE' : 'INTERNAL_ERROR',
    }, disconnected);
  }

  if (!disconnected) res.end();
});

export default router;
