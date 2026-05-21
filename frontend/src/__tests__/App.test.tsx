import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import App from "../App";

const mockFetch = vi.fn();
const generatedAt = new Date().toISOString();
const summaryPolicy = {
  minItems: 3,
  maxItems: 6,
  minTotalChars: 240,
  maxTotalChars: 1200,
  maxItemChars: 260,
  minJapaneseChars: 120,
  minJapaneseToLatinRatio: 0.35,
};

function validTrendSummary(topic: string): string {
  return [
    `・${topic}の背景には、開発やプロダクト運営で調査、整理、連携が細かく分断され、既存ツールだけでは判断材料を十分に追い切れない状況がある。単なる効率化ではなく、情報の質と責任ある判断をどう保つかが論点になっており、チーム全体の運用課題として浮上している`,
    `・記事では、チームが日々の業務にAI支援を組み込み、情報収集や論点整理を自動化しようとする動きが中心に描かれている。個人の便利機能から、組織の運用プロセスへAIを組み込む段階に移りつつあり、現場の使い方も変わり始めている`,
    `・具体例として、複数の情報源を見比べる作業、会議前の論点整理、実装前の技術検証などをAIで補助する場面が示されている。短時間で仮説を比較し、検討漏れを減らす使い方が重要になっており、担当者の準備作業を軽くできる`,
    `・一方で、AIの出力精度、既存ワークフローとの接続、チーム内での責任分界は課題として残る。導入するだけでは成果につながらず、確認やレビューを含めた運用設計が必要になる点が転換点になっており、管理方法も問われる`,
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
  sources: {
    rssKeywords: ["AI", "agent"],
    evidenceUrls: [
      {
        title: "AI agent tools are moving into product workflows",
        url: "https://example.com/article",
        type: "rss" as const,
      },
    ],
  },
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
        topicKey: "ai agent workflows",
        topicStatus: "spiking",
        firstSeenAt: generatedAt,
        lastSeenAt: generatedAt,
        topicArticleCount: 2,
        topicSourceCount: 2,
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
        topicKey: "ai agent workflows",
        topicStatus: "spiking",
        firstSeenAt: generatedAt,
        lastSeenAt: generatedAt,
        topicArticleCount: 2,
        topicSourceCount: 2,
      },
    ],
    topicClusters: [
      {
        topic: "ai agent workflows",
        label: "AIエージェント導入",
        status: "spiking",
        score: 68,
        articleCount: 2,
        sourceCount: 2,
        sources: ["Example RSS", "TechCrunch"],
        firstSeenAt: generatedAt,
        lastSeenAt: generatedAt,
        recentCount: 2,
        previousCount: 0,
        representativeArticles: [
          {
            title: "AI agent tools are moving into product workflows",
            url: "https://example.com/article",
            source: "Example RSS",
            publishedAt: generatedAt,
            firstSeenAt: generatedAt,
            summary: "Teams are adopting agent tools for product work.",
          },
          {
            title: "Developer workflows get more automated",
            url: "https://example.com/article-2",
            source: "TechCrunch",
            publishedAt: generatedAt,
            firstSeenAt: generatedAt,
            summary: "Developer teams automate routine workflow tasks.",
          },
        ],
      },
    ],
  },
  focusKeywords: ["AI"],
  summaryPolicy,
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
    await waitFor(() => expect(screen.getByText("tech系開発シグナル")).toBeTruthy());
    expect(screen.getByText("RSSフィード")).toBeTruthy();
    expect(screen.getByText("トピックレーダー")).toBeTruthy();
    expect(screen.getByText("AIエージェント導入")).toBeTruthy();
    expect(screen.getAllByText("急増トピック").length).toBeGreaterThan(0);
    expect(screen.getByText("AIエージェントツールがプロダクト業務に広がる")).toBeTruthy();
    const buttons = screen.getAllByRole("button", { name: "要約を見る" });
    fireEvent.click(buttons[0]);
    expect(screen.getByText(firstSummary.split("\n")[0].replace(/^・/, ""))).toBeTruthy();
    fireEvent.click(buttons[1]);
    expect(screen.getByText(firstSummary.split("\n")[0].replace(/^・/, ""))).toBeTruthy();
    expect(screen.getByText(secondSummary.split("\n")[0].replace(/^・/, ""))).toBeTruthy();
  });

  it("shows trend evidence on idea cards and detail modal", async () => {
    render(<App />);

    await waitFor(() => expect(screen.getByText("急増トレンド")).toBeTruthy());
    const ideaCard = screen.getByRole("button", { name: "AI Ops Memo の詳細を開く" });
    expect(ideaCard.textContent).not.toContain("B2B SaaS");
    expect(ideaCard.textContent).not.toContain("2ソース");
    expect(ideaCard.textContent).not.toContain("根拠RSS");
    expect(ideaCard.textContent).toContain("登場メディア 2箇所 / 関連記事 2件");

    fireEvent.click(screen.getByRole("button", { name: "AI Ops Memo の詳細を開く" }));
    await waitFor(() => expect(screen.getByText("トレンド根拠")).toBeTruthy());
    expect(screen.getByText("AIエージェント導入")).toBeTruthy();
    expect(screen.getByText((_, node) => node?.textContent === "観測規模 2媒体 / 2記事")).toBeTruthy();
    expect(screen.queryByText((_, node) => node?.textContent === "このアイデアの根拠 RSS 1件")).toBeNull();
  });

  it("hides stale RSS evidence from idea cards", async () => {
    const staleTrends = {
      ...trends,
      rssContext: {
        ...trends.rssContext,
        topicClusters: [],
        relatedArticles: trends.rssContext.relatedArticles.map((article) => ({
          ...article,
          topicStatus: "stale",
          topicArticleCount: 1,
          topicSourceCount: 1,
        })),
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
      if (url.includes("/api/ai/trends")) body = staleTrends;
      if (url.includes("/api/ai/trends/history")) body = trendHistory;
      if (url.includes("/api/ai/ideas/meta")) body = meta;
      return Promise.resolve({
        ok: true,
        json: async () => body,
      });
    });

    render(<App />);

    await waitFor(() => expect(screen.getByRole("button", { name: "AI Ops Memo の詳細を開く" })).toBeTruthy());
    expect(screen.queryByText("RSS根拠あり")).toBeNull();
    expect(screen.queryByText("停滞トレンド")).toBeNull();
    expect(screen.queryByText("根拠RSS 1件")).toBeNull();
    expect((screen.getByRole("button", { name: "トレンド優先" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("sorts ideas by RSS evidence count", async () => {
    const noEvidenceIdea = {
      ...idea,
      id: "idea-no-evidence",
      title: "No Evidence Idea",
      sources: { rssKeywords: ["other"], evidenceUrls: [] },
    };

    mockFetch.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      let body: unknown = {
        status: "cached",
        candidates: [noEvidenceIdea, idea],
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

    render(<App />);
    await waitFor(() => expect(document.querySelector(".idea-grid .idea-card__title")?.textContent).toBe("No Evidence Idea"));
    expect(document.querySelector(".idea-grid .idea-card__title")?.textContent).toBe("No Evidence Idea");

    fireEvent.click(screen.getByRole("button", { name: "根拠多い順" }));
    expect(document.querySelector(".idea-grid .idea-card__title")?.textContent).toBe("AI Ops Memo");
  });

  it("keeps legacy trend summaries clickable when the API omits the summary policy", async () => {
    const legacySummary = "旧形式の日本語要約です。箇条書きポリシー導入前のキャッシュでも、受信時に契約を補完しつつ既存の要約本文は確認できるようにします。";
    const legacyTrendScan = {
      ...trends,
      rssContext: {
        ...trends.rssContext,
        relatedArticles: [
          {
            ...trends.rssContext.relatedArticles[0],
            summaryJa: legacySummary,
          },
          {
            ...trends.rssContext.relatedArticles[1],
            summaryJa: "This English legacy summary includes https://example.com and must not create a summary button.",
          },
          {
            title: "Hidden English-only legacy article",
            titleJa: undefined,
            link: "https://example.com/hidden-legacy",
            url: "https://example.com/hidden-legacy",
            published: generatedAt,
            publishedAt: generatedAt,
            summary: "Hidden from fallback articles because it has no Japanese title.",
            summaryJa: "これは表示対象外の記事に残っている旧形式の日本語要約です。要約本文があっても記事カード自体が表示されない場合、要約済み件数には含めません。",
            source: "Legacy RSS",
            keywords: ["legacy"],
          },
        ],
      },
    } as Record<string, unknown>;
    delete legacyTrendScan.summaryPolicy;

    mockFetch.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      let body: unknown = {
        status: "cached",
        candidates: [idea],
        generatedAt,
        sourceSummary: { rssItemCount: 3, usedLLMFallback: false },
      };
      if (url.includes("/api/ai/trends")) body = legacyTrendScan;
      if (url.includes("/api/ai/trends/history")) body = trendHistory;
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
    expect(screen.getByText("開発ワークフローの自動化が進む")).toBeTruthy();
    expect(screen.queryByText("Hidden English-only legacy article")).toBeNull();
    const summaryMetric = [...document.querySelectorAll(".tb-metric")]
      .find((node) => node.textContent?.includes("要約済み"));
    expect(summaryMetric?.textContent).toContain("1");

    const buttons = screen.getAllByRole("button", { name: "要約を見る" });
    expect(buttons).toHaveLength(1);
    fireEvent.click(buttons[0]);
    expect(screen.getByText(legacySummary)).toBeTruthy();
  });

  it("hides trend articles whose generated Japanese summary fails the display policy", async () => {
    const invalidTrends = {
      ...trends,
      rssContext: {
        ...trends.rssContext,
        relatedArticles: [
          trends.rssContext.relatedArticles[0],
          {
            title: "Broken generated summary remains too short",
            titleJa: "短すぎる要約が残った記事",
            link: "https://example.com/broken-summary",
            url: "https://example.com/broken-summary",
            published: generatedAt,
            publishedAt: generatedAt,
            summary: "A short generated summary.",
            summaryJa: "これは短すぎる要約です。",
            source: "Example RSS",
            keywords: ["AI"],
          },
        ],
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
      if (url.includes("/api/ai/trends")) body = invalidTrends;
      if (url.includes("/api/ai/trends/history")) body = trendHistory;
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
    expect(screen.queryByText("短すぎる要約が残った記事")).toBeNull();
  });

  it("renders search input on the ideas view", async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByText("ジャンル・テーマ")).toBeTruthy());
    expect(screen.getByPlaceholderText("キーワードで絞り込み（例: AI ツール、SaaS、副業）")).toBeTruthy();
  });

  it("renders right panel cards on the ideas view", async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByText(/注目のアイデア/)).toBeTruthy());
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
    await waitFor(() => expect(screen.getByText("tech系開発シグナル")).toBeTruthy());
    expect(screen.queryByRole("button", { name: "再取得" })).toBeNull();
    expect(screen.queryByRole("button", { name: "案を見る" })).toBeNull();
    expect(screen.queryByRole("button", { name: "アイデアを見る" })).toBeNull();
    expect(mockFetch.mock.calls.some(([input]) => String(input).includes("/api/ai/ideas/filter"))).toBe(false);
  });

  it("fetches trend history when switching to trends view", async () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /^トレンド$/ }));
    await waitFor(() => expect(screen.getByText("tech系開発シグナル")).toBeTruthy());
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
