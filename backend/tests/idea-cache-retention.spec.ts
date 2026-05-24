import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { IdeaGenerationOutput } from "ai-engine";

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
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "builder-agent-chain-ideas-"));
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

    expect(cache.getRuntimeMeta().env.ideaRetentionWindowHours).toBe(24);
    expect(cache.getRuntimeMeta().env.maxBatches).toBe(7);
    expect(cache.getBatchInfos()).toHaveLength(7);
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
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "builder-agent-chain-ideas-normalize-"));
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

  it("keeps the previous scheduled batch slot when generation crosses a boundary", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "builder-agent-chain-ideas-cross-boundary-"));
    const cacheFile = path.join(tmpDir, "idea-cache.json");
    const generatedAt = "2026-05-24T11:35:00.000Z";
    const batch = ideaBatch("2026-05-24T16:00:00+09:00", "idea-cross-boundary");
    batch.data.generatedAt = generatedAt;
    batch.data.candidates[0].generatedAt = generatedAt;

    writeCache(cacheFile, [batch]);

    vi.resetModules();
    delete process.env.IDEA_CACHE_DISABLED;
    process.env.IDEA_CACHE_FILE = cacheFile;

    const cache = await import("../src/services/idea-cache");
    const ideas = cache.getCachedIdeas();

    expect(cache.getBatchInfos()[0].batchTime).toBe("2026-05-24T16:00:00+09:00");
    expect(ideas?.batchTime).toBe("2026-05-24T16:00:00+09:00");
    expect(ideas?.candidates[0].batchTime).toBe("2026-05-24T16:00:00+09:00");
  });

  it("drops batches older than 24 hours when a new idea batch is cached", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-18T04:00:00+09:00"));
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "builder-agent-chain-ideas-update-"));
    const cacheFile = path.join(tmpDir, "idea-cache.json");

    writeCache(cacheFile, [
      ideaBatch("2026-05-18T00:00:00+09:00", "idea-4h"),
      ideaBatch("2026-05-17T20:00:00+09:00", "idea-8h"),
      ideaBatch("2026-05-17T16:00:00+09:00", "idea-12h"),
      ideaBatch("2026-05-17T12:00:00+09:00", "idea-16h"),
      ideaBatch("2026-05-17T08:00:00+09:00", "idea-20h"),
      ideaBatch("2026-05-17T04:00:00+09:00", "idea-24h"),
      ideaBatch("2026-05-17T00:00:00+09:00", "idea-28h"),
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
      "idea-4h",
      "idea-8h",
      "idea-12h",
      "idea-16h",
      "idea-20h",
      "idea-24h",
    ]);
    expect(cache.getCachedIdeas()?.candidates.map((idea) => idea.id)).not.toContain("idea-28h");
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

    expect(cache.getBatchInfos()[0].batchTime).toBe("2026-05-24T16:00:00+09:00");
    expect(cache.getCachedIdeas()?.candidates[0].batchTime).toBe("2026-05-24T16:00:00+09:00");
  });

  it("does not age out loaded ideas on read without a cache update", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-18T04:00:00+09:00"));
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "builder-agent-chain-ideas-stable-"));
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
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "builder-agent-chain-ideas-short-"));
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
