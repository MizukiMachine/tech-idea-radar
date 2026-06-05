import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { IdeaGenerationOutput, TrendScanOutput } from "ai-engine";

const originalCacheDisabled = process.env.IDEA_CACHE_DISABLED;
const originalCacheFile = process.env.IDEA_CACHE_FILE;
const originalZaiApiKey = process.env.ZAI_API_KEY;
const originalIdeaGenerationBatchSize = process.env.IDEA_GENERATION_BATCH_SIZE;

function restoreEnv() {
  if (originalCacheDisabled === undefined) delete process.env.IDEA_CACHE_DISABLED;
  else process.env.IDEA_CACHE_DISABLED = originalCacheDisabled;

  if (originalCacheFile === undefined) delete process.env.IDEA_CACHE_FILE;
  else process.env.IDEA_CACHE_FILE = originalCacheFile;

  if (originalZaiApiKey === undefined) delete process.env.ZAI_API_KEY;
  else process.env.ZAI_API_KEY = originalZaiApiKey;

  if (originalIdeaGenerationBatchSize === undefined) delete process.env.IDEA_GENERATION_BATCH_SIZE;
  else process.env.IDEA_GENERATION_BATCH_SIZE = originalIdeaGenerationBatchSize;
}

function ideaBatch(batchTime: string, id: string): {
  batchTime: string;
  data: IdeaGenerationOutput;
} {
  const generatedAt = new Date(batchTime).toISOString();
  return {
    batchTime,
    data: {
      generatedAt,
      batchTime,
      sourceSummary: { rssItemCount: 1, usedLLMFallback: false },
      candidates: [{
        id,
        title: id,
        tagline: "Retention test",
        description: "Retention test idea",
        tags: ["retention"],
        productType: "SaaS",
        targetUsers: "Builders",
        coreProblem: "Old ideas should rotate out",
        differentiation: "Uses batch retention",
        sources: { rssKeywords: ["retention"], evidenceUrls: [] },
        generatedAt,
        batchTime,
      }],
    },
  };
}

function generatedIdeaOutput(id: string, batchTime?: string): IdeaGenerationOutput {
  const generatedAt = new Date().toISOString();
  return {
    generatedAt,
    batchTime,
    sourceSummary: { rssItemCount: 2, usedLLMFallback: false },
    candidates: [{
      id,
      title: id,
      tagline: "Generated idea",
      description: "Generated from a cached trend scan.",
      tags: ["trend"],
      productType: "SaaS",
      targetUsers: "Builders",
      coreProblem: "Trend scans should be retained",
      differentiation: "Stores the trend snapshot used for generation",
      sources: { rssKeywords: ["trend"], evidenceUrls: [] },
      generatedAt,
      batchTime,
    }],
  };
}

const summaryPolicy = {
  minItems: 3,
  maxItems: 5,
  minTotalChars: 240,
  maxTotalChars: 1200,
  maxItemChars: 260,
  minJapaneseChars: 120,
  minJapaneseToLatinRatio: 0.35,
};

function trendScan(generatedAt: string, keyword = "trend"): TrendScanOutput {
  return {
    rssContext: {
      trendingKeywords: [{ word: keyword, count: 1 }],
      relatedArticles: [{
        title: `${keyword} article`,
        link: `https://example.com/${keyword}`,
        url: `https://example.com/${keyword}`,
        published: generatedAt,
        publishedAt: generatedAt,
        summary: `${keyword} summary`,
        source: "Example",
        keywords: [keyword],
      }],
    },
    focusKeywords: [keyword],
    generatedAt,
    summaryPolicy,
    sourceSummary: { rssItemCount: 2, usedLLMFallback: false },
  };
}

function writeCache(cacheFile: string, batches: ReturnType<typeof ideaBatch>[]) {
  fs.writeFileSync(cacheFile, JSON.stringify({
    version: 3,
    updatedAt: new Date().toISOString(),
    batches,
    trendHistory: [],
  }));
}

