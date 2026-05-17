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
  tags: ["AI", "SaaS"],
  productType: "B2B SaaS",
  targetUsers: "小規模な SRE チーム",
  coreProblem: "障害対応の知見が散らばる",
  differentiation: "運用トレンドを根拠に提案する",
  sources: { rssKeywords: ["AI"], evidenceUrls: [] },
  generatedAt,
};
const meta = {
  instanceId: "test-instance",
  pid: 123,
  startedAt: generatedAt,
  port: "3010",
  env: {
    hasZaiApiKey: true,
    publicReadonlyMode: false,
    adminAuthEnabled: false,
    persistentCacheEnabled: false,
    cacheTtlHours: 1,
    warmupOnStart: true,
    backgroundRefreshIntervalHours: 0,
    maxTrendHistory: 30,
  },
  cache: {
    status: "cached",
    expiresAt: generatedAt,
    generatedAt,
    candidateCount: 1,
    sourceSummary: { rssItemCount: 3, usedLLMFallback: false },
  },
  generationInProgress: false,
  trendScanInProgress: false,
  backgroundRefreshInProgress: false,
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
  focusKeywords: ["AI"],
  featuredTrend: {
    title: "AI agent tools are moving into product workflows",
    titleJa: "AIエージェントツールがプロダクト業務に広がる",
    url: "https://example.com/article",
    source: "Example RSS",
    published: generatedAt,
    summary: "AIエージェント導入がプロダクト業務に広がっています。",
  },
  generatedAt,
  sourceSummary: { rssItemCount: 3, usedLLMFallback: false },
};
const trendHistory = {
  history: [
    {
      scannedAt: generatedAt,
      generatedAt,
      articleCount: 1,
      keywordCount: 1,
    },
  ],
};

beforeEach(() => {
  mockFetch.mockReset();
  mockFetch.mockImplementation((input: RequestInfo | URL) => {
    const url = String(input);
    let body: unknown = {
      status: "cached",
      candidates: [idea],
      generatedAt,
      sourceSummary: { rssItemCount: 3, usedLLMFallback: false },
    };
    if (url.includes("/api/ai/trends")) body = trends;
    if (url.includes("/api/ai/trends/history")) body = trendHistory;
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
    expect(screen.getByRole("heading", { name: "Lume" })).toBeTruthy();
    await waitFor(() => expect(screen.getByText("ジャンル・テーマ")).toBeTruthy());
    expect(screen.queryByText("言語")).toBeNull();
    expect(screen.queryByText("短期開発向け")).toBeNull();
    expect(screen.getByPlaceholderText("キーワードで絞り込み（例: AI ツール、SaaS、副業）")).toBeTruthy();
  });

  it("renders RSS-only trends after switching tabs", async () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /^トレンド$/ }));
    await waitFor(() => expect(screen.getByText("今日のAI開発シグナル")).toBeTruthy());
    expect(screen.getByText("RSSフィード")).toBeTruthy();
    expect(screen.getByText("AIエージェントツールがプロダクト業務に広がる")).toBeTruthy();
    expect(screen.queryByText("AI agent tools are moving into product workflows")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "要約を見る" }));
    expect(screen.getByText("チームがプロダクト業務にAIエージェントツールを導入している動きを紹介しています。")).toBeTruthy();
  });

  it("renders search input on the ideas view", async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByText("ジャンル・テーマ")).toBeTruthy());
    expect(screen.getByPlaceholderText("キーワードで絞り込み（例: AI ツール、SaaS、副業）")).toBeTruthy();
  });

  it("renders right panel cards on the ideas view", async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByText("選択中のアイデア")).toBeTruthy());
    await waitFor(() => expect(screen.getByText("注目のトレンド")).toBeTruthy());
    expect(screen.getByText("AIエージェントツールがプロダクト業務に広がる")).toBeTruthy();
  });

  it("hides generation controls in public readonly mode", async () => {
    const publicMeta = {
      ...meta,
      env: {
        ...meta.env,
        publicReadonlyMode: true,
        adminAuthEnabled: true,
      },
    };
    mockFetch.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      let body: unknown = {
        status: "cached",
        candidates: [idea],
        generatedAt,
        sourceSummary: { rssItemCount: 3, usedLLMFallback: false },
      };
      if (url.includes("/api/ai/trends")) body = trends;
      if (url.includes("/api/ai/trends/history")) body = trendHistory;
      if (url.includes("/api/ai/ideas/meta")) body = publicMeta;
      return Promise.resolve({
        ok: true,
        json: async () => body,
      });
    });

    render(<App />);
    await waitFor(() => expect(screen.getByRole("heading", { name: "Lume" })).toBeTruthy());
    expect(screen.queryByRole("button", { name: "AIで絞り込み" })).toBeNull();
    expect(screen.queryByRole("button", { name: "再生成" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /^トレンド$/ }));
    await waitFor(() => expect(screen.getByText("今日のAI開発シグナル")).toBeTruthy());
    expect(screen.queryByRole("button", { name: "再取得" })).toBeNull();
    expect(screen.queryByRole("button", { name: "案を見る" })).toBeNull();
    expect(screen.queryByRole("button", { name: "アイデアを見る" })).toBeNull();
    expect(mockFetch.mock.calls.some(([input]) => String(input).includes("/api/ai/ideas/filter"))).toBe(false);
  });

  it("fetches trend history when switching to trends view", async () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /^トレンド$/ }));
    await waitFor(() => expect(screen.getByText("今日のAI開発シグナル")).toBeTruthy());
    expect(mockFetch.mock.calls.some(([input]) => String(input).includes("/api/ai/trends/history"))).toBe(true);
  });
});
