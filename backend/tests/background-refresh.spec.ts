import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { IdeaGenerationOutput, TrendScanOutput } from "ai-engine";

const originalCacheDisabled = process.env.IDEA_CACHE_DISABLED;
const originalCacheFile = process.env.IDEA_CACHE_FILE;
const originalZaiApiKey = process.env.ZAI_API_KEY;
const originalWarmupOnStart = process.env.IDEA_WARMUP_ON_START;

function restoreEnv() {
  if (originalCacheDisabled === undefined) delete process.env.IDEA_CACHE_DISABLED;
  else process.env.IDEA_CACHE_DISABLED = originalCacheDisabled;

  if (originalCacheFile === undefined) delete process.env.IDEA_CACHE_FILE;
  else process.env.IDEA_CACHE_FILE = originalCacheFile;

  if (originalZaiApiKey === undefined) delete process.env.ZAI_API_KEY;
  else process.env.ZAI_API_KEY = originalZaiApiKey;

  if (originalWarmupOnStart === undefined) delete process.env.IDEA_WARMUP_ON_START;
  else process.env.IDEA_WARMUP_ON_START = originalWarmupOnStart;
}

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function ideaOutput(batchTime?: string): IdeaGenerationOutput {
  const generatedAt = new Date().toISOString();
  return {
    generatedAt,
    batchTime,
    sourceSummary: { rssItemCount: 1, usedLLMFallback: false },
    candidates: [{
      id: "idea-background",
      title: "Background idea",
      tagline: "Generated during startup",
      description: "Startup idea generation should be available before trend summaries.",
      tags: ["startup"],
      productType: "SaaS",
      targetUsers: "Builders",
      coreProblem: "Slow startup generation",
      differentiation: "Prioritizes the idea cache before trend refresh",
      sources: { rssKeywords: ["startup"], evidenceUrls: [] },
      generatedAt,
      batchTime,
    }],
  };
}

function trendOutput(): TrendScanOutput {
  return {
    rssContext: {
      trendingKeywords: [{ word: "startup", count: 1 }],
      relatedArticles: [{
        title: "Startup trend",
        link: "https://example.com/startup",
        url: "https://example.com/startup",
        published: new Date().toISOString(),
        summary: "Startup trend article",
        source: "Example",
        keywords: ["startup"],
      }],
    },
    focusKeywords: ["startup"],
    generatedAt: new Date().toISOString(),
    sourceSummary: { rssItemCount: 2, usedLLMFallback: false },
    summaryPolicy: {
      minItems: 3,
      maxItems: 5,
      minTotalChars: 240,
      maxTotalChars: 1200,
      maxItemChars: 260,
      minJapaneseChars: 120,
      minJapaneseToLatinRatio: 0.35,
    },
  };
}

function cachedIdeaBatch(batchTime: string, id: string): {
  batchTime: string;
  data: IdeaGenerationOutput;
} {
  const generatedAt = new Date(batchTime).toISOString();
  const data = ideaOutput(batchTime);
  return {
    batchTime,
    data: {
      ...data,
      generatedAt,
      candidates: data.candidates.map((candidate) => ({
        ...candidate,
        id,
        title: id,
        generatedAt,
        batchTime,
      })),
    },
  };
}

