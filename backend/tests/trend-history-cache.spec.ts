import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { TrendScanOutput } from "ai-engine";

const originalCacheDisabled = process.env.IDEA_CACHE_DISABLED;
const originalCacheFile = process.env.IDEA_CACHE_FILE;

function restoreEnv() {
  if (originalCacheDisabled === undefined) delete process.env.IDEA_CACHE_DISABLED;
  else process.env.IDEA_CACHE_DISABLED = originalCacheDisabled;

  if (originalCacheFile === undefined) delete process.env.IDEA_CACHE_FILE;
  else process.env.IDEA_CACHE_FILE = originalCacheFile;
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
    sourceSummary: {
      rssItemCount: 1,
      usedLLMFallback: false,
    },
  };
}

describe("trend history persistent cache", () => {
  afterEach(() => {
    restoreEnv();
    vi.resetModules();
  });

  it("loads v3 trend history entries from persistent cache", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "builder-agent-chain-trends-"));
    const cacheFile = path.join(tmpDir, "idea-cache.json");
    const generatedAt = "2026-05-17T00:00:00.000Z";

    fs.writeFileSync(cacheFile, JSON.stringify({
      version: 3,
      updatedAt: generatedAt,
      batches: [],
      trendHistory: [{
        scannedAt: generatedAt,
        data: trendScan(generatedAt),
      }],
    }));

    vi.resetModules();
    delete process.env.IDEA_CACHE_DISABLED;
    process.env.IDEA_CACHE_FILE = cacheFile;

    const cache = await import("../src/services/idea-cache");

    expect(cache.getTrendHistory()).toEqual([{
      scannedAt: generatedAt,
      generatedAt,
      articleCount: 1,
      keywordCount: 1,
    }]);
    expect(cache.getCachedTrendByIndex(0)?.generatedAt).toBe(generatedAt);
    expect(cache.getCachedTrends()?.rssContext.relatedArticles[0]?.title).toBe("Agent tooling expands");
  });
});
