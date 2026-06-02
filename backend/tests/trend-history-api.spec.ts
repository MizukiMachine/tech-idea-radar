import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { IdeaGenerationOutput, TrendScanOutput } from "ai-engine";

const originalCacheDisabled = process.env.IDEA_CACHE_DISABLED;
const originalCacheFile = process.env.IDEA_CACHE_FILE;
const originalZaiApiKey = process.env.ZAI_API_KEY;
const originalPublicReadonlyMode = process.env.PUBLIC_READONLY_MODE;
const originalAdminApiToken = process.env.ADMIN_API_TOKEN;

function restoreEnv() {
  if (originalCacheDisabled === undefined) delete process.env.IDEA_CACHE_DISABLED;
  else process.env.IDEA_CACHE_DISABLED = originalCacheDisabled;

  if (originalCacheFile === undefined) delete process.env.IDEA_CACHE_FILE;
  else process.env.IDEA_CACHE_FILE = originalCacheFile;

  if (originalZaiApiKey === undefined) delete process.env.ZAI_API_KEY;
  else process.env.ZAI_API_KEY = originalZaiApiKey;

  if (originalPublicReadonlyMode === undefined) delete process.env.PUBLIC_READONLY_MODE;
  else process.env.PUBLIC_READONLY_MODE = originalPublicReadonlyMode;

  if (originalAdminApiToken === undefined) delete process.env.ADMIN_API_TOKEN;
  else process.env.ADMIN_API_TOKEN = originalAdminApiToken;
}

function ideaOutput(batchTime?: string): IdeaGenerationOutput {
  const generatedAt = new Date().toISOString();
  return {
    generatedAt,
    batchTime,
    sourceSummary: { rssItemCount: 2, usedLLMFallback: false },
    candidates: [{
      id: `idea-${batchTime ?? generatedAt}`,
      title: "Batch idea",
      tagline: "Generated from the current trend slot",
      description: "A deterministic idea for API trend history tests.",
      tags: ["trend"],
      productType: "SaaS",
      targetUsers: "Builders",
      coreProblem: "Trend history must grow with idea batches",
      differentiation: "Uses the trend scan from the same scheduled slot",
      sources: { rssKeywords: ["trend"], evidenceUrls: [] },
      generatedAt,
      batchTime,
    }],
  };
}

function trendOutput(batchTime?: string): TrendScanOutput {
  const generatedAt = new Date().toISOString();
  const keyword = batchTime ?? generatedAt;
  return {
    rssContext: {
      trendingKeywords: [{ word: keyword, count: 1 }],
      relatedArticles: [{
        title: `Trend article ${keyword}`,
        link: `https://example.com/trends/${encodeURIComponent(keyword)}`,
        url: `https://example.com/trends/${encodeURIComponent(keyword)}`,
        published: generatedAt,
        publishedAt: generatedAt,
        summary: "Trend history API test article",
        source: "Example",
        keywords: [keyword],
      }],
    },
    focusKeywords: [keyword],
    generatedAt,
    summaryPolicy: {
      minItems: 3,
      maxItems: 5,
      minTotalChars: 240,
      maxTotalChars: 1200,
      maxItemChars: 260,
      minJapaneseChars: 120,
      minJapaneseToLatinRatio: 0.35,
    },
    sourceSummary: { rssItemCount: 2, usedLLMFallback: false },
  };
}

describe("trend history API", () => {
  afterEach(() => {
    restoreEnv();
    vi.useRealTimers();
    vi.doUnmock("ai-engine");
    vi.resetModules();
  });

  it("retains a new trend snapshot when idea refresh crosses a scheduled JST batch slot", async () => {
    const calls: string[] = [];

    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-18T00:30:00+09:00"));
    vi.doMock("ai-engine", async (importOriginal) => {
      const actual = await importOriginal<typeof import("ai-engine")>();
      return {
        ...actual,
        LLMClient: class {},
        EntrepreneurAgent: class {
          async generateIdeasFromTrendScan(): Promise<IdeaGenerationOutput> {
            calls.push("cached");
            return ideaOutput();
          }

          async generateIdeasWithTrendScan(
            _onProgress?: (text: string) => void,
            _focusKeywords?: string[],
            _count?: number,
            batchTime?: string,
          ): Promise<{ ideas: IdeaGenerationOutput; trendScan: TrendScanOutput }> {
            calls.push(`fresh:${batchTime ?? "none"}`);
            return {
              ideas: ideaOutput(batchTime),
              trendScan: trendOutput(batchTime),
            };
          }
        },
      };
    });

    vi.resetModules();
    process.env.IDEA_CACHE_DISABLED = "1";
    delete process.env.IDEA_CACHE_FILE;
    delete process.env.PUBLIC_READONLY_MODE;
    delete process.env.ADMIN_API_TOKEN;
    process.env.ZAI_API_KEY = "test-key";

    const { default: app } = await import("../src/app");

    const firstRefresh = await request(app).post("/api/ai/ideas/refresh").send({});
    expect(firstRefresh.status).toBe(200);
    expect(firstRefresh.text).toContain("event: generation_complete");

    vi.setSystemTime(new Date("2026-05-18T12:30:00+09:00"));
    const secondRefresh = await request(app).post("/api/ai/ideas/refresh").send({});
    expect(secondRefresh.status).toBe(200);
    expect(secondRefresh.text).toContain("event: generation_complete");

    const history = await request(app).get("/api/ai/trends/history");
    expect(history.status).toBe(200);
    expect(history.body.history).toHaveLength(2);
    expect(history.body.history.map((entry: { generatedAt: string }) => entry.generatedAt)).toEqual([
      "2026-05-18T03:30:00.000Z",
      "2026-05-17T15:30:00.000Z",
    ]);

    const latestSnapshot = await request(app).get("/api/ai/trends/history/0");
    expect(latestSnapshot.status).toBe(200);
    expect(latestSnapshot.body.batchTime).toBe("2026-05-18T12:00:00+09:00");

    const previousSnapshot = await request(app).get("/api/ai/trends/history/1");
    expect(previousSnapshot.status).toBe(200);
    expect(previousSnapshot.body.batchTime).toBe("2026-05-18T00:00:00+09:00");
    expect(calls).toEqual([
      "fresh:2026-05-18T00:00:00+09:00",
      "fresh:2026-05-18T12:00:00+09:00",
    ]);
  });
});
