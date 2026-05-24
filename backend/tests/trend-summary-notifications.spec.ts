import { afterEach, describe, expect, it, vi } from "vitest";
import type { TrendScanOutput } from "ai-engine";

const originalCacheDisabled = process.env.IDEA_CACHE_DISABLED;
const originalCacheFile = process.env.IDEA_CACHE_FILE;
const originalWarmupOnStart = process.env.IDEA_WARMUP_ON_START;
const originalZaiApiKey = process.env.ZAI_API_KEY;

function restoreEnv() {
  if (originalCacheDisabled === undefined) delete process.env.IDEA_CACHE_DISABLED;
  else process.env.IDEA_CACHE_DISABLED = originalCacheDisabled;

  if (originalCacheFile === undefined) delete process.env.IDEA_CACHE_FILE;
  else process.env.IDEA_CACHE_FILE = originalCacheFile;

  if (originalWarmupOnStart === undefined) delete process.env.IDEA_WARMUP_ON_START;
  else process.env.IDEA_WARMUP_ON_START = originalWarmupOnStart;

  if (originalZaiApiKey === undefined) delete process.env.ZAI_API_KEY;
  else process.env.ZAI_API_KEY = originalZaiApiKey;
}

function configureTestEnv() {
  process.env.IDEA_CACHE_DISABLED = "1";
  process.env.IDEA_WARMUP_ON_START = "false";
  process.env.ZAI_API_KEY = "test-key";
  delete process.env.IDEA_CACHE_FILE;
}

function article(index: number) {
  return {
    title: `Trend article ${index}`,
    link: `https://example.com/trend-${index}`,
    url: `https://example.com/trend-${index}`,
    published: "2026-05-17T00:00:00.000Z",
    summary: "Trend summary",
    source: "Example",
    keywords: ["AI"],
  };
}

function summaryError(index: number) {
  return {
    index,
    title: `Trend article ${index}`,
    source: "Example",
    message: "summaryJa did not satisfy the Japanese summary policy",
    url: `https://example.com/trend-${index}`,
  };
}

function trendScan(overrides: Partial<TrendScanOutput["rssContext"]>): TrendScanOutput {
  return {
    rssContext: {
      trendingKeywords: [{ word: "AI", count: 8 }],
      relatedArticles: Array.from({ length: 8 }, (_, index) => article(index)),
      ...overrides,
    },
    focusKeywords: ["AI"],
    generatedAt: "2026-05-17T00:00:00.000Z",
    summaryPolicy: {
      minItems: 3,
      maxItems: 5,
      minTotalChars: 120,
      maxTotalChars: 1200,
      maxItemChars: 260,
      minJapaneseChars: 80,
      minJapaneseToLatinRatio: 0.35,
    },
    sourceSummary: { rssItemCount: 16, usedLLMFallback: false },
  };
}

async function importCacheWithTrend(result: TrendScanOutput, notifyMock: ReturnType<typeof vi.fn>) {
  vi.doMock("ai-engine", async (importOriginal) => {
    const actual = await importOriginal<typeof import("ai-engine")>();
    return {
      ...actual,
      LLMClient: class {},
      EntrepreneurAgent: class {
        async scanTrends(): Promise<TrendScanOutput> {
          return result;
        }
      },
    };
  });
  vi.doMock("../src/services/admin-notifier", () => ({
    notifyAdminOfRssFailure: notifyMock,
  }));

  vi.resetModules();
  configureTestEnv();
  return import("../src/services/idea-cache");
}

describe("trend summary notifications", () => {
  afterEach(() => {
    restoreEnv();
    vi.doUnmock("ai-engine");
    vi.doUnmock("../src/services/admin-notifier");
    vi.resetModules();
  });

  it("does not notify when failed summaries were replaced and the display is full", async () => {
    const notifyMock = vi.fn();
    const cache = await importCacheWithTrend(
      trendScan({ replacedSummaryErrors: [summaryError(8)] }),
      notifyMock,
    );

    await cache.scanAndCacheTrends();

    expect(notifyMock).not.toHaveBeenCalled();
  });

  it("notifies when summary failures reduce the display article count", async () => {
    const notifyMock = vi.fn();
    const cache = await importCacheWithTrend(
      trendScan({
        relatedArticles: Array.from({ length: 7 }, (_, index) => article(index)),
        summaryErrors: [summaryError(7)],
      }),
      notifyMock,
    );

    await cache.scanAndCacheTrends();

    expect(notifyMock).toHaveBeenCalledOnce();
    expect(notifyMock.mock.calls[0]?.[0]).toMatchObject({
      operation: "trend_summary",
      details: {
        summaryFailureCount: 1,
        summaryErrors: [summaryError(7)],
      },
    });
  });
});