describe("idea cache retention", () => {
  afterEach(() => {
    restoreEnv();
    vi.useRealTimers();
    vi.doUnmock("ai-engine");
    vi.resetModules();
  });

  it("does not age out batches when loading cached ideas for read", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-18T04:00:00+09:00"));
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tech-idea-radar-ideas-"));
    const cacheFile = path.join(tmpDir, "idea-cache.json");

    writeCache(cacheFile, [
      ideaBatch("2026-05-18T04:00:00+09:00", "idea-now"),
      ideaBatch("2026-05-18T00:00:00+09:00", "idea-4h"),
      ideaBatch("2026-05-17T20:00:00+09:00", "idea-8h"),
      ideaBatch("2026-05-17T16:00:00+09:00", "idea-12h"),
      ideaBatch("2026-05-17T12:00:00+09:00", "idea-16h"),
      ideaBatch("2026-05-17T08:00:00+09:00", "idea-20h"),
      ideaBatch("2026-05-17T00:00:00+09:00", "idea-28h"),
    ]);

    vi.resetModules();
    delete process.env.IDEA_CACHE_DISABLED;
    process.env.IDEA_CACHE_FILE = cacheFile;

    const cache = await import("../src/services/idea-cache");
    const ideas = cache.getCachedIdeas();

    expect(cache.getRuntimeMeta().env.ideaRetentionWindowHours).toBe(365 * 24);
    expect(cache.getRuntimeMeta().env.maxBatches).toBe(732);
    expect(cache.getBatchInfos()).toHaveLength(3);
    expect(ideas?.candidates.map((idea) => idea.id)).toEqual([
      "idea-now",
      "idea-4h",
      "idea-8h",
      "idea-12h",
      "idea-16h",
      "idea-20h",
      "idea-28h",
    ]);
  });

  it("normalizes cached idea batch times to scheduled JST slots on read", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tech-idea-radar-ideas-normalize-"));
    const cacheFile = path.join(tmpDir, "idea-cache.json");
    const generatedAt = "2026-05-24T04:41:11.695Z";
    const batch = ideaBatch("2026-05-24T13:00:00+09:00", "idea-startup");
    batch.data.generatedAt = generatedAt;
    batch.data.batchTime = "2026-05-24T13:00:00+09:00";
    batch.data.candidates[0].generatedAt = generatedAt;
    batch.data.candidates[0].batchTime = "2026-05-24T04:00:00+09:00";

    writeCache(cacheFile, [batch]);

    vi.resetModules();
    delete process.env.IDEA_CACHE_DISABLED;
    process.env.IDEA_CACHE_FILE = cacheFile;

    const cache = await import("../src/services/idea-cache");
    const ideas = cache.getCachedIdeas();

    expect(cache.getBatchInfos()[0].batchTime).toBe("2026-05-24T12:00:00+09:00");
    expect(ideas?.batchTime).toBe("2026-05-24T12:00:00+09:00");
    expect(ideas?.candidates[0].batchTime).toBe("2026-05-24T12:00:00+09:00");
  });

  it("stores the trend scan used by fresh idea generation", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-18T00:30:00+09:00"));
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tech-idea-radar-idea-trend-"));
    const cacheFile = path.join(tmpDir, "idea-cache.json");
    writeCache(cacheFile, []);
    const trendGeneratedAt = "2026-05-17T15:30:00.000Z";

    vi.doMock("ai-engine", async (importOriginal) => {
      const actual = await importOriginal<typeof import("ai-engine")>();
      return {
        ...actual,
        EntrepreneurAgent: class {
          async generateIdeasWithTrendScan(
            _onProgress?: (text: string) => void,
            _focusKeywords?: string[],
            _count?: number,
            batchTime?: string,
          ): Promise<{ ideas: IdeaGenerationOutput; trendScan: TrendScanOutput }> {
            return {
              ideas: generatedIdeaOutput("idea-from-fresh-trend", batchTime),
              trendScan: trendScan(trendGeneratedAt),
            };
          }
        },
      };
    });

    vi.resetModules();
    delete process.env.IDEA_CACHE_DISABLED;
    process.env.IDEA_CACHE_FILE = cacheFile;
    process.env.ZAI_API_KEY = "test-key";

    const cache = await import("../src/services/idea-cache");
    await cache.generateAndCacheIdeas();

    expect(cache.getTrendHistory()).toEqual([{
      scannedAt: "2026-05-17T15:30:00.000Z",
      generatedAt: trendGeneratedAt,
      articleCount: 1,
      keywordCount: 1,
    }]);
    expect(cache.getCachedTrendByIndex(0)?.batchTime).toBe("2026-05-18T00:00:00+09:00");

    const persisted = JSON.parse(fs.readFileSync(cacheFile, "utf8")) as { trendHistory?: unknown[] };
    expect(persisted.trendHistory).toHaveLength(1);
  });

  it("generates a fresh trend scan instead of reusing stale trend history", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-18T00:30:00+09:00"));
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tech-idea-radar-stale-trend-"));
    const cacheFile = path.join(tmpDir, "idea-cache.json");
    const oldGeneratedAt = "2026-05-16T15:29:59.000Z";
    const newGeneratedAt = "2026-05-17T15:30:00.000Z";
    const calls: string[] = [];

    fs.writeFileSync(cacheFile, JSON.stringify({
      version: 3,
      updatedAt: oldGeneratedAt,
      batches: [],
      trendHistory: [
        { scannedAt: oldGeneratedAt, data: trendScan(oldGeneratedAt, "old") },
      ],
    }));

    vi.doMock("ai-engine", async (importOriginal) => {
      const actual = await importOriginal<typeof import("ai-engine")>();
      return {
        ...actual,
        EntrepreneurAgent: class {
          async generateIdeasFromTrendScan(): Promise<IdeaGenerationOutput> {
            calls.push("cached");
            return generatedIdeaOutput("idea-from-stale-trend");
          }

          async generateIdeasWithTrendScan(
            _onProgress?: (text: string) => void,
            _focusKeywords?: string[],
            _count?: number,
            batchTime?: string,
          ): Promise<{ ideas: IdeaGenerationOutput; trendScan: TrendScanOutput }> {
            calls.push("fresh");
            return {
              ideas: generatedIdeaOutput("idea-from-fresh-trend", batchTime),
              trendScan: trendScan(newGeneratedAt, "fresh"),
            };
          }
        },
      };
    });

    vi.resetModules();
    delete process.env.IDEA_CACHE_DISABLED;
    process.env.IDEA_CACHE_FILE = cacheFile;
    process.env.ZAI_API_KEY = "test-key";

    const cache = await import("../src/services/idea-cache");
    await cache.generateAndCacheIdeas();

    expect(calls).toEqual(["fresh"]);
    expect(cache.getTrendHistory().map((entry) => entry.generatedAt)).toEqual([
      newGeneratedAt,
      oldGeneratedAt,
    ]);
  });

  it("generates a fresh trend scan for a new scheduled idea batch even when the previous trend is under the TTL", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-18T12:30:00+09:00"));
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tech-idea-radar-current-trend-slot-"));
    const cacheFile = path.join(tmpDir, "idea-cache.json");
    const previousGeneratedAt = "2026-05-17T15:30:00.000Z";
    const newGeneratedAt = "2026-05-18T03:30:00.000Z";
    const calls: string[] = [];

    fs.writeFileSync(cacheFile, JSON.stringify({
      version: 3,
      updatedAt: previousGeneratedAt,
      batches: [],
      trendHistory: [
        { scannedAt: previousGeneratedAt, data: trendScan(previousGeneratedAt, "previous-slot") },
      ],
    }));

    vi.doMock("ai-engine", async (importOriginal) => {
      const actual = await importOriginal<typeof import("ai-engine")>();
      return {
        ...actual,
        EntrepreneurAgent: class {
          async generateIdeasFromTrendScan(): Promise<IdeaGenerationOutput> {
            calls.push("cached");
            return generatedIdeaOutput("idea-from-previous-slot-trend");
          }

          async generateIdeasWithTrendScan(
            _onProgress?: (text: string) => void,
            _focusKeywords?: string[],
            _count?: number,
            batchTime?: string,
          ): Promise<{ ideas: IdeaGenerationOutput; trendScan: TrendScanOutput }> {
            calls.push("fresh");
            return {
              ideas: generatedIdeaOutput("idea-from-current-slot-trend", batchTime),
              trendScan: trendScan(newGeneratedAt, "current-slot"),
            };
          }
        },
      };
    });

    vi.resetModules();
    delete process.env.IDEA_CACHE_DISABLED;
    process.env.IDEA_CACHE_FILE = cacheFile;
    process.env.ZAI_API_KEY = "test-key";

    const cache = await import("../src/services/idea-cache");
    await cache.generateAndCacheIdeas();

    expect(calls).toEqual(["fresh"]);
    expect(cache.getTrendHistory().map((entry) => entry.generatedAt)).toEqual([
      newGeneratedAt,
      previousGeneratedAt,
    ]);
    expect(cache.getCachedTrendByIndex(0)?.batchTime).toBe("2026-05-18T12:00:00+09:00");
  });

  it("keeps the previous scheduled batch slot when generation crosses a boundary", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tech-idea-radar-ideas-cross-boundary-"));
    const cacheFile = path.join(tmpDir, "idea-cache.json");
    // JST 12:05 → current slot is 12:00; the batch tagged with the previous
    // 00:00 slot (one 12h slot behind) must be kept.
    const generatedAt = "2026-05-24T03:05:00.000Z";
    const batch = ideaBatch("2026-05-24T00:00:00+09:00", "idea-cross-boundary");
    batch.data.generatedAt = generatedAt;
    batch.data.candidates[0].generatedAt = generatedAt;

    writeCache(cacheFile, [batch]);

    vi.resetModules();
    delete process.env.IDEA_CACHE_DISABLED;
    process.env.IDEA_CACHE_FILE = cacheFile;

    const cache = await import("../src/services/idea-cache");
    const ideas = cache.getCachedIdeas();

    expect(cache.getBatchInfos()[0].batchTime).toBe("2026-05-24T00:00:00+09:00");
    expect(ideas?.batchTime).toBe("2026-05-24T00:00:00+09:00");
    expect(ideas?.candidates[0].batchTime).toBe("2026-05-24T00:00:00+09:00");
  });

  it("drops batches older than 365 days when a new idea batch is cached", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-18T00:00:00+09:00"));
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tech-idea-radar-ideas-update-"));
    const cacheFile = path.join(tmpDir, "idea-cache.json");

    writeCache(cacheFile, [
      ideaBatch("2026-05-17T00:00:00+09:00", "idea-1d"),
      ideaBatch("2026-01-01T00:00:00+09:00", "idea-this-year"),
      ideaBatch("2025-05-18T00:00:00+09:00", "idea-365d"),
      ideaBatch("2025-05-17T23:59:59+09:00", "idea-too-old"),
    ]);

    vi.doMock("ai-engine", async (importOriginal) => {
      const actual = await importOriginal<typeof import("ai-engine")>();
      return {
        ...actual,
        EntrepreneurAgent: class {
          async generateIdeas(
            _onProgress?: (text: string) => void,
            _focusKeywords?: string[],
            _count?: number,
            batchTime?: string,
          ): Promise<IdeaGenerationOutput> {
            const generatedAt = new Date().toISOString();
            return {
              generatedAt,
              batchTime,
              sourceSummary: { rssItemCount: 1, usedLLMFallback: false },
              candidates: [{
                id: "idea-new",
                title: "idea-new",
                tagline: "New batch",
                description: "New idea batch",
                tags: ["retention"],
                productType: "SaaS",
                targetUsers: "Builders",
                coreProblem: "Old ideas should rotate out",
                differentiation: "Uses batch retention",
                sources: { rssKeywords: ["retention"], evidenceUrls: [] },
                generatedAt,
                batchTime,
              }],
            };
          }
        },
      };
    });

    vi.resetModules();
    delete process.env.IDEA_CACHE_DISABLED;
    process.env.IDEA_CACHE_FILE = cacheFile;
    process.env.ZAI_API_KEY = "test-key";

    const cache = await import("../src/services/idea-cache");
    await cache.generateAndCacheIdeas();

    expect(cache.getCachedIdeas()?.candidates.map((idea) => idea.id)).toEqual([
      "idea-new",
      "idea-1d",
      "idea-this-year",
      "idea-365d",
    ]);
    expect(cache.getCachedIdeas()?.candidates.map((idea) => idea.id)).not.toContain("idea-too-old");
  });

  it("uses the current scheduled JST slot when generating ideas", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-24T19:51:08+09:00"));

    vi.doMock("ai-engine", async (importOriginal) => {
      const actual = await importOriginal<typeof import("ai-engine")>();
      return {
        ...actual,
        EntrepreneurAgent: class {
          async generateIdeas(
            _onProgress?: (text: string) => void,
            _focusKeywords?: string[],
            _count?: number,
            batchTime?: string,
          ): Promise<IdeaGenerationOutput> {
            const generatedAt = new Date().toISOString();
            return {
              generatedAt,
              batchTime,
              sourceSummary: { rssItemCount: 1, usedLLMFallback: false },
              candidates: [{
                id: "idea-scheduled",
                title: "idea-scheduled",
                tagline: "Scheduled batch",
                description: "Uses the scheduled JST slot",
                tags: ["schedule"],
                productType: "SaaS",
                targetUsers: "Builders",
                coreProblem: "Wrong batch slots are confusing",
                differentiation: "Keeps generated labels on schedule",
                sources: { rssKeywords: ["schedule"], evidenceUrls: [] },
                generatedAt,
                batchTime,
              }],
            };
          }
        },
      };
    });

    vi.resetModules();
    process.env.IDEA_CACHE_DISABLED = "1";
    delete process.env.IDEA_CACHE_FILE;
    process.env.ZAI_API_KEY = "test-key";

    const cache = await import("../src/services/idea-cache");
    await cache.generateAndCacheIdeas();

    expect(cache.getBatchInfos()[0].batchTime).toBe("2026-05-24T12:00:00+09:00");
    expect(cache.getCachedIdeas()?.candidates[0].batchTime).toBe("2026-05-24T12:00:00+09:00");
  });

  it("replaces legacy same-day slots when generating the current daily batch", async () => {
    vi.useFakeTimers();
    // JST 06:00 → current slot is 00:00, the same slot as the legacy batches.
    vi.setSystemTime(new Date("2026-05-24T06:00:00+09:00"));
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tech-idea-radar-ideas-same-day-"));
    const cacheFile = path.join(tmpDir, "idea-cache.json");

    writeCache(cacheFile, [
      ideaBatch("2026-05-24T00:00:00+09:00", "idea-midnight"),
      ideaBatch("2026-05-24T04:00:00+09:00", "idea-legacy-4h"),
    ]);

    vi.doMock("ai-engine", async (importOriginal) => {
      const actual = await importOriginal<typeof import("ai-engine")>();
      return {
        ...actual,
        EntrepreneurAgent: class {
          async generateIdeas(
            _onProgress?: (text: string) => void,
            _focusKeywords?: string[],
            _count?: number,
            batchTime?: string,
          ): Promise<IdeaGenerationOutput> {
            const generatedAt = new Date().toISOString();
            return {
              generatedAt,
              batchTime,
              sourceSummary: { rssItemCount: 1, usedLLMFallback: false },
              candidates: [{
                id: "idea-new-day",
                title: "idea-new-day",
                tagline: "New daily batch",
                description: "Replaces same-day legacy slots",
                tags: ["schedule"],
                productType: "SaaS",
                targetUsers: "Builders",
                coreProblem: "Legacy same-day slots duplicate daily results",
                differentiation: "Keeps one active daily batch",
                sources: { rssKeywords: ["schedule"], evidenceUrls: [] },
                generatedAt,
                batchTime,
              }],
            };
          }
        },
      };
    });

    vi.resetModules();
    delete process.env.IDEA_CACHE_DISABLED;
    process.env.IDEA_CACHE_FILE = cacheFile;
    process.env.ZAI_API_KEY = "test-key";

    const cache = await import("../src/services/idea-cache");
    await cache.generateAndCacheIdeas();

    const ids = cache.getCachedIdeas()?.candidates.map((idea) => idea.id) ?? [];
    expect(ids).toEqual(["idea-new-day"]);
    expect(ids).not.toContain("idea-midnight");
    expect(ids).not.toContain("idea-legacy-4h");
  });

  it("does not age out loaded ideas on read without a cache update", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-18T04:00:00+09:00"));
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tech-idea-radar-ideas-stable-"));
    const cacheFile = path.join(tmpDir, "idea-cache.json");

    writeCache(cacheFile, [
      ideaBatch("2026-05-18T04:00:00+09:00", "idea-now"),
      ideaBatch("2026-05-17T04:00:00+09:00", "idea-24h"),
    ]);

    vi.resetModules();
    delete process.env.IDEA_CACHE_DISABLED;
    process.env.IDEA_CACHE_FILE = cacheFile;

    const cache = await import("../src/services/idea-cache");
    expect(cache.getCachedIdeas()?.candidates.map((idea) => idea.id)).toContain("idea-24h");

    vi.setSystemTime(new Date("2026-05-18T08:01:00+09:00"));

    expect(cache.getCachedIdeas()?.candidates.map((idea) => idea.id)).toContain("idea-24h");
  });

  it("records a warning when fewer ideas are cached than requested", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-18T04:00:00+09:00"));
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tech-idea-radar-ideas-short-"));
    const cacheFile = path.join(tmpDir, "idea-cache.json");

    vi.doMock("ai-engine", async (importOriginal) => {
      const actual = await importOriginal<typeof import("ai-engine")>();
      return {
        ...actual,
        EntrepreneurAgent: class {
          async generateIdeas(
            _onProgress?: (text: string) => void,
            _focusKeywords?: string[],
            _count?: number,
            batchTime?: string,
          ): Promise<IdeaGenerationOutput> {
            const generatedAt = new Date().toISOString();
            return {
              generatedAt,
              batchTime,
              sourceSummary: { rssItemCount: 1, usedLLMFallback: false },
              candidates: [{
                id: "idea-short",
                title: "idea-short",
                tagline: "Short batch",
                description: "Only one generated idea",
                tags: ["short"],
                productType: "SaaS",
                targetUsers: "Builders",
                coreProblem: "Partial generation should be visible",
                differentiation: "Adds a warning",
                sources: { rssKeywords: ["short"], evidenceUrls: [] },
                generatedAt,
                batchTime,
              }],
            };
          }
        },
      };
    });

    vi.resetModules();
    delete process.env.IDEA_CACHE_DISABLED;
    process.env.IDEA_CACHE_FILE = cacheFile;
    process.env.IDEA_GENERATION_BATCH_SIZE = "3";
    process.env.ZAI_API_KEY = "test-key";

    const cache = await import("../src/services/idea-cache");
    await cache.generateAndCacheIdeas();

    expect(cache.getCachedIdeas()?.sourceSummary.warnings?.[0]).toContain("1/3件");
  });
});
