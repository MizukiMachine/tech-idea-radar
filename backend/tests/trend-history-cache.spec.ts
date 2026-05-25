import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RSS_ARTICLE_SUMMARY_POLICY, type TrendScanOutput } from "ai-engine";

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
    summaryPolicy: RSS_ARTICLE_SUMMARY_POLICY,
    sourceSummary: {
      rssItemCount: 1,
      usedLLMFallback: false,
    },
  };
}

describe("trend history persistent cache", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-17T04:00:00.000Z"));
  });

  afterEach(() => {
    restoreEnv();
    vi.useRealTimers();
    vi.resetModules();
  });

  it("loads v3 trend history entries from persistent cache", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tech-idea-radar-trends-"));
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
    expect(cache.getCachedTrendByIndex(0)?.summaryPolicy).toEqual(RSS_ARTICLE_SUMMARY_POLICY);
    expect(cache.getCachedTrends()?.rssContext.relatedArticles[0]?.title).toBe("Agent tooling expands");
  });

  it("hydrates legacy trend history entries that are missing the summary policy", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tech-idea-radar-legacy-trends-"));
    const cacheFile = path.join(tmpDir, "idea-cache.json");
    const generatedAt = "2026-05-17T00:00:00.000Z";
    const legacyTrendScan = trendScan(generatedAt) as Record<string, unknown>;
    delete legacyTrendScan.summaryPolicy;

    fs.writeFileSync(cacheFile, JSON.stringify({
      version: 3,
      updatedAt: generatedAt,
      batches: [],
      trendHistory: [{
        scannedAt: generatedAt,
        data: legacyTrendScan,
      }],
    }));

    vi.resetModules();
    delete process.env.IDEA_CACHE_DISABLED;
    process.env.IDEA_CACHE_FILE = cacheFile;

    const cache = await import("../src/services/idea-cache");

    expect(cache.getCachedTrends()?.summaryPolicy).toEqual(RSS_ARTICLE_SUMMARY_POLICY);
    expect(cache.getCachedTrendByIndex(0)?.summaryPolicy).toEqual(RSS_ARTICLE_SUMMARY_POLICY);
  });

  it("strips deprecated featured trend data from persistent trend cache", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tech-idea-radar-deprecated-trends-"));
    const cacheFile = path.join(tmpDir, "idea-cache.json");
    const generatedAt = "2026-05-17T00:00:00.000Z";
    const legacyTrendScan = {
      ...trendScan(generatedAt),
      featuredTrend: {
        title: "Deprecated featured trend",
        reason: "No longer used by the UI",
      },
    };

    fs.writeFileSync(cacheFile, JSON.stringify({
      version: 3,
      updatedAt: generatedAt,
      batches: [],
      trendHistory: [{
        scannedAt: generatedAt,
        data: legacyTrendScan,
      }],
    }));

    vi.resetModules();
    delete process.env.IDEA_CACHE_DISABLED;
    process.env.IDEA_CACHE_FILE = cacheFile;

    const cache = await import("../src/services/idea-cache");

    expect(cache.getCachedTrends()).not.toHaveProperty("featuredTrend");
    expect(cache.getCachedTrendByIndex(0)).not.toHaveProperty("featuredTrend");
  });

  it("does not age out trend history entries when loading persistent cache for read", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tech-idea-radar-old-trends-"));
    const cacheFile = path.join(tmpDir, "idea-cache.json");
    const recentGeneratedAt = "2026-05-17T04:00:00.000Z";
    const boundaryGeneratedAt = "2026-05-16T04:00:00.000Z";
    const oldGeneratedAt = "2026-05-16T03:59:59.000Z";

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

    vi.resetModules();
    delete process.env.IDEA_CACHE_DISABLED;
    process.env.IDEA_CACHE_FILE = cacheFile;

    const cache = await import("../src/services/idea-cache");

    expect(cache.getRuntimeMeta().env.trendHistoryWindowHours).toBe(365 * 24);
    expect(cache.getTrendHistory().map((entry) => entry.generatedAt)).toEqual([
      recentGeneratedAt,
      boundaryGeneratedAt,
      oldGeneratedAt,
    ]);
  });
});