describe("background cache refresh", () => {
  afterEach(() => {
    restoreEnv();
    vi.useRealTimers();
    vi.doUnmock("ai-engine");
    vi.resetModules();
  });

  it("warms the empty idea cache before the initial trend refresh", async () => {
    const events: string[] = [];
    const trendGate = deferred();
    const ideaGate = deferred();

    vi.doMock("ai-engine", async (importOriginal) => {
      const actual = await importOriginal<typeof import("ai-engine")>();
      return {
        ...actual,
        LLMClient: class {},
        EntrepreneurAgent: class {
          async scanTrends(): Promise<TrendScanOutput> {
            events.push("trend-start");
            await trendGate.promise;
            events.push("trend-finish");
            return trendOutput();
          }

          async generateIdeas(
            _onProgress?: (text: string) => void,
            _focusKeywords?: string[],
            _count?: number,
            batchTime?: string,
          ): Promise<IdeaGenerationOutput> {
            events.push("ideas-start");
            await ideaGate.promise;
            events.push("ideas-finish");
            return ideaOutput(batchTime);
          }
        },
      };
    });

    vi.resetModules();
    process.env.IDEA_CACHE_DISABLED = "1";
    process.env.IDEA_WARMUP_ON_START = "false";
    process.env.ZAI_API_KEY = "test-key";
    delete process.env.IDEA_CACHE_FILE;

    const cache = await import("../src/services/idea-cache");
    const refresh = cache.refreshCachesInBackground("startup", false);
    await Promise.resolve();
    await Promise.resolve();

    expect(events).toEqual(["ideas-start"]);

    ideaGate.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(events).toEqual(["ideas-start", "ideas-finish", "trend-start"]);

    trendGate.resolve();
    await refresh;

    expect(events).toEqual(["ideas-start", "ideas-finish", "trend-start", "trend-finish"]);
    expect(cache.getCachedIdeas()?.candidates.map((idea) => idea.id)).toEqual(["idea-background"]);
    expect(cache.getTrendHistory()).toHaveLength(1);
  });

  it("uses scheduled JST slots for startup warmup ideas", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-24T13:41:11+09:00"));

    vi.doMock("ai-engine", async (importOriginal) => {
      const actual = await importOriginal<typeof import("ai-engine")>();
      return {
        ...actual,
        LLMClient: class {},
        EntrepreneurAgent: class {
          async scanTrends(): Promise<TrendScanOutput> {
            return trendOutput();
          }

          async generateIdeas(
            _onProgress?: (text: string) => void,
            _focusKeywords?: string[],
            _count?: number,
            batchTime?: string,
          ): Promise<IdeaGenerationOutput> {
            return ideaOutput(batchTime);
          }
        },
      };
    });

    vi.resetModules();
    process.env.IDEA_CACHE_DISABLED = "1";
    process.env.IDEA_WARMUP_ON_START = "true";
    process.env.ZAI_API_KEY = "test-key";
    delete process.env.IDEA_CACHE_FILE;

    const cache = await import("../src/services/idea-cache");
    cache.startBackgroundCacheRefresh();
    await cache.waitForCacheActivity(1000);

    expect(cache.getCachedIdeas()?.batchTime).toBe("2026-05-24T00:00:00+09:00");
    expect(cache.getCachedIdeas()?.candidates[0].batchTime).toBe("2026-05-24T00:00:00+09:00");
    cache.flushPersistentCache();
  });

  it("generates the current daily idea batch on startup when the latest cached batch is from yesterday", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-18T10:00:00+09:00"));
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tech-idea-radar-startup-catchup-"));
    const cacheFile = path.join(tmpDir, "idea-cache.json");
    const currentTrend = trendOutput();
    const events: string[] = [];

    fs.writeFileSync(cacheFile, JSON.stringify({
      version: 3,
      updatedAt: new Date().toISOString(),
      batches: [
        cachedIdeaBatch("2026-05-17T00:00:00+09:00", "idea-yesterday"),
      ],
      trendHistory: [
        { scannedAt: new Date().toISOString(), data: currentTrend },
      ],
    }));

    vi.doMock("ai-engine", async (importOriginal) => {
      const actual = await importOriginal<typeof import("ai-engine")>();
      return {
        ...actual,
        LLMClient: class {},
        EntrepreneurAgent: class {
          async scanTrends(): Promise<TrendScanOutput> {
            events.push("trend");
            return trendOutput();
          }

          async generateIdeas(
            _onProgress?: (text: string) => void,
            _focusKeywords?: string[],
            _count?: number,
            batchTime?: string,
          ): Promise<IdeaGenerationOutput> {
            events.push("ideas");
            return ideaOutput(batchTime);
          }

          async generateIdeasFromTrendScan(
            _trendScan: TrendScanOutput,
            _onProgress?: (text: string) => void,
            _count?: number,
            batchTime?: string,
          ): Promise<IdeaGenerationOutput> {
            events.push("ideas");
            return ideaOutput(batchTime);
          }
        },
      };
    });

    vi.resetModules();
    delete process.env.IDEA_CACHE_DISABLED;
    process.env.IDEA_CACHE_FILE = cacheFile;
    process.env.IDEA_WARMUP_ON_START = "false";
    process.env.ZAI_API_KEY = "test-key";

    const cache = await import("../src/services/idea-cache");
    await cache.refreshCachesInBackground("startup", false);

    expect(events).toEqual(["ideas"]);
    expect(cache.getBatchInfos()[0].batchTime).toBe("2026-05-18T00:00:00+09:00");
    expect(cache.getCachedIdeas()?.candidates.map((idea) => idea.id)).toContain("idea-background");
  });
});
