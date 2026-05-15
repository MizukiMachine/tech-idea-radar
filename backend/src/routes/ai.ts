import { Router, Request, Response } from 'express';
import { z } from 'zod';
import {
  getCachedIdeas,
  getCachedTrends,
  generateAndCacheIdeas,
  filterCachedIdeas,
  getRuntimeMeta,
  getXUsageSnapshot,
  scanAndCacheTrends,
} from '../services/idea-cache';

// --- Request schemas ---

const FilterInputSchema = z.object({
  query: z.string(),
  topK: z.number().optional(),
});

const RefreshIdeasInputSchema = z.object({
  focusKeyword: z.string().trim().min(1).max(120).optional(),
});

function formatZodError(error: z.ZodError): string {
  return error.issues.map((e: z.ZodIssue) => `${e.path.join('.')}: ${e.message}`).join('; ');
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

// GET /api/ai/x-usage — current X API usage snapshot
router.get('/x-usage', async (_req: Request, res: Response) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const usage = await getXUsageSnapshot();
    if (!usage) {
      res.status(503).json({ error: 'X usage is unavailable. Check X credentials or XMCP server settings.' });
      return;
    }
    res.json(usage);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[API] GET /x-usage error: ${message}`);
    res.status(500).json({ error: message });
  }
});

// GET /api/ideas — cached ideas
router.get('/ideas', async (_req: Request, res: Response) => {
  try {
    const cached = getCachedIdeas();
    if (cached) {
      res.json({ status: 'cached', ...cached });
      return;
    }

    res.json({
      status: 'empty',
      candidates: [],
      generatedAt: '',
      sourceSummary: {
        rssItemCount: 0,
        xSignalCount: 0,
        usedLLMFallback: false,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[API] GET /ideas error: ${message}`);
    res.status(500).json({ error: message });
  }
});

// GET /api/trends — cached or freshly scanned RSS/X trend context
router.get('/trends', async (_req: Request, res: Response) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const cached = getCachedTrends();
    if (cached) {
      res.json({ status: 'cached', ...cached });
      return;
    }

    const result = await scanAndCacheTrends();
    res.json({ status: 'fresh', ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[API] GET /trends error: ${message}`);
    res.status(500).json({ error: message });
  }
});

// POST /api/trends/refresh — force trend context refresh
router.post('/trends/refresh', async (_req: Request, res: Response) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const result = await scanAndCacheTrends();
    res.json({ status: 'fresh', ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[API] POST /trends/refresh error: ${message}`);
    res.status(500).json({ error: message });
  }
});

// GET /api/ideas/stream — SSE stream for idea generation
router.get('/ideas/stream', async (_req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();
  res.write(': connected\n\n');

  let disconnected = false;
  res.on('close', () => { disconnected = true; });

  try {
    const cached = getCachedIdeas();
    if (cached) {
      // Send cached ideas as rapid-fire events
      for (const idea of cached.candidates) {
        if (!sseSend(res, 'idea_generated', idea, disconnected)) break;
      }
      sseSend(res, 'generation_complete', {
        generatedAt: cached.generatedAt,
        count: cached.candidates.length,
        sourceSummary: cached.sourceSummary,
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
        sourceSummary: result.sourceSummary,
      }, disconnected);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[API] GET /ideas/stream error: ${message}`);
    sseSend(res, 'error', { error: message }, disconnected);
  }

  if (!disconnected) res.end();
});

// POST /api/ideas/filter — LLM semantic filter
router.post('/ideas/filter', async (req: Request, res: Response) => {
  const parsed = FilterInputSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: `Validation failed: ${formatZodError(parsed.error)}` });
    return;
  }

  const { query, topK } = parsed.data;

  try {
    const cached = getCachedIdeas();
    if (!cached) {
      res.status(503).json({ error: 'Ideas not yet generated. Please try again in a moment.' });
      return;
    }

    const result = await filterCachedIdeas({
      query,
      candidates: topK ? cached.candidates.slice(0, topK) : cached.candidates,
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
      sourceSummary: result.sourceSummary,
    }, disconnected);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[API] POST /ideas/refresh error: ${message}`);
    sseSend(res, 'error', { error: message }, disconnected);
  }

  if (!disconnected) res.end();
});

export default router;
