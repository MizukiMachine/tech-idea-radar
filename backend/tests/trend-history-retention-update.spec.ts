import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { TrendScanOutput } from "ai-engine";

const originalCacheDisabled = process.env.IDEA_CACHE_DISABLED;
const originalCacheFile = process.env.IDEA_CACHE_FILE;
const originalZaiApiKey = process.env.ZAI_API_KEY;

const summaryPolicy = {
  minItems: 3,
  maxItems: 6,
  minTotalChars: 240,
  maxTotalChars: 1200,
  maxItemChars: 260,
  minJapaneseChars: 120,
  minJapaneseToLatinRatio: 0.35,
};

function restoreEnv() {
  if (originalCacheDisabled === undefined) delete process.env.IDEA_CACHE_DISABLED;
  else process.env.IDEA_CACHE_DISABLED = originalCacheDisabled;

  if (originalCacheFile === undefined) delete process.env.IDEA_CACHE_FILE;
  else process.env.IDEA_CACHE_FILE = originalCacheFile;

  if (originalZaiApiKey === undefined) delete process.env.ZAI_API_KEY;
  else process.env.ZAI_API_KEY = originalZaiApiKey;
}

function trendScan(generatedAt: string): TrendScanOutput {
  return {
    rssContext: {
      trendingKeywords: [{ word: "AI", count: 3 }],
      relatedArticles: [{
        title: "Agent tooling expands",
        link: "https://example.com/agent-tooling",
        url: "https://example.com/agent-tooling",
        published: generatedAt,
        publishedAt: generatedAt,
        summary: "Agent tools are moving into product workflows.",
        source: "Example",
        keywords: ["AI"],
      }],
    },
    focusKeywords: ["AI"],
    generatedAt,
    summaryPolicy,
    sourceSummary: {
      rssItemCount: 1,
      usedLLMFallback: false,
    },
  };
}

describe("trend history update retention", () => {
  afterEach(() => {
    restoreEnv();
    vi.useRealTimers();
    vi.doUnmock("ai-engine");
    vi.resetModules();
  });

  it("drops trend history entries older than 24 hours when a new scan is cached", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-17T04:00:00.000Z"));
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "builder-agent-chain-trend-update-"));
    const cacheFile = path.join(tmpDir, "idea-cache.json");
    const recentGeneratedAt = "2026-05-17T00:00:00.000Z";
    const boundaryGeneratedAt = "2026-05-16T04:00:00.000Z";
    const oldGeneratedAt = "2026-05-16T03:59:59.000Z";
    const newGeneratedAt = "2026-05-17T04:00:00.000Z";

    fs.writeFileSync(cacheFile, JSON.stringify({
      version: 3,
      updatedAt: recentGeneratedAt,
      batches: [],
      trendHistory: [
        { scannedAt: recentGeneratedAt, data: trendScan(recentGeneratedAt) },
        { scannedAt: boundaryGeneratedAt, data: trendScan(boundaryGeneratedAt) },
        { scannedAt: oldGeneratedAt, data: trendScan(oldGeneratedAt) },
      ],
    }));

    vi.doMock("ai-engine", async (importOriginal) => {
      const actual = await importOriginal<typeof import("ai-engine")>();
      return {
        ...actual,
        EntrepreneurAgent: class {
          async scanTrends(): Promise<TrendScanOutput> {
            return trendScan(newGeneratedAt);
          }
        },
      };
    });

    vi.resetModules();
    delete process.env.IDEA_CACHE_DISABLED;
    process.env.IDEA_CACHE_FILE = cacheFile;
    process.env.ZAI_API_KEY = "test-key";

    const cache = await import("../src/services/idea-cache");
    await cache.scanAndCacheTrends();

    expect(cache.getTrendHistory().map((entry) => entry.generatedAt)).toEqual([
      newGeneratedAt,
      recentGeneratedAt,
      boundaryGeneratedAt,
    ]);
  });
});
