import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import App from "../App";

const mockFetch = vi.fn();
const generatedAt = new Date().toISOString();

function validTrendSummary(topic: string): string {
  return [
    `・${topic}の背景には、開発やプロダクト運営で調査、整理、連携が細かく分断され、既存ツールだけでは判断材料を十分に追い切れない状況がある。単なる効率化ではなく、情報の質と責任ある判断をどう保つかが論点になっており、チーム全体の運用課題として浮上している`,
    `・記事では、チームが日々の業務にAI支援を組み込み、情報収集や論点整理を自動化しようとする動きが中心に描かれている。個人の便利機能から、組織の運用プロセスへAIを組み込む段階に移りつつあり、現場の使い方も変わり始めている`,
    `・具体例として、複数の情報源を見比べる作業、会議前の論点整理、実装前の技術検証などをAIで補助する場面が示されている。短時間で仮説を比較し、検討漏れを減らす使い方が重要になっており、担当者の準備作業を軽くできる`,
    `・一方で、AIの出力精度、既存ワークフローとの接続、チーム内での責任分界は課題として残る。導入するだけでは成果につながらず、確認やレビューを含めた運用設計が必要になる点が転換点になっており、管理方法も問われる`,
    `・転換点は、AIを単体の便利機能として使う段階から、業務プロセスの中に組み込み、判断やレビューの流れそのものを変える段階へ移っていることにある。効果測定も作業時間だけでは不十分になり、意思決定の質まで見る必要がある`,
    `・開発者やプロダクト担当者にとっては、流行語として追うより、どの作業の時間を減らし、どの判断の質を高めるかを小さく検証する姿勢が重要になる。失敗時に戻せる運用単位で試すことが示唆になり、導入範囲を絞る判断も必要になる`,
    `・最終的には、AIを大きく導入する前に、対象業務、確認責任、成功指標を明確にすることが重要になる。小さな検証で効果とリスクを見極めれば、現場に無理なく定着するプロダクト改善につなげやすい`,
  ].join("\n");
}

const firstSummary = validTrendSummary("AIエージェント導入");
const secondSummary = validTrendSummary("開発ワークフロー自動化");
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
    relatedArticles: [
      {
        title: "AI agent tools are moving into product workflows",
        titleJa: "AIエージェントツールがプロダクト業務に広がる",
        link: "https://example.com/article",
        url: "https://example.com/article",
        published: generatedAt,
        publishedAt: generatedAt,
        summary: "Teams are adopting agent tools for product work.",
        summaryJa: firstSummary,
        source: "Example RSS",
        keywords: ["AI", "agent"],
      },
      {
        title: "Developer workflows get more automated",
        titleJa: "開発ワークフローの自動化が進む",
        link: "https://example.com/article-2",
        url: "https://example.com/article-2",
        published: generatedAt,
        publishedAt: generatedAt,
        summary: "Developer teams automate routine workflow tasks.",
        summaryJa: secondSummary,
        source: "TechCrunch",
        keywords: ["automation"],
      },
    ],
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
      articleCount: 2,
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
    const buttons = screen.getAllByRole("button", { name: "要約を見る" });
    fireEvent.click(buttons[0]);
    expect(screen.getByText(firstSummary.split("\n")[0].replace(/^・/, ""))).toBeTruthy();
    fireEvent.click(buttons[1]);
    expect(screen.getByText(firstSummary.split("\n")[0].replace(/^・/, ""))).toBeTruthy();
    expect(screen.getByText(secondSummary.split("\n")[0].replace(/^・/, ""))).toBeTruthy();
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

  it("still renders trends when trend history is unavailable", async () => {
    mockFetch.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/ai/trends/history")) {
        return Promise.resolve({
          ok: false,
          status: 404,
          json: async () => ({ error: "Not found" }),
        });
      }
      let body: unknown = {
        status: "cached",
        candidates: [idea],
        generatedAt,
        sourceSummary: { rssItemCount: 3, usedLLMFallback: false },
      };
      if (url.includes("/api/ai/trends")) body = trends;
      if (url.includes("/api/ai/ideas/meta")) body = meta;
      return Promise.resolve({
        ok: true,
        json: async () => body,
      });
    });

    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /^トレンド$/ }));

    await waitFor(() => expect(screen.getByText("RSSフィード")).toBeTruthy());
    expect(screen.getByText("AIエージェントツールがプロダクト業務に広がる")).toBeTruthy();
    expect(screen.queryByText("トレンド取得に失敗しました")).toBeNull();
  });
});
