import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import App from "../App";

const mockFetch = vi.fn();
const generatedAt = new Date().toISOString();
const idea = {
  id: "idea-1",
  title: "AI Ops Memo",
  tagline: "障害対応メモを自動整理",
  description: "SRE チーム向けに障害対応ログを分類します。",
  trendScore: 82,
  tags: ["AI", "SaaS"],
  productType: "B2B SaaS",
  targetUsers: "小規模な SRE チーム",
  coreProblem: "障害対応の知見が散らばる",
  revenuePotential: "high",
  estimatedMvpTime: "2週間",
  differentiation: "運用トレンドを根拠に提案する",
  sources: { rssKeywords: ["AI"], demandSignals: 1, evidenceUrls: [] },
  generatedAt,
};
const meta = {
  instanceId: "test-instance",
  pid: 123,
  startedAt: generatedAt,
  port: "3010",
  env: {
    hasZaiApiKey: true,
    hasXBearerToken: true,
    xDataSource: "rest",
    xIncludeUserFields: false,
    xCacheTtlHours: 6,
    xCacheFileEnabled: false,
    xSearchFixtureMode: "off",
    xSearchFixtureEnabled: false,
  },
  xUsage: null,
  cache: {
    status: "cached",
    expiresAt: generatedAt,
    generatedAt,
    candidateCount: 1,
    sourceSummary: { rssItemCount: 3, xSignalCount: 2, usedLLMFallback: false },
  },
  generationInProgress: false,
};
const trends = {
  status: "cached",
  rssContext: {
    trendingKeywords: [{ word: "AI", count: 4 }],
    relatedArticles: [{
      title: "AI agent tools are moving into product workflows",
      titleJa: "AIエージェントツールがプロダクト業務に広がる",
      link: "https://example.com/article",
      url: "https://example.com/article",
      published: generatedAt,
      publishedAt: generatedAt,
      summary: "Teams are adopting agent tools for product work.",
      summaryJa: "チームがプロダクト業務にAIエージェントツールを導入している動きを紹介しています。",
      source: "Example RSS",
      keywords: ["AI", "agent"],
    }],
  },
  xContext: {
    trendingTopics: [{
      topic: "AI workflow tools are trending among indie developers",
      tweetVolume: 42,
      url: "https://x.com/example/status/1",
      relatedHashtags: ["AI"],
    }],
    demandSignals: [{
      tweet: {
        id: "tweet-1",
        text: "AIツールの比較がめんどくさい。誰か作って",
        author: "Example",
        authorHandle: "example",
        likeCount: 10,
        retweetCount: 2,
        replyCount: 1,
        createdAt: generatedAt,
        url: "https://x.com/example/status/2",
      },
      needCategory: "wish",
      matchedKeywords: ["誰か作って"],
      relevanceScore: 80,
    }],
    competitorSentiments: [],
    fetchedAt: generatedAt,
  },
  focusKeywords: ["AI"],
  generatedAt,
  sourceSummary: { rssItemCount: 3, xSignalCount: 2, usedLLMFallback: false },
};

beforeEach(() => {
  mockFetch.mockReset();
  mockFetch.mockImplementation((input: RequestInfo | URL) => {
    const url = String(input);
    let body: unknown = {
      status: "cached",
      candidates: [idea],
      generatedAt,
      sourceSummary: { rssItemCount: 3, xSignalCount: 2, usedLLMFallback: false },
    };
    if (url.includes("/api/ai/trends")) body = trends;
    if (url.includes("/api/ai/ideas/meta")) body = meta;
    return Promise.resolve({
      ok: true,
      json: async () => body,
    });
  });
  vi.stubGlobal("fetch", mockFetch);
});

describe("App", () => {
  it("renders the idea workspace first", async () => {
    render(<App />);
    expect(screen.getByText("AI Build Radar")).toBeTruthy();
    await waitFor(() => expect(screen.getByText("フィルター")).toBeTruthy());
    expect(screen.getByText("得意技術")).toBeTruthy();
    expect(screen.getByPlaceholderText("キーワードで絞り込み（例: AI ツール、SaaS、副業）")).toBeTruthy();
  });

  it("renders RSS-only trends after switching tabs", async () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /^トレンド$/ }));
    await waitFor(() => expect(screen.getByText("今日のAI開発シグナル")).toBeTruthy());
    expect(screen.getByText("RSSフィード")).toBeTruthy();
    expect(screen.queryByText("X需要シグナル")).toBeNull();
    expect(screen.queryByText("Xトレンド")).toBeNull();
    expect(screen.getByText("AIエージェントツールがプロダクト業務に広がる")).toBeTruthy();
    expect(screen.queryByText("AI agent tools are moving into product workflows")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "記事の要約" }));
    expect(screen.getByText("チームがプロダクト業務にAIエージェントツールを導入している動きを紹介しています。")).toBeTruthy();
  });

  it("renders search input on the ideas view", async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByText("フィルター")).toBeTruthy());
    expect(screen.getByPlaceholderText("キーワードで絞り込み（例: AI ツール、SaaS、副業）")).toBeTruthy();
  });

  it("renders right panel cards on the ideas view", async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByText(/高収益ポテンシャル/)).toBeTruthy());
    expect(screen.getByText(/急上昇トレンド/)).toBeTruthy();
    expect(screen.getByText("選択中のアイデア")).toBeTruthy();
  });
});
