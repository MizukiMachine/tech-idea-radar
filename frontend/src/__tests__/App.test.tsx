import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import App from "../App";
import { formatBatchTimestamp } from "../utils/batch-time";

const mockFetch = vi.fn();
const generatedAt = new Date().toISOString();
const trendBatchTime = "2026-05-23T04:00:00+09:00";
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
  batchTime: trendBatchTime,
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
  generatedAt,
  batchTime: trendBatchTime,
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

function streamResponse(events: string[]): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const event of events) controller.enqueue(encoder.encode(event));
      controller.close();
    },
  });
  return {
    ok: true,
    status: 200,
    body: stream,
  } as Response;
}

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
    expect(screen.getByRole("button", { name: /^開発アイデア/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: "海外トレンド" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "おすすめ開発アイデア" })).toBeNull();
    expect(screen.queryByText("アイデア一覧")).toBeNull();
    expect(screen.queryByText("アイデア候補")).toBeNull();
    expect(screen.queryByText("プロダクト仮説ボード")).toBeNull();
    expect(screen.queryByText("技術トレンドをもとに、作る候補を比較")).toBeNull();
    expect(screen.queryByText("言語")).toBeNull();
    expect(screen.queryByText("短期開発向け")).toBeNull();
    expect(screen.getByPlaceholderText("キーワードで絞り込み")).toBeTruthy();
    await waitFor(() => expect(screen.getByRole("button", { name: "AI Ops Memo の詳細を開く" })).toBeTruthy());
    const ideaSearchRow = document.querySelector(".idea-results-toolbar__search-row");
    expect(ideaSearchRow?.querySelector(".idea-results-toolbar__search input")).toBeTruthy();
    expect(ideaSearchRow?.querySelector(".idea-results-toolbar__count")?.textContent).toBe("1件");
    expect(document.querySelector(".idea-results-toolbar > .idea-results-toolbar__count")).toBeNull();
    expect(screen.getByText(formatBatchTimestamp(trendBatchTime))).toBeTruthy();
  });

  it("starts idea generation stream when the cache is empty", async () => {
    mockFetch.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/ai/ideas/stream")) {
        return Promise.resolve(streamResponse([
          `event: generation_progress\ndata: ${JSON.stringify({ text: "アイデア候補を生成中..." })}\n\n`,
          `event: idea_generated\ndata: ${JSON.stringify(idea)}\n\n`,
          `event: generation_complete\ndata: ${JSON.stringify({
            generatedAt,
            count: 1,
            featuredIdea: idea,
            sourceSummary: { rssItemCount: 3, usedLLMFallback: false },
          })}\n\n`,
        ]));
      }

      let body: unknown = {
        status: "empty",
        candidates: [],
        generatedAt: "",
        sourceSummary: { rssItemCount: 0, usedLLMFallback: false },
        batches: [],
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

    await waitFor(() => expect(screen.getByRole("button", { name: "AI Ops Memo の詳細を開く" })).toBeTruthy());
    expect(mockFetch.mock.calls.some(([input]) => String(input).includes("/api/ai/ideas/stream"))).toBe(true);
  });

  it("renders RSS-only trends after switching tabs", async () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "海外トレンド" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "すべて 2" })).toBeTruthy());
    expect(screen.getByPlaceholderText("キーワードで絞り込み")).toBeTruthy();
    expect(screen.queryByText("海外メディアトレンド")).toBeNull();
    expect(screen.queryByText("RSSフィード")).toBeNull();
    expect(screen.queryByText("tech系開発シグナル")).toBeNull();
    expect(screen.queryByText("海外メディアを中心にトレンドをキャッチ")).toBeNull();
    expect(screen.queryByText("動いているトピック")).toBeNull();
    expect(screen.getByRole("button", { name: "すべて 2" })).toBeTruthy();
    const trendSearchRow = document.querySelector(".tb-feed__search-row");
    expect(trendSearchRow?.querySelector(".tb-feed__search input")).toBeTruthy();
    expect(trendSearchRow?.querySelector(".tb-feed__count")?.textContent).toBe("2件");
    expect(document.querySelector(".tb-feed__tools > .tb-feed__count")).toBeNull();
    const spikingFilter = screen.getByRole("button", { name: "急増 2" });
    expect(spikingFilter).toBeTruthy();
    fireEvent.click(spikingFilter);
    expect(screen.getByText("急増の記事")).toBeTruthy();
    expect(screen.getByText("2/2件")).toBeTruthy();
    expect(screen.queryByText(/score/i)).toBeNull();
    expect(screen.getAllByText("急増").length).toBeGreaterThan(0);
    expect(screen.getAllByText(formatBatchTimestamp(trendBatchTime))).toHaveLength(2);
    expect(screen.getByText("AIエージェントツールがプロダクト業務に広がる")).toBeTruthy();
    const buttons = screen.getAllByRole("button", { name: "要約を見る" });
    fireEvent.click(buttons[0]);
    expect(screen.getByText(firstSummary.split("\n")[0].replace(/^・/, ""))).toBeTruthy();
    fireEvent.click(buttons[1]);
    expect(screen.getByText(firstSummary.split("\n")[0].replace(/^・/, ""))).toBeTruthy();
    expect(screen.getByText(secondSummary.split("\n")[0].replace(/^・/, ""))).toBeTruthy();
  });

  it("filters trend articles by keyword search", async () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "海外トレンド" }));

    await waitFor(() => expect(screen.getByRole("button", { name: /^すべて / })).toBeTruthy());
    fireEvent.change(screen.getByPlaceholderText("キーワードで絞り込み"), {
      target: { value: "TechCrunch" },
    });

    expect(screen.getByText("開発ワークフローの自動化が進む")).toBeTruthy();
    expect(screen.queryByText("AIエージェントツールがプロダクト業務に広がる")).toBeNull();
    expect(screen.getByText("1/2件")).toBeTruthy();
  });

  it("renders previous trend snapshots and deduplicates repeated article URLs", async () => {
    const previousGeneratedAt = new Date(Date.parse(generatedAt) - 4 * 60 * 60 * 1000).toISOString();
    const oldGeneratedAt = new Date(Date.parse(generatedAt) - 25 * 60 * 60 * 1000).toISOString();
    const previousOnlyPublishedAt = new Date(Date.parse(previousGeneratedAt) - 71 * 60 * 60 * 1000).toISOString();
    const previousTrends = {
      ...trends,
      generatedAt: previousGeneratedAt,
      rssContext: {
        ...trends.rssContext,
        trendingKeywords: [{ word: "previous", count: 1 }],
        topicClusters: [],
        relatedArticles: [
          {
            ...trends.rssContext.relatedArticles[0],
            title: "Older duplicate article",
            titleJa: "古い重複記事",
          },
          {
            ...trends.rssContext.relatedArticles[1],
            title: "Previous snapshot unique article",
            titleJa: "前回取得分だけにある記事",
            link: "https://example.com/previous-only",
            url: "https://example.com/previous-only",
            published: previousOnlyPublishedAt,
            publishedAt: previousOnlyPublishedAt,
            source: "Previous RSS",
            topicStatus: undefined,
            topicKey: undefined,
            firstSeenAt: undefined,
            lastSeenAt: undefined,
            topicArticleCount: undefined,
            topicSourceCount: undefined,
            keywords: ["previous"],
          },
        ],
      },
    };
    const historyWithPrevious = {
      history: [
        trendHistory.history[0],
        {
          scannedAt: previousGeneratedAt,
          generatedAt: previousGeneratedAt,
          articleCount: 2,
          keywordCount: 1,
        },
        {
          scannedAt: oldGeneratedAt,
          generatedAt: oldGeneratedAt,
          articleCount: 1,
          keywordCount: 1,
        },
      ],
    };

    mockFetch.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      let body: unknown = {
        status: "cached",
        candidates: [idea],
        generatedAt,
        sourceSummary: { rssItemCount: 3, usedLLMFallback: false },
      };
      if (url.includes("/api/ai/trends/history/1")) body = previousTrends;
      else if (url.includes("/api/ai/trends/history")) body = historyWithPrevious;
      else if (url.includes("/api/ai/trends")) body = trends;
      if (url.includes("/api/ai/ideas/meta")) body = meta;
      return Promise.resolve({
        ok: true,
        json: async () => body,
      });
    });

    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "海外トレンド" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "すべて 3" })).toBeTruthy());
    expect(screen.getByText("履歴2回")).toBeTruthy();
    expect(screen.getByText("AIエージェントツールがプロダクト業務に広がる")).toBeTruthy();
    expect(screen.getByText("開発ワークフローの自動化が進む")).toBeTruthy();
    expect(screen.getByText("前回取得分だけにある記事")).toBeTruthy();
    expect(screen.queryByText("古い重複記事")).toBeNull();
    expect(screen.getByRole("button", { name: "新着 1" })).toBeTruthy();
    expect(mockFetch.mock.calls.some(([input]) => String(input).includes("/api/ai/trends/history/2"))).toBe(false);
  });

  it("shows trend evidence on idea cards and detail modal", async () => {
    render(<App />);

    await waitFor(() => expect(screen.getByText("急増トレンド")).toBeTruthy());
    const ideaCard = screen.getByRole("button", { name: "AI Ops Memo の詳細を開く" });
    expect(ideaCard.textContent).not.toContain("B2B SaaS");
    expect(ideaCard.textContent).not.toContain("2ソース");
    expect(ideaCard.textContent).not.toContain("根拠RSS");
    expect(ideaCard.textContent).not.toContain("登場メディア 2箇所 / 関連記事 2件");
    expect(ideaCard.textContent).toContain("急増トレンド");

    fireEvent.click(screen.getByRole("button", { name: "AI Ops Memo の詳細を開く" }));
    await waitFor(() => expect(screen.getByText("トレンド根拠")).toBeTruthy());
    expect(screen.getByText("AIエージェント導入")).toBeTruthy();
    expect(screen.getByText((_, node) => node?.textContent === "観測規模 2媒体 / 2記事")).toBeTruthy();
    expect(screen.queryByText((_, node) => node?.textContent === "このアイデアの根拠 RSS 1件")).toBeNull();
  });

  it("does not use trend evidence on idea cards when the latest trend scan is older than 24 hours", async () => {
    const staleGeneratedAt = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
    const staleTrends = {
      ...trends,
      generatedAt: staleGeneratedAt,
    };

    mockFetch.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      let body: unknown = {
        status: "cached",
        candidates: [idea],
        generatedAt,
        sourceSummary: { rssItemCount: 3, usedLLMFallback: false },
      };
      if (url.includes("/api/ai/trends/history")) body = trendHistory;
      else if (url.includes("/api/ai/trends")) body = staleTrends;
      if (url.includes("/api/ai/ideas/meta")) body = meta;
      return Promise.resolve({
        ok: true,
        json: async () => body,
      });
    });

    render(<App />);

    await waitFor(() => expect(screen.getByRole("button", { name: "AI Ops Memo の詳細を開く" })).toBeTruthy());
    await waitFor(() => expect(mockFetch.mock.calls.some(([input]) => String(input).includes("/api/ai/trends"))).toBe(true));
    expect(screen.queryByText("急増トレンド")).toBeNull();
    expect((screen.getByRole("button", { name: "トレンド優先" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("infers visible trend status when cached RSS articles omit topic metadata", async () => {
    const trendsWithoutTopicMetadata = {
      ...trends,
      rssContext: {
        ...trends.rssContext,
        topicClusters: [],
        relatedArticles: trends.rssContext.relatedArticles.map((article, index) => {
          const next = { ...article } as Partial<typeof article>;
          delete next.topicKey;
          delete next.topicStatus;
          delete next.firstSeenAt;
          delete next.lastSeenAt;
          delete next.topicArticleCount;
          delete next.topicSourceCount;
          if (index === 1) {
            next.published = new Date(Date.parse(generatedAt) - 5 * 24 * 60 * 60 * 1000).toISOString();
            next.publishedAt = next.published;
          }
          return next;
        }),
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
      if (url.includes("/api/ai/trends")) body = trendsWithoutTopicMetadata;
      if (url.includes("/api/ai/trends/history")) body = trendHistory;
      if (url.includes("/api/ai/ideas/meta")) body = meta;
      return Promise.resolve({
        ok: true,
        json: async () => body,
      });
    });

    render(<App />);

    await waitFor(() => expect(screen.getByText("新着トレンド")).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: "海外トレンド" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "新着 1" })).toBeTruthy());
    expect(document.querySelectorAll(".tb-status-badge--new")).toHaveLength(1);
    expect(document.querySelectorAll(".tb-status-badge--continuing")).toHaveLength(0);
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
    fireEvent.click(screen.getByRole("button", { name: "海外トレンド" }));

    await waitFor(() => expect(screen.getByRole("button", { name: /^すべて / })).toBeTruthy());
    expect(screen.getByText("AIエージェントツールがプロダクト業務に広がる")).toBeTruthy();
    expect(screen.getByText("開発ワークフローの自動化が進む")).toBeTruthy();
    expect(screen.queryByText("Hidden English-only legacy article")).toBeNull();
    expect(document.querySelector(".tb-metric")).toBeNull();

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
    fireEvent.click(screen.getByRole("button", { name: "海外トレンド" }));

    await waitFor(() => expect(screen.getByRole("button", { name: /^すべて / })).toBeTruthy());
    expect(screen.getByText("AIエージェントツールがプロダクト業務に広がる")).toBeTruthy();
    expect(screen.queryByText("短すぎる要約が残った記事")).toBeNull();
  });

  it("renders search input on the ideas view", async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByText("ジャンル・テーマ")).toBeTruthy());
    expect(screen.getByPlaceholderText("キーワードで絞り込み")).toBeTruthy();
  });

  it("renders right panel summary and filters on the ideas view", async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByText(/注目のアイデア/)).toBeTruthy());
    expect(screen.getByText("よく出るタグ")).toBeTruthy();
    expect(screen.getByText("ジャンル・テーマ")).toBeTruthy();
    expect(screen.queryByText("注目のトレンド")).toBeNull();
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

    fireEvent.click(screen.getByRole("button", { name: "海外トレンド" }));
    await waitFor(() => expect(screen.getByRole("button", { name: /^すべて / })).toBeTruthy());
    expect(screen.queryByRole("button", { name: "再取得" })).toBeNull();
    expect(screen.queryByRole("button", { name: "案を見る" })).toBeNull();
    expect(screen.queryByRole("button", { name: "アイデアを見る" })).toBeNull();
    expect(mockFetch.mock.calls.some(([input]) => String(input).includes("/api/ai/ideas/filter"))).toBe(false);
  });

  it("fetches trend history when switching to trends view", async () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "海外トレンド" }));
    await waitFor(() => expect(screen.getByRole("button", { name: /^すべて / })).toBeTruthy());
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
    fireEvent.click(screen.getByRole("button", { name: "海外トレンド" }));

    await waitFor(() => expect(screen.getByRole("button", { name: /^すべて / })).toBeTruthy());
    expect(screen.getByText("AIエージェントツールがプロダクト業務に広がる")).toBeTruthy();
    expect(screen.queryByText("トレンド取得に失敗しました")).toBeNull();
  });
});
