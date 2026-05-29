import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { LLMClient } from '../src/services/llm-client';
import { IdeaGenerationAgent } from '../src/agents/idea-generation-agent';
import { FilterAgent } from '../src/agents/filter-agent';
import { EntrepreneurAgent } from '../src/agents/entrepreneur-agent';
import { fetchRssContext } from '../src/services/rss-client';
import { RSS_ARTICLE_SUMMARY_POLICY } from '../src/policies/rss-summary-policy';
import type { IdeaCandidate } from '../src/types/idea-candidate';

vi.mock('../src/services/rss-client', () => ({
  fetchRssContext: vi.fn(),
}));

const candidate: IdeaCandidate = {
  id: 'idea-1',
  title: 'AI Ops Memo',
  tagline: '障害対応メモを自動整理',
  description: 'SRE チーム向けに障害対応ログを分類し、再発防止策を提案する。',
  tags: ['AI', 'SaaS', 'dev-tools'],
  productType: 'B2B SaaS',
  targetUsers: '小規模な SRE チーム',
  coreProblem: '障害対応の知見が散らばる',
  differentiation: 'RSS 由来の運用トレンドを根拠に提案する',
  sources: {
    rssKeywords: ['AI', 'SRE'],
    evidenceUrls: [
      { title: 'AI Ops article', url: 'https://example.com/ai-ops', type: 'rss' },
      { title: 'Untrusted', url: 'https://invalid.example.com', type: 'rss' },
    ],
  },
  generatedAt: '2026-05-14T00:00:00.000Z',
};

function createMockClient(response: string): LLMClient {
  const client = new LLMClient('test-key');
  vi.spyOn(client, 'send').mockResolvedValue(response);
  vi.spyOn(client, 'sendStream').mockImplementation(async (_system, _user, _tokens, onChunk) => {
    onChunk(response);
    return response;
  });
  return client;
}

function extractPromptRssContext(prompt: string): Record<string, unknown> {
  const match = /### RSSコンテキスト\s+```json\s+([\s\S]*?)\s+```/.exec(prompt);
  if (!match) throw new Error('RSS context block not found');
  return JSON.parse(match[1]) as Record<string, unknown>;
}

function validTrendSummary(topic = 'AIエージェント導入'): string {
  return [
    `・${topic}の背景には、開発やプロダクト運営で調査、整理、連携が細かく分断され、既存ツールだけでは判断材料を十分に追い切れない状況がある。単なる効率化ではなく、情報の質と責任ある判断をどう保つかが論点になっており、チーム全体の運用課題として浮上している`,
    `・記事では、チームが日々の業務にAI支援を組み込み、情報収集や論点整理を自動化しようとする動きが中心に描かれている。個人の便利機能から、組織の運用プロセスへAIを組み込む段階に移りつつあり、現場の使い方も変わり始めている`,
    `・具体例として、複数の情報源を見比べる作業、会議前の論点整理、実装前の技術検証などをAIで補助する場面が示されている。短時間で仮説を比較し、検討漏れを減らす使い方が重要になっており、担当者の準備作業を軽くできる`,
    `・一方で、AIの出力精度、既存ワークフローとの接続、チーム内での責任分界は課題として残る。導入するだけでは成果につながらず、確認やレビューを含めた運用設計が必要になる点が転換点になっており、管理方法も問われる`,
    `・開発者やプロダクト担当者にとっては、流行語として追うより、どの作業の時間を減らし、どの判断の質を高めるかを小さく検証する姿勢が重要になる。失敗時に戻せる運用単位で試すことが示唆になり、導入範囲を絞る判断も必要になる`,
  ].join('\n');
}

function conciseTrendSummary(topic = '短いRSS抜粋'): string {
  return [
    `・${topic}では、限られた入力から確認できる背景と主要な動きを整理している`,
    '・記事は、NATOやAirbus A330など固有名詞を含む具体的な出来事と関係者への影響を短く伝えている',
    '・開発者やプロダクト担当者は、この変化を市場調査や追加検証の入口として扱える',
  ].join('\n');
}

function trendSummaryResponseForPrompt(userPrompt: string): string {
  const indexes = [...userPrompt.matchAll(/"index":\s*(\d+)/g)].map((match) => Number(match[1]));
  return JSON.stringify(indexes.map((index) => ({
    index,
    title: `RSS article ${index}`,
    titleJa: `RSS記事${index}`,
    summaryJa: validTrendSummary(`RSS記事${index}`),
  })));
}

function createIdeaGenerationMockClient(response: IdeaCandidate | IdeaCandidate[] = candidate): LLMClient {
  const candidates = Array.isArray(response) ? response : [response];
  const client = createMockClient('[]');
  vi.mocked(client.send).mockImplementation(async (_system, userPrompt, maxTokens) => {
    const prompt = String(userPrompt);
    if (maxTokens === 3000) return '[]';
    if (prompt.includes('次のRSS記事')) return trendSummaryResponseForPrompt(prompt);
    if (prompt.includes('検証エラー')) return trendSummaryResponseForPrompt(prompt);
    if (prompt.includes('### 今回の候補数')) {
      return JSON.stringify(candidates.map((item, index) => ({
        seedId: `seed-${index + 1}`,
        title: item.title,
        tagline: item.tagline,
        tags: item.tags,
        productType: item.productType,
        targetUsers: item.targetUsers,
        coreProblem: item.coreProblem,
        differentiationHint: item.differentiation,
        rssKeywords: item.sources.rssKeywords,
        evidenceUrls: item.sources.evidenceUrls,
      })));
    }
    if (prompt.includes('### 詳細化するアイデア候補')) return JSON.stringify(candidates[0]);
    if (maxTokens === 256) return JSON.stringify({ index: 0 });
    return JSON.stringify(candidates);
  });
  return client;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(fetchRssContext).mockResolvedValue({
    trendingKeywords: [{ word: 'AI', count: 3 }],
    relatedArticles: [{
      title: 'AI Ops article',
      titleJa: 'AI運用記事',
      link: 'https://example.com/ai-ops',
      url: 'https://example.com/ai-ops',
      published: '2026-05-14T00:00:00.000Z',
      summary: 'AI Ops for SRE teams',
      source: 'Test RSS',
      keywords: ['AI', 'SRE'],
    }],
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('IdeaGenerationAgent', () => {
  it('builds a RSS trend-aware prompt and parses idea candidates', async () => {
    const longDescription = [
      '障害対応ログを分類し、初動の時系列と担当者の判断材料を自動で整理する',
      '振り返りで再発防止策の候補を提示し、過去の対応履歴と関連メモをまとめる',
      '監視通知の断片を読み込み、原因仮説と確認すべき証跡を担当者ごとに並べる',
      '小規模オンコールチームで一週間分の障害対応を取り込み、分類精度を検証する',
      '対応ログの検索時間を減らし、新人でも過去事例に沿って初動判断できる状態を目指す',
      '週次で未解決課題と改善アクションを管理者が確認できる画面を用意する',
    ].join('。');
    const client = createMockClient(JSON.stringify([{ ...candidate, description: longDescription }]));
    const agent = new IdeaGenerationAgent(client);

    const result = await agent.execute({
      rssContext: {
        trendingKeywords: [{ word: 'AI', count: 2 }],
        relatedArticles: [{
          title: 'AI Ops article',
          link: 'https://example.com/ai-ops',
          url: 'https://example.com/ai-ops',
          published: '2026-05-14T00:00:00.000Z',
          summary: 'AI Ops for SRE teams',
          source: 'Test RSS',
          keywords: ['AI', 'SRE'],
        }],
      },
      focusKeywords: ['AI', 'SaaS'],
      requestedIdeaCount: 5,
    });

    expect(result[0].title).toBe('AI Ops Memo');
    const descriptionItems = result[0].description.split('\n');
    expect(descriptionItems).toHaveLength(5);
    for (const item of descriptionItems) {
      expect(item.startsWith('・')).toBe(true);
      expect(item).not.toContain('。');
      expect(Array.from(item.replace(/^・/, '')).length).toBeLessThanOrEqual(70);
    }
    expect(client.send).toHaveBeenCalledOnce();
    const prompt = vi.mocked(client.send).mock.calls[0]?.[1] ?? '';
    expect(prompt).toContain('AI, SaaS');
    expect(prompt).toContain('### RSSコンテキスト');
    expect(prompt).toContain('### フォーカスキーワード');
    expect(prompt).toContain('最大 5 件');
  });

  it('compacts RSS context before sending the idea generation prompt', async () => {
    vi.stubEnv('IDEA_GENERATION_RSS_ARTICLE_LIMIT', '8');
    vi.stubEnv('IDEA_GENERATION_KEYWORD_LIMIT', '12');
    const client = createMockClient(JSON.stringify([candidate]));
    const agent = new IdeaGenerationAgent(client);
    const longSummary = 'A'.repeat(900);

    await agent.execute({
      rssContext: {
        trendingKeywords: Array.from({ length: 16 }, (_, index) => ({ word: `keyword-${index}`, count: 20 - index })),
        relatedArticles: Array.from({ length: 12 }, (_, index) => ({
          title: `Article ${index}`,
          link: `https://example.com/article-${index}`,
          url: `https://example.com/article-${index}`,
          published: '2026-05-14T00:00:00.000Z',
          summary: longSummary,
          summaryJa: `・${longSummary}`,
          description: longSummary,
          source: 'Test RSS',
          keywords: ['AI', 'SaaS', 'developer', 'workflow', 'agent', 'automation', 'extra'],
          topicKey: `topic-${index}`,
        })),
        topicClusters: Array.from({ length: 12 }, (_, index) => ({
          topic: `topic-${index}`,
          label: `Topic ${index}`,
          status: 'new',
          score: 10,
          articleCount: 1,
          sourceCount: 1,
          sources: ['Test RSS'],
          firstSeenAt: '2026-05-14T00:00:00.000Z',
          lastSeenAt: '2026-05-14T00:00:00.000Z',
          recentCount: 1,
          previousCount: 0,
          representativeArticles: [{
            title: `Article ${index}`,
            url: `https://example.com/article-${index}`,
            source: 'Test RSS',
            firstSeenAt: '2026-05-14T00:00:00.000Z',
            summary: longSummary,
          }],
        })),
      },
      focusKeywords: ['AI'],
      requestedIdeaCount: 5,
    });

    const prompt = vi.mocked(client.send).mock.calls[0]?.[1] ?? '';
    const tokens = vi.mocked(client.send).mock.calls[0]?.[2];
    const context = extractPromptRssContext(prompt);
    const articles = context.relatedArticles as Array<{ summary: string; summaryJa: string; description: string; keywords: string[] }>;
    const keywords = context.trendingKeywords as unknown[];
    const topics = context.topicClusters as unknown[];

    expect(tokens).toBe(16_384);
    expect(articles).toHaveLength(8);
    expect(keywords).toHaveLength(12);
    expect(topics).toHaveLength(8);
    expect(articles[0].summary.length).toBeLessThanOrEqual(420);
    expect(articles[0].summaryJa.length).toBeLessThanOrEqual(420);
    expect(articles[0].description.length).toBeLessThanOrEqual(240);
    expect(articles[0].keywords).toHaveLength(6);
  });

  it('refuses to call the LLM when RSS articles are unavailable', async () => {
    const client = createMockClient(JSON.stringify([candidate]));
    const agent = new IdeaGenerationAgent(client);

    await expect(agent.execute({
      rssContext: { trendingKeywords: [{ word: 'AI', count: 2 }], relatedArticles: [] },
      focusKeywords: ['AI'],
    })).rejects.toMatchObject({ name: 'RssSourceUnavailableError' });
    expect(client.send).not.toHaveBeenCalled();
  });

  it('selects idea seeds once and expands details concurrently', async () => {
    vi.stubEnv('IDEA_DETAIL_REQUEST_CONCURRENCY', '3');
    const client = createMockClient('[]');
    const seeds = Array.from({ length: 6 }, (_, index) => ({
      seedId: `seed-${index + 1}`,
      title: `Idea seed ${index + 1}`,
      tagline: `Seed tagline ${index + 1}`,
      tags: ['AI', 'SaaS'],
      productType: 'B2B SaaS',
      targetUsers: 'プロダクトチーム',
      coreProblem: `課題 ${index + 1}`,
      differentiationHint: `差別化 ${index + 1}`,
      rssKeywords: ['AI'],
      evidenceUrls: [{ title: 'AI Ops article', url: 'https://example.com/ai-ops', type: 'rss' }],
    }));
    let activeRequests = 0;
    let maxActiveRequests = 0;
    vi.mocked(client.send).mockImplementation(async (_system, userPrompt) => {
      if (!userPrompt.includes('### 詳細化するアイデア候補')) {
        return JSON.stringify(seeds);
      }

      activeRequests += 1;
      maxActiveRequests = Math.max(maxActiveRequests, activeRequests);
      await new Promise((resolve) => setTimeout(resolve, 20));
      activeRequests -= 1;

      const seedId = /"seedId":\s*"seed-(\d+)"/.exec(userPrompt)?.[1] ?? '1';
      return JSON.stringify({
        ...candidate,
        id: `idea-${seedId}`,
        title: `Detailed idea ${seedId}`,
        coreProblem: `課題 ${seedId}`,
      });
    });
    const agent = new IdeaGenerationAgent(client);

    const result = await agent.executeStaged({
      rssContext: {
        trendingKeywords: [{ word: 'AI', count: 6 }],
        relatedArticles: [{
          title: 'AI Ops article',
          link: 'https://example.com/ai-ops',
          url: 'https://example.com/ai-ops',
          published: '2026-05-14T00:00:00.000Z',
          summary: 'AI Ops for SRE teams',
          source: 'Test RSS',
          keywords: ['AI', 'SRE'],
        }],
      },
      focusKeywords: ['AI', 'SaaS'],
      requestedIdeaCount: 6,
    });

    expect(result.map((item) => item.title)).toEqual([
      'Detailed idea 1',
      'Detailed idea 2',
      'Detailed idea 3',
      'Detailed idea 4',
      'Detailed idea 5',
      'Detailed idea 6',
    ]);
    expect(client.send).toHaveBeenCalledTimes(7);
    expect(client.sendStream).not.toHaveBeenCalled();
    expect(maxActiveRequests).toBe(3);
  });

  it('uses a bounded default concurrency for idea detail generation', async () => {
    const client = createMockClient('[]');
    const seeds = Array.from({ length: 8 }, (_, index) => ({
      seedId: `seed-${index + 1}`,
      title: `Idea seed ${index + 1}`,
      tagline: `Seed tagline ${index + 1}`,
      tags: ['AI', 'SaaS'],
      productType: 'B2B SaaS',
      targetUsers: 'プロダクトチーム',
      coreProblem: `課題 ${index + 1}`,
      differentiationHint: `差別化 ${index + 1}`,
      rssKeywords: ['AI'],
    }));
    let activeRequests = 0;
    let maxActiveRequests = 0;
    vi.mocked(client.send).mockImplementation(async (_system, userPrompt) => {
      if (!userPrompt.includes('### 詳細化するアイデア候補')) {
        return JSON.stringify(seeds);
      }

      activeRequests += 1;
      maxActiveRequests = Math.max(maxActiveRequests, activeRequests);
      await new Promise((resolve) => setTimeout(resolve, 20));
      activeRequests -= 1;

      const seedId = /"seedId":\s*"seed-(\d+)"/.exec(userPrompt)?.[1] ?? '1';
      return JSON.stringify({ ...candidate, id: `idea-${seedId}`, title: `Detailed idea ${seedId}` });
    });
    const agent = new IdeaGenerationAgent(client);

    const result = await agent.executeStaged({
      rssContext: {
        trendingKeywords: [{ word: 'AI', count: 8 }],
        relatedArticles: [{
          title: 'AI Ops article',
          link: 'https://example.com/ai-ops',
          url: 'https://example.com/ai-ops',
          published: '2026-05-14T00:00:00.000Z',
          summary: 'AI Ops for SRE teams',
          source: 'Test RSS',
          keywords: ['AI', 'SRE'],
        }],
      },
      requestedIdeaCount: 8,
    });

    expect(result).toHaveLength(8);
    expect(maxActiveRequests).toBe(2);
  });

  it('passes bounded timeout options to staged idea generation requests', async () => {
    const client = createMockClient('[]');
    const seed = {
      seedId: 'seed-1',
      title: 'Idea seed 1',
      tagline: 'Seed tagline 1',
      tags: ['AI', 'SaaS'],
      productType: 'B2B SaaS',
      targetUsers: 'プロダクトチーム',
      coreProblem: '課題 1',
      differentiationHint: '差別化 1',
      rssKeywords: ['AI'],
    };
    vi.mocked(client.send).mockImplementation(async (_system, userPrompt) => {
      if (!userPrompt.includes('### 詳細化するアイデア候補')) return JSON.stringify([seed]);
      return JSON.stringify({ ...candidate, id: 'idea-1', title: 'Detailed idea 1' });
    });
    const agent = new IdeaGenerationAgent(client);

    await agent.executeStaged({
      rssContext: {
        trendingKeywords: [{ word: 'AI', count: 1 }],
        relatedArticles: [{
          title: 'AI Ops article',
          link: 'https://example.com/ai-ops',
          url: 'https://example.com/ai-ops',
          published: '2026-05-14T00:00:00.000Z',
          summary: 'AI Ops for SRE teams',
          source: 'Test RSS',
          keywords: ['AI', 'SRE'],
        }],
      },
      requestedIdeaCount: 1,
    });

    expect(vi.mocked(client.send).mock.calls[0]?.[3]).toEqual({
      maxAttempts: 1,
      timeoutMs: 60_000,
    });
    expect(vi.mocked(client.send).mock.calls[1]?.[3]).toEqual({
      maxAttempts: 1,
      timeoutMs: 120_000,
    });
  });

  it('falls back to RSS-derived seeds when LLM seed selection times out', async () => {
    const client = createMockClient('[]');
    vi.mocked(client.send).mockImplementation(async (_system, userPrompt) => {
      if (userPrompt.includes('### 今回の候補数')) throw new Error('seed timeout');
      if (userPrompt.includes('### 詳細化するアイデア候補')) {
        const seedId = /"seedId":\s*"rss-seed-(\d+)"/.exec(userPrompt)?.[1] ?? '1';
        return JSON.stringify({
          ...candidate,
          id: `idea-${seedId}`,
          title: `RSS fallback idea ${seedId}`,
          coreProblem: `RSS由来の課題 ${seedId}`,
        });
      }
      throw new Error('single-request fallback should not run');
    });
    const agent = new IdeaGenerationAgent(client);

    const result = await agent.executeStaged({
      rssContext: {
        trendingKeywords: [{ word: 'AI', count: 2 }],
        relatedArticles: [
          {
            title: 'AI Ops article',
            link: 'https://example.com/ai-ops',
            url: 'https://example.com/ai-ops',
            published: '2026-05-14T00:00:00.000Z',
            summary: 'AI Ops for SRE teams',
            source: 'Test RSS',
            keywords: ['AI', 'SRE'],
          },
          {
            title: 'Product workflow article',
            link: 'https://example.com/product-workflow',
            url: 'https://example.com/product-workflow',
            published: '2026-05-14T00:00:00.000Z',
            summary: 'Product teams are adopting AI workflows.',
            source: 'Test RSS',
            keywords: ['AI', 'workflow'],
          },
        ],
      },
      requestedIdeaCount: 2,
    });

    const singleRequestFallbackCalls = vi.mocked(client.send).mock.calls
      .filter((call) => String(call[1]).includes('### 今回の生成件数'));
    expect(result.map((item) => item.title)).toEqual(['RSS fallback idea 1', 'RSS fallback idea 2']);
    expect(singleRequestFallbackCalls).toHaveLength(0);
  });

  it('retries failed and incomplete idea detail generations', async () => {
    vi.stubEnv('IDEA_DETAIL_REQUEST_CONCURRENCY', '2');
    vi.stubEnv('IDEA_DETAIL_REQUEST_RETRIES', '2');
    vi.stubEnv('IDEA_DETAIL_RETRY_DELAY_MS', '0');
    const client = createMockClient('[]');
    const seeds = Array.from({ length: 3 }, (_, index) => ({
      seedId: `seed-${index + 1}`,
      title: `Idea seed ${index + 1}`,
      tagline: `Seed tagline ${index + 1}`,
      tags: ['AI', 'SaaS'],
      productType: 'B2B SaaS',
      targetUsers: 'プロダクトチーム',
      coreProblem: `課題 ${index + 1}`,
      differentiationHint: `差別化 ${index + 1}`,
      rssKeywords: ['AI'],
    }));
    const attemptsBySeed = new Map<string, number>();
    vi.mocked(client.send).mockImplementation(async (_system, userPrompt) => {
      if (!userPrompt.includes('### 詳細化するアイデア候補')) {
        return JSON.stringify(seeds);
      }

      const seedId = /"seedId":\s*"seed-(\d+)"/.exec(userPrompt)?.[1] ?? '1';
      const attempt = (attemptsBySeed.get(seedId) ?? 0) + 1;
      attemptsBySeed.set(seedId, attempt);

      if (seedId === '2' && attempt === 1) {
        throw new Error('temporary detail failure');
      }
      if (seedId === '3' && attempt === 1) {
        return JSON.stringify({
          id: 'incomplete',
          title: 'Incomplete idea',
          tagline: '説明文がない不完全な応答',
          tags: ['AI'],
          productType: 'B2B SaaS',
          targetUsers: 'プロダクトチーム',
          coreProblem: '課題',
          differentiation: '差別化',
        });
      }

      return JSON.stringify({
        ...candidate,
        id: `idea-${seedId}`,
        title: `Detailed idea ${seedId}`,
        description: `Detailed description ${seedId}`,
      });
    });
    const agent = new IdeaGenerationAgent(client);

    const result = await agent.executeStaged({
      rssContext: {
        trendingKeywords: [{ word: 'AI', count: 3 }],
        relatedArticles: [{
          title: 'AI Ops article',
          link: 'https://example.com/ai-ops',
          url: 'https://example.com/ai-ops',
          published: '2026-05-14T00:00:00.000Z',
          summary: 'AI Ops for SRE teams',
          source: 'Test RSS',
          keywords: ['AI', 'SRE'],
        }],
      },
      requestedIdeaCount: 3,
    });

    expect(result.map((item) => item.title)).toEqual([
      'Detailed idea 1',
      'Detailed idea 2',
      'Detailed idea 3',
    ]);
    expect(attemptsBySeed.get('1')).toBe(1);
    expect(attemptsBySeed.get('2')).toBe(2);
    expect(attemptsBySeed.get('3')).toBe(2);
    expect(client.send).toHaveBeenCalledTimes(6);
  });

  it('falls back to single-request generation when detail retries still leave missing cards', async () => {
    vi.stubEnv('IDEA_DETAIL_REQUEST_CONCURRENCY', '2');
    vi.stubEnv('IDEA_DETAIL_REQUEST_RETRIES', '1');
    vi.stubEnv('IDEA_DETAIL_RETRY_DELAY_MS', '0');
    const client = createMockClient('[]');
    const seeds = [1, 2].map((value) => ({
      seedId: `seed-${value}`,
      title: `Idea seed ${value}`,
      tagline: `Seed tagline ${value}`,
      tags: ['AI', 'SaaS'],
      productType: 'B2B SaaS',
      targetUsers: 'プロダクトチーム',
      coreProblem: `課題 ${value}`,
      differentiationHint: `差別化 ${value}`,
      rssKeywords: ['AI'],
    }));
    vi.mocked(client.send).mockImplementation(async (_system, userPrompt) => {
      if (userPrompt.includes('### 今回の候補数')) return JSON.stringify(seeds);
      if (userPrompt.includes('### 詳細化するアイデア候補')) return JSON.stringify({ title: 'Incomplete idea' });
      return JSON.stringify([
        { ...candidate, id: 'fallback-1', title: 'Fallback idea 1' },
        { ...candidate, id: 'fallback-2', title: 'Fallback idea 2' },
      ]);
    });
    const agent = new IdeaGenerationAgent(client);

    const result = await agent.executeStaged({
      rssContext: {
        trendingKeywords: [{ word: 'AI', count: 2 }],
        relatedArticles: [{
          title: 'AI Ops article',
          link: 'https://example.com/ai-ops',
          url: 'https://example.com/ai-ops',
          published: '2026-05-14T00:00:00.000Z',
          summary: 'AI Ops for SRE teams',
          source: 'Test RSS',
          keywords: ['AI', 'SRE'],
        }],
      },
      requestedIdeaCount: 2,
    });

    expect(result.map((item) => item.title)).toEqual(['Fallback idea 1', 'Fallback idea 2']);
    expect(client.send).toHaveBeenCalledTimes(6);
    const calls = vi.mocked(client.send).mock.calls;
    expect(calls[calls.length - 1]?.[3]).toEqual({
      maxAttempts: 1,
      timeoutMs: 180_000,
    });
  });

  it('returns partial detail results instead of blocking on single-request fallback', async () => {
    vi.stubEnv('IDEA_DETAIL_REQUEST_CONCURRENCY', '2');
    vi.stubEnv('IDEA_DETAIL_REQUEST_RETRIES', '0');
    const client = createMockClient('[]');
    const seeds = [1, 2].map((value) => ({
      seedId: `seed-${value}`,
      title: `Idea seed ${value}`,
      tagline: `Seed tagline ${value}`,
      tags: ['AI', 'SaaS'],
      productType: 'B2B SaaS',
      targetUsers: 'プロダクトチーム',
      coreProblem: `課題 ${value}`,
      differentiationHint: `差別化 ${value}`,
      rssKeywords: ['AI'],
    }));
    vi.mocked(client.send).mockImplementation(async (_system, userPrompt) => {
      if (userPrompt.includes('### 今回の候補数')) return JSON.stringify(seeds);
      if (userPrompt.includes('"seedId": "seed-1"')) {
        return JSON.stringify({ ...candidate, id: 'partial-1', title: 'Partial idea 1' });
      }
      if (userPrompt.includes('### 詳細化するアイデア候補')) return JSON.stringify({ title: 'Incomplete idea' });
      throw new Error('single-request fallback should not run when partial details exist');
    });
    const agent = new IdeaGenerationAgent(client);

    const result = await agent.executeStaged({
      rssContext: {
        trendingKeywords: [{ word: 'AI', count: 2 }],
        relatedArticles: [{
          title: 'AI Ops article',
          link: 'https://example.com/ai-ops',
          url: 'https://example.com/ai-ops',
          published: '2026-05-14T00:00:00.000Z',
          summary: 'AI Ops for SRE teams',
          source: 'Test RSS',
          keywords: ['AI', 'SRE'],
        }],
      },
      requestedIdeaCount: 2,
    });

    const singleRequestFallbackCalls = vi.mocked(client.send).mock.calls
      .filter((call) => String(call[1]).includes('### 今回の生成件数'));
    expect(result.map((item) => item.title)).toEqual(['Partial idea 1']);
    expect(singleRequestFallbackCalls).toHaveLength(0);
  });

  it('falls back when the idea detail stage exceeds its total time budget', async () => {
    vi.stubEnv('IDEA_DETAIL_TOTAL_TIMEOUT_MS', '1');
    const client = createMockClient('[]');
    const seeds = [1, 2].map((value) => ({
      seedId: `seed-${value}`,
      title: `Idea seed ${value}`,
      tagline: `Seed tagline ${value}`,
      tags: ['AI', 'SaaS'],
      productType: 'B2B SaaS',
      targetUsers: 'プロダクトチーム',
      coreProblem: `課題 ${value}`,
      differentiationHint: `差別化 ${value}`,
      rssKeywords: ['AI'],
    }));
    vi.mocked(client.send).mockImplementation(async (_system, userPrompt) => {
      if (userPrompt.includes('### 今回の候補数')) return JSON.stringify(seeds);
      if (userPrompt.includes('### 詳細化するアイデア候補')) throw new Error('detail should not start');
      return JSON.stringify([
        { ...candidate, id: 'fallback-1', title: 'Fallback idea 1' },
        { ...candidate, id: 'fallback-2', title: 'Fallback idea 2' },
      ]);
    });
    const agent = new IdeaGenerationAgent(client);

    const result = await agent.executeStaged({
      rssContext: {
        trendingKeywords: [{ word: 'AI', count: 2 }],
        relatedArticles: [{
          title: 'AI Ops article',
          link: 'https://example.com/ai-ops',
          url: 'https://example.com/ai-ops',
          published: '2026-05-14T00:00:00.000Z',
          summary: 'AI Ops for SRE teams',
          source: 'Test RSS',
          keywords: ['AI', 'SRE'],
        }],
      },
      requestedIdeaCount: 2,
    });

    const detailCalls = vi.mocked(client.send).mock.calls
      .filter((call) => String(call[1]).includes('### 詳細化するアイデア候補'));
    expect(result.map((item) => item.title)).toEqual(['Fallback idea 1', 'Fallback idea 2']);
    expect(detailCalls).toHaveLength(0);
    expect(client.send).toHaveBeenCalledTimes(2);
  });
});

describe('FilterAgent', () => {
  it('parses semantic filter output', async () => {
    const response = {
      filteredCandidates: [candidate],
      filterReasoning: 'AI と運用課題に一致しています。',
      matchCriteria: ['AI', 'SRE'],
    };
    const client = createMockClient(JSON.stringify(response));
    const agent = new FilterAgent(client);

    const result = await agent.execute({ query: 'SRE向けAI', candidates: [candidate] });

    expect(result.filteredCandidates).toHaveLength(1);
    expect(result.matchCriteria).toEqual(['AI', 'SRE']);
  });
});

describe('EntrepreneurAgent', () => {
  it('scans RSS articles without selecting a featured trend', async () => {
    vi.mocked(fetchRssContext).mockResolvedValueOnce({
      trendingKeywords: [{ word: 'AI', count: 3 }],
      relatedArticles: [{
        title: 'AIエージェントツールがプロダクト業務に広がる',
        link: 'https://example.com/agent-tools',
        url: 'https://example.com/agent-tools',
        published: '2026-05-14T00:00:00.000Z',
        publishedAt: '2026-05-14T00:00:00.000Z',
        summary: 'プロダクトチームがAIエージェントツールを導入している。',
        source: 'Test RSS',
        keywords: ['AI', 'agent'],
      }],
    });
    const client = createMockClient('{}');
    vi.mocked(client.send).mockResolvedValueOnce(JSON.stringify([{
      index: 0,
      title: 'AIエージェントツールがプロダクト業務に広がる',
      titleJa: 'AIエージェントツールがプロダクト業務に広がる',
      summaryJa: validTrendSummary(),
    }]));
    const agent = new EntrepreneurAgent(client);

    const result = await agent.scanTrends();

    expect(result).not.toHaveProperty('featuredTrend');
    expect(result.summaryPolicy).toEqual(RSS_ARTICLE_SUMMARY_POLICY);
    expect(client.send).toHaveBeenCalledOnce();
    expect(client.send).toHaveBeenCalledWith(
      expect.stringContaining('技術ニュースの編集者'),
      expect.any(String),
      7000,
      {
        maxAttempts: 1,
        timeoutMs: 120_000,
      },
    );
  });

  it('uses the LLM to refine RSS related article clusters', async () => {
    const firstSeenAt = '2026-05-21T00:00:00.000Z';
    vi.mocked(fetchRssContext).mockResolvedValueOnce({
      trendingKeywords: [{ word: 'GitHub', count: 3 }],
      relatedArticles: [
        {
          title: 'Take your local GitHub sessions anywhere',
          titleJa: 'ローカルのGitHubセッションをどこへでも持ち運ぶ',
          link: 'https://example.com/github-sessions',
          url: 'https://example.com/github-sessions',
          published: firstSeenAt,
          publishedAt: firstSeenAt,
          summary: 'GitHub sessions can be controlled from different devices.',
          summaryJa: validTrendSummary('GitHubセッション引き継ぎ'),
          source: 'GitHub Blog',
          keywords: ['GitHub', 'sessions'],
          topicKey: 'take your',
          topicStatus: 'new',
          firstSeenAt,
          lastSeenAt: firstSeenAt,
          topicArticleCount: 1,
          topicSourceCount: 1,
        },
        {
          title: 'Remote coding sessions arrive for local development',
          titleJa: 'ローカル開発セッションをリモートで引き継ぐ動き',
          link: 'https://example.com/remote-sessions',
          url: 'https://example.com/remote-sessions',
          published: firstSeenAt,
          publishedAt: firstSeenAt,
          summary: 'Developers can resume local coding sessions from browsers and mobile devices.',
          summaryJa: validTrendSummary('ローカル開発セッション引き継ぎ'),
          source: 'Dev Blog',
          keywords: ['coding', 'sessions'],
          topicKey: 'remote coding',
          topicStatus: 'new',
          firstSeenAt,
          lastSeenAt: firstSeenAt,
          topicArticleCount: 1,
          topicSourceCount: 1,
        },
      ],
      topicClusters: [
        {
          topic: 'take your',
          label: 'Take your local GitHub sessions anywhere',
          status: 'new',
          score: 42,
          articleCount: 3,
          sourceCount: 2,
          sources: ['GitHub Blog', 'GitHub Changelog'],
          firstSeenAt,
          lastSeenAt: firstSeenAt,
          recentCount: 3,
          previousCount: 0,
          representativeArticles: [
            {
              title: 'Take your local GitHub sessions anywhere',
              link: 'https://example.com/github-sessions',
              url: 'https://example.com/github-sessions',
              source: 'GitHub Blog',
              publishedAt: firstSeenAt,
              firstSeenAt,
              summary: 'GitHub sessions can be controlled from different devices.',
            },
          ],
        },
        {
          topic: 'remote coding',
          label: 'Remote coding sessions arrive for local development',
          status: 'new',
          score: 36,
          articleCount: 2,
          sourceCount: 1,
          sources: ['Dev Blog'],
          firstSeenAt,
          lastSeenAt: firstSeenAt,
          recentCount: 2,
          previousCount: 0,
          representativeArticles: [],
        },
      ],
    });
    const client = createMockClient('{}');
    vi.mocked(client.send)
      .mockResolvedValueOnce(JSON.stringify([
        {
          topic: 'github-session-handoff',
          label: 'GitHubセッション引き継ぎ',
          articleIndexes: [0, 1],
          confidence: '0.88',
        },
      ]))
      .mockResolvedValueOnce(JSON.stringify({
        index: 0,
        summary: 'GitHubセッション引き継ぎが開発ワークフローの注目点になっています。',
      }));
    const agent = new EntrepreneurAgent(client);

    const result = await agent.scanTrends();
    const cluster = result.rssContext.topicClusters?.[0];

    expect(cluster).toEqual(expect.objectContaining({
      topic: 'github-session-handoff',
      label: 'GitHubセッション引き継ぎ',
      articleCount: 5,
      sourceCount: 3,
    }));
    expect(cluster?.sources).toEqual(['Dev Blog', 'GitHub Blog', 'GitHub Changelog']);
    expect(result.rssContext.relatedArticles.map((article) => article.topicKey))
      .toEqual(['github-session-handoff', 'github-session-handoff']);
    expect(result.rssContext.relatedArticles.map((article) => article.topicArticleCount))
      .toEqual([5, 5]);
    expect(result.rssContext.relatedArticles.map((article) => article.topicSourceCount))
      .toEqual([3, 3]);
    expect(vi.mocked(client.send).mock.calls[0]?.[1]).toContain('RSS記事');
  });

  it('rejects multi-article LLM topic groups when confidence is missing or invalid', async () => {
    const firstSeenAt = '2026-05-21T00:00:00.000Z';
    vi.mocked(fetchRssContext).mockResolvedValueOnce({
      trendingKeywords: [{ word: 'GitHub', count: 3 }],
      relatedArticles: [
        {
          title: 'Take your local GitHub sessions anywhere',
          titleJa: 'ローカルのGitHubセッションをどこへでも持ち運ぶ',
          link: 'https://example.com/github-sessions',
          url: 'https://example.com/github-sessions',
          published: firstSeenAt,
          publishedAt: firstSeenAt,
          summary: 'GitHub sessions can be controlled from different devices.',
          summaryJa: validTrendSummary('GitHubセッション引き継ぎ'),
          source: 'GitHub Blog',
          keywords: ['GitHub', 'sessions'],
          topicKey: 'take your',
          topicStatus: 'new',
          firstSeenAt,
          lastSeenAt: firstSeenAt,
          topicArticleCount: 1,
          topicSourceCount: 1,
        },
        {
          title: 'Remote coding sessions arrive for local development',
          titleJa: 'ローカル開発セッションをリモートで引き継ぐ動き',
          link: 'https://example.com/remote-sessions',
          url: 'https://example.com/remote-sessions',
          published: firstSeenAt,
          publishedAt: firstSeenAt,
          summary: 'Developers can resume local coding sessions from browsers and mobile devices.',
          summaryJa: validTrendSummary('ローカル開発セッション引き継ぎ'),
          source: 'Dev Blog',
          keywords: ['coding', 'sessions'],
          topicKey: 'remote coding',
          topicStatus: 'new',
          firstSeenAt,
          lastSeenAt: firstSeenAt,
          topicArticleCount: 1,
          topicSourceCount: 1,
        },
      ],
      topicClusters: [
        {
          topic: 'take your',
          label: 'Take your local GitHub sessions anywhere',
          status: 'new',
          score: 42,
          articleCount: 1,
          sourceCount: 1,
          sources: ['GitHub Blog'],
          firstSeenAt,
          lastSeenAt: firstSeenAt,
          recentCount: 1,
          previousCount: 0,
          representativeArticles: [],
        },
        {
          topic: 'remote coding',
          label: 'Remote coding sessions arrive for local development',
          status: 'new',
          score: 36,
          articleCount: 1,
          sourceCount: 1,
          sources: ['Dev Blog'],
          firstSeenAt,
          lastSeenAt: firstSeenAt,
          recentCount: 1,
          previousCount: 0,
          representativeArticles: [],
        },
      ],
    });
    const client = createMockClient('{}');
    vi.mocked(client.send)
      .mockResolvedValueOnce(JSON.stringify([
        {
          topic: 'github-session-handoff',
          label: 'GitHubセッション引き継ぎ',
          articleIndexes: [0, 1],
        },
        {
          topic: 'github-session-handoff-invalid',
          label: 'GitHubセッション引き継ぎ',
          articleIndexes: [0, 1],
          confidence: 'certain',
        },
      ]))
      .mockResolvedValueOnce(JSON.stringify({
        index: 0,
        summary: 'GitHubセッション引き継ぎが開発ワークフローの注目点になっています。',
      }));
    const agent = new EntrepreneurAgent(client);

    const result = await agent.scanTrends();

    expect(result.rssContext.topicClusters?.map((cluster) => cluster.topic))
      .not.toContain('github-session-handoff');
    expect(result.rssContext.topicClusters?.map((cluster) => cluster.topic))
      .not.toContain('github-session-handoff-invalid');
    expect(result.rssContext.relatedArticles.map((article) => article.topicKey))
      .toEqual(['take your', 'remote coding']);
  });

  it('summarizes Japanese RSS excerpts instead of displaying raw feed text', async () => {
    vi.mocked(fetchRssContext).mockResolvedValueOnce({
      trendingKeywords: [{ word: 'AI', count: 3 }],
      relatedArticles: [{
        title: '中小企業のDX支援で最初に自動化すべき3つの業務',
        link: 'https://example.com/dx-automation',
        url: 'https://example.com/dx-automation',
        published: '2026-05-14T00:00:00.000Z',
        summary: 'はじめに：自動化は「全部やる」と失敗する 中小企業のDX支援に関わっていると、何から手をつければいいかわからないという相談をよく受ける。...',
        source: 'Zenn',
        keywords: ['AI', '自動化'],
      }],
    });
    const client = createMockClient('{}');
    const summaryJa = validTrendSummary('中小企業DXの自動化');
    vi.mocked(client.send)
      .mockResolvedValueOnce(JSON.stringify([{
        index: 0,
        title: '中小企業のDX支援で最初に自動化すべき3つの業務',
        titleJa: '中小企業のDX支援で最初に自動化すべき3つの業務',
        summaryJa,
      }]))
      .mockResolvedValueOnce(JSON.stringify({
        index: 0,
        summary: '中小企業DXで自動化対象を絞る重要性が示されています。',
      }));
    const agent = new EntrepreneurAgent(client);

    const result = await agent.scanTrends();
    const article = result.rssContext.relatedArticles[0];
    const summarizationPrompt = vi.mocked(client.send).mock.calls[0]?.[0] ?? '';

    expect(article.summaryJa).toBe(summaryJa);
    expect(article.summaryJa?.split('\n')).toHaveLength(5);
    expect(article.summaryJa?.split('\n').every((line) => line.startsWith('・'))).toBe(true);
    expect(article.summaryJa?.split('\n').every((line) => !/[。．.]$/.test(line))).toBe(true);
    expect(article.summaryJa).not.toContain('はじめに');
    expect(article.summaryJa).not.toContain('...');
    expect(summarizationPrompt).toContain('文末に「...」「…」を付けない');
  });

  it('summarizes RSS article batches concurrently', async () => {
    vi.stubEnv('RSS_SUMMARY_REQUEST_CONCURRENCY', '2');
    vi.mocked(fetchRssContext).mockResolvedValueOnce({
      trendingKeywords: [{ word: 'AI', count: 8 }],
      relatedArticles: Array.from({ length: 8 }, (_, index) => ({
        title: `AI workflow article ${index}`,
        link: `https://example.com/workflow-${index}`,
        url: `https://example.com/workflow-${index}`,
        published: '2026-05-17T00:00:00.000Z',
        summary: 'Teams are adopting AI agents for product and engineering workflows.',
        source: 'Hacker News',
        keywords: ['AI', 'workflow'],
      })),
    });
    const client = createMockClient('[]');
    let activeRequests = 0;
    let maxActiveRequests = 0;
    vi.mocked(client.send).mockImplementation(async (_system, userPrompt) => {
      activeRequests += 1;
      maxActiveRequests = Math.max(maxActiveRequests, activeRequests);
      await new Promise((resolve) => setTimeout(resolve, 20));
      activeRequests -= 1;

      const indexes = [...userPrompt.matchAll(/"index":\s*(\d+)/g)].map((match) => Number(match[1]));
      return JSON.stringify(indexes.map((index) => ({
        index,
        title: `AI workflow article ${index}`,
        titleJa: `AIワークフロー記事${index}`,
        summaryJa: validTrendSummary(`AIワークフロー記事${index}`),
      })));
    });
    const agent = new EntrepreneurAgent(client);

    const result = await agent.scanTrends();

    expect(result.rssContext.relatedArticles).toHaveLength(4);
    expect(client.send).toHaveBeenCalledTimes(2);
    expect(maxActiveRequests).toBe(2);
  });

  it('applies Japanese titles to English RSS articles by index', async () => {
    vi.mocked(fetchRssContext).mockResolvedValueOnce({
      trendingKeywords: [{ word: 'ThinkPad', count: 3 }],
      relatedArticles: [{
        title: 'ThinkPad history from IBM to Lenovo',
        link: 'https://example.com/thinkpad',
        url: 'https://example.com/thinkpad',
        published: '2026-05-17T00:00:00.000Z',
        summary: 'ThinkPad began as an IBM laptop line and later moved under Lenovo.',
        source: 'Hacker News',
        keywords: ['ThinkPad'],
      }],
    });
    const client = createMockClient('{}');
    vi.mocked(client.send)
      .mockResolvedValueOnce(JSON.stringify([{
        index: 0,
        title: 'Slightly different source title',
        titleJa: 'IBMからLenovoへ続くThinkPadの歴史',
        summaryJa: validTrendSummary('ThinkPadの歴史的変遷'),
      }]))
      .mockResolvedValueOnce(JSON.stringify({
        index: 0,
        summary: 'ThinkPadの歴史的変遷が紹介されています。',
      }));
    const agent = new EntrepreneurAgent(client);

    const result = await agent.scanTrends();
    const article = result.rssContext.relatedArticles[0];

    expect(article.titleJa).toBe('IBMからLenovoへ続くThinkPadの歴史');
    expect(article.summaryJa?.split('\n')).toHaveLength(5);
    expect(article.summaryJa).not.toContain('Article URL');
  });

  it('keeps valid concise Japanese summaries for sparse RSS excerpts', async () => {
    vi.mocked(fetchRssContext).mockResolvedValueOnce({
      trendingKeywords: [{ word: 'NATO', count: 2 }],
      relatedArticles: [{
        title: 'Italy moves to Airbus A330 tankers',
        link: 'https://example.com/tankers',
        url: 'https://example.com/tankers',
        published: '2026-05-17T00:00:00.000Z',
        summary: 'Italy moves to Airbus A330 tankers in a major NATO-aligned shift.',
        source: 'Hacker News',
        keywords: ['NATO'],
      }],
    });
    const client = createMockClient('{}');
    const summaryJa = conciseTrendSummary('欧州航空防衛調達');
    vi.mocked(client.send).mockImplementation(async (_system, userPrompt) => (
      userPrompt.includes('RSS記事')
        ? JSON.stringify([{
          index: 0,
          title: 'Italy moves to Airbus A330 tankers',
          titleJa: 'イタリアがAirbus A330空中給油機へ移行',
          summaryJa,
        }])
        : '[]'
    ));
    const agent = new EntrepreneurAgent(client);

    const result = await agent.scanTrends();
    const article = result.rssContext.relatedArticles[0];

    expect(result.rssContext.relatedArticles).toHaveLength(1);
    expect(article.summaryJa).toBe(summaryJa);
    expect(article.summaryJa?.length).toBeLessThan(240);
  });

  it('uses a Japanese fallback title for short product-name RSS titles', async () => {
    vi.mocked(fetchRssContext).mockResolvedValueOnce({
      trendingKeywords: [{ word: 'developer', count: 2 }],
      relatedArticles: [{
        title: 'buildpipe',
        link: 'https://www.producthunt.com/products/buildpipe',
        url: 'https://www.producthunt.com/products/buildpipe',
        published: '2026-05-17T00:00:00.000Z',
        summary: 'A product page for a developer workflow tool.',
        source: 'Product Hunt',
        keywords: ['developer', 'workflow'],
      }],
    });
    const client = createMockClient('{}');
    vi.mocked(client.send).mockImplementation(async (_system, userPrompt) => (
      userPrompt.includes('RSS記事')
        ? JSON.stringify([{
          index: 0,
          title: 'buildpipe',
          titleJa: 'buildpipe',
          summaryJa: validTrendSummary('開発ワークフロー支援'),
        }])
        : '[]'
    ));
    const agent = new EntrepreneurAgent(client);

    const result = await agent.scanTrends();
    const article = result.rssContext.relatedArticles[0];

    expect(result.rssContext.relatedArticles).toHaveLength(1);
    expect(article.titleJa).toBe('buildpipeのプロダクト紹介');
  });

  it('fills the trend display from later RSS candidates when higher-priority summaries fail', async () => {
    vi.mocked(fetchRssContext).mockResolvedValueOnce({
      trendingKeywords: [{ word: 'AI', count: 10 }],
      relatedArticles: Array.from({ length: 10 }, (_, index) => ({
        title: `AI workflow candidate ${index}`,
        link: `https://example.com/candidate-${index}`,
        url: `https://example.com/candidate-${index}`,
        published: '2026-05-17T00:00:00.000Z',
        summary: 'Teams are adopting AI agents for product and engineering workflows.',
        source: index === 0 ? 'Hacker News' : 'Tech RSS',
        keywords: ['AI', 'workflow'],
      })),
    });
    const client = createMockClient('{}');
    vi.mocked(client.send).mockImplementation(async (_system, userPrompt) => {
      if (!userPrompt.includes('RSS記事')) return '[]';
      const indexes = [...userPrompt.matchAll(/"index":\s*(\d+)/g)].map((match) => Number(match[1]));
      return JSON.stringify(indexes.map((index) => ({
        index,
        title: `AI workflow candidate ${index}`,
        titleJa: `AIワークフロー候補${index}`,
        summaryJa: index === 0 ? '' : validTrendSummary(`AIワークフロー候補${index}`),
      })));
    });
    const agent = new EntrepreneurAgent(client);

    const result = await agent.scanTrends();

    expect(result.rssContext.relatedArticles).toHaveLength(4);
    expect(result.rssContext.relatedArticles.map((article) => article.url)).toEqual(
      Array.from({ length: 4 }, (_, index) => `https://example.com/candidate-${index + 1}`),
    );
    expect(result.rssContext.summaryErrors).toBeUndefined();
    expect(result.rssContext.replacedSummaryErrors).toHaveLength(1);
    expect(result.sourceSummary.warnings).toBeUndefined();
  });

  it('uses RSS_RELATED_ARTICLE_CANDIDATE_COUNT for the summary validation pool', async () => {
    vi.stubEnv('RSS_DISPLAY_RELATED_ARTICLES', '1');
    vi.stubEnv('RSS_RELATED_ARTICLE_CANDIDATE_COUNT', '20');
    vi.mocked(fetchRssContext).mockResolvedValueOnce({
      trendingKeywords: [{ word: 'AI', count: 10 }],
      relatedArticles: Array.from({ length: 20 }, (_, index) => ({
        title: `AI workflow candidate ${index}`,
        link: `https://example.com/candidate-${index}`,
        url: `https://example.com/candidate-${index}`,
        published: '2026-05-17T00:00:00.000Z',
        summary: 'Teams are adopting AI agents for product and engineering workflows.',
        source: 'Tech RSS',
        keywords: ['AI', 'workflow'],
      })),
    });
    const client = createMockClient('{}');
    vi.mocked(client.send).mockImplementation(async (_system, userPrompt) => {
      const prompt = String(userPrompt);
      if (!prompt.includes('RSS記事') && !prompt.includes('検証エラー')) return '[]';
      const indexes = [...prompt.matchAll(/"index":\s*(\d+)/g)].map((match) => Number(match[1]));
      return JSON.stringify(indexes.map((index) => ({
        index,
        title: `AI workflow candidate ${index}`,
        titleJa: `AIワークフロー候補${index}`,
        summaryJa: index === 19 ? validTrendSummary(`AIワークフロー候補${index}`) : '',
      })));
    });
    const agent = new EntrepreneurAgent(client);

    const result = await agent.scanTrends();

    expect(result.rssContext.relatedArticles).toHaveLength(1);
    expect(result.rssContext.relatedArticles[0]?.url).toBe('https://example.com/candidate-19');
    expect(result.rssContext.summaryErrors).toBeUndefined();
    expect(result.rssContext.replacedSummaryErrors).toHaveLength(19);
  });

  it('uses only quality-checked display RSS articles for idea generation', async () => {
    vi.mocked(fetchRssContext).mockResolvedValueOnce({
      trendingKeywords: [{ word: 'AI', count: 10 }],
      relatedArticles: Array.from({ length: 10 }, (_, index) => ({
        title: `AI workflow candidate ${index}`,
        link: `https://example.com/candidate-${index}`,
        url: `https://example.com/candidate-${index}`,
        published: '2026-05-17T00:00:00.000Z',
        summary: 'Teams are adopting AI agents for product and engineering workflows.',
        source: 'Tech RSS',
        keywords: ['AI', 'workflow'],
      })),
    });
    const client = createIdeaGenerationMockClient(candidate);
    vi.mocked(client.send).mockImplementation(async (_system, userPrompt, maxTokens) => {
      const prompt = String(userPrompt);
      if (maxTokens === 3000) return '[]';
      if (prompt.includes('次のRSS記事') || prompt.includes('検証エラー')) {
        const indexes = [...prompt.matchAll(/"index":\s*(\d+)/g)].map((match) => Number(match[1]));
        return JSON.stringify(indexes.map((index) => ({
          index,
          title: `AI workflow candidate ${index}`,
          titleJa: `AIワークフロー候補${index}`,
          summaryJa: index === 0 ? '' : validTrendSummary(`AIワークフロー候補${index}`),
        })));
      }
      if (prompt.includes('### 今回の候補数')) {
        return JSON.stringify([{
          seedId: 'seed-1',
          title: candidate.title,
          tagline: candidate.tagline,
          tags: candidate.tags,
          productType: candidate.productType,
          targetUsers: candidate.targetUsers,
          coreProblem: candidate.coreProblem,
          differentiationHint: candidate.differentiation,
          rssKeywords: candidate.sources.rssKeywords,
        }]);
      }
      if (prompt.includes('### 詳細化するアイデア候補')) return JSON.stringify(candidate);
      if (maxTokens === 256) return JSON.stringify({ index: 0 });
      return JSON.stringify([candidate]);
    });
    const agent = new EntrepreneurAgent(client);

    await agent.generateIdeas(undefined, undefined, 1);

    const seedPrompt = vi.mocked(client.send).mock.calls
      .map((call) => String(call[1] ?? ''))
      .find((prompt) => prompt.includes('### 今回の候補数')) ?? '';
    const rssContext = extractPromptRssContext(seedPrompt);
    const relatedArticles = rssContext.relatedArticles as Array<{ url: string }>;
    expect(relatedArticles).toHaveLength(4);
    expect(relatedArticles.map((article) => article.url)).toEqual(
      Array.from({ length: 4 }, (_, index) => `https://example.com/candidate-${index + 1}`),
    );
  });

  it('drops articles whose Japanese summary does not satisfy the trend page policy', async () => {
    vi.mocked(fetchRssContext).mockResolvedValueOnce({
      trendingKeywords: [{ word: 'AI', count: 3 }],
      relatedArticles: [
        {
          title: 'Valid AI product workflow article',
          link: 'https://example.com/valid',
          url: 'https://example.com/valid',
          published: '2026-05-17T00:00:00.000Z',
          summary: 'Teams are adopting AI agents for product work.',
          source: 'Hacker News',
          keywords: ['AI', 'agent'],
        },
        {
          title: 'Invalid English summary article',
          link: 'https://example.com/invalid',
          url: 'https://example.com/invalid',
          published: '2026-05-17T00:00:00.000Z',
          summary: 'Article URL: https://example.com/original Points: 12',
          source: 'Hacker News',
          keywords: ['AI'],
        },
      ],
    });
    const client = createMockClient('{}');
    vi.mocked(client.send)
      .mockResolvedValueOnce(JSON.stringify([
        {
          index: 0,
          title: 'Valid AI product workflow article',
          titleJa: 'AIがプロダクト業務の流れに入り込む動き',
          summaryJa: validTrendSummary('AIプロダクト業務支援'),
        },
        {
          index: 1,
          title: 'Invalid English summary article',
          titleJa: '英語要約が残る記事',
          summaryJa: 'This is still an English one-line summary with https://example.com',
        },
      ]))
      .mockResolvedValueOnce(JSON.stringify({
        index: 0,
        summary: 'AI支援がプロダクト業務に広がっています。',
      }));
    const agent = new EntrepreneurAgent(client);

    const result = await agent.scanTrends();

    expect(result.rssContext.relatedArticles).toHaveLength(1);
    expect(result.rssContext.relatedArticles[0].url).toBe('https://example.com/valid');
    expect(result.rssContext.summaryErrors).toHaveLength(1);
    expect(result.sourceSummary.warnings?.[0]).toContain('1/4件');
  });

  it('fails the trend scan when every RSS article fails summarization', async () => {
    vi.mocked(fetchRssContext).mockResolvedValueOnce({
      trendingKeywords: [{ word: 'AI', count: 3 }],
      relatedArticles: [{
        title: 'English article without Japanese conversion',
        link: 'https://example.com/no-ja',
        url: 'https://example.com/no-ja',
        published: '2026-05-17T00:00:00.000Z',
        summary: 'Teams are adopting AI agents.',
        source: 'Hacker News',
        keywords: ['AI'],
      }],
    });
    const client = createMockClient(JSON.stringify([{
      index: 0,
      title: 'English article without Japanese conversion',
      titleJa: 'English article without Japanese conversion',
      summaryJa: 'Short English summary.',
    }]));
    const agent = new EntrepreneurAgent(client);

    await expect(agent.scanTrends()).rejects.toMatchObject({
      name: 'RssSourceUnavailableError',
      details: expect.objectContaining({
        operation: 'trend_summary',
        summaryFailureCount: 1,
      }),
    });
  });

  it('generates ideas with RSS enrichment and trusted evidence URLs', async () => {
    const client = createIdeaGenerationMockClient(candidate);
    const agent = new EntrepreneurAgent(client);
    const progress: string[] = [];

    const result = await agent.generateIdeas((text) => progress.push(text), undefined, 1);

    expect(fetchRssContext).toHaveBeenCalled();
    expect(client.sendStream).not.toHaveBeenCalled();
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].sources.evidenceUrls).toEqual([
      { title: 'RSS記事0', url: 'https://example.com/ai-ops', type: 'rss' },
    ]);
    expect(result.sourceSummary.usedLLMFallback).toBe(false);
    expect(progress.length).toBeGreaterThan(0);
  });

  it('passes requested count into the generation prompt', async () => {
    const client = createIdeaGenerationMockClient(candidate);
    const agent = new EntrepreneurAgent(client);

    await agent.generateIdeas(undefined, ['AI'], 3);

    const prompt = vi.mocked(client.send).mock.calls
      .map((call) => String(call[1] ?? ''))
      .find((value) => value.includes('最大 3 件')) ?? '';
    expect(prompt).toContain('最大 3 件');
  });

  it('sets batchTime on candidates when provided', async () => {
    const client = createIdeaGenerationMockClient(candidate);
    const agent = new EntrepreneurAgent(client);

    const result = await agent.generateIdeas(undefined, undefined, 15, '2026-05-16T08:00:00+09:00');

    expect(result.candidates[0].batchTime).toBe('2026-05-16T08:00:00+09:00');
    expect(result.batchTime).toBe('2026-05-16T08:00:00+09:00');
  });

  it('bounds optional featured idea selection so cache writes are not blocked for long', async () => {
    const client = createMockClient('[]');
    const seed = {
      seedId: 'seed-1',
      title: 'Idea seed 1',
      tagline: 'Seed tagline 1',
      tags: ['AI', 'SaaS'],
      productType: 'B2B SaaS',
      targetUsers: 'プロダクトチーム',
      coreProblem: '課題 1',
      differentiationHint: '差別化 1',
      rssKeywords: ['AI'],
    };
    vi.mocked(client.send).mockImplementation(async (_system, userPrompt, maxTokens) => {
      const prompt = String(userPrompt);
      if (maxTokens === 3000) return '[]';
      if (prompt.includes('次のRSS記事')) return trendSummaryResponseForPrompt(prompt);
      if (prompt.includes('検証エラー')) return trendSummaryResponseForPrompt(prompt);
      if (String(userPrompt).includes('### 今回の候補数')) return JSON.stringify([seed]);
      if (String(userPrompt).includes('### 詳細化するアイデア候補')) return JSON.stringify(candidate);
      if (maxTokens === 256) throw new Error('featured selection timeout');
      return JSON.stringify([candidate]);
    });
    const agent = new EntrepreneurAgent(client);

    const result = await agent.generateIdeas(undefined, undefined, 1);

    const featuredCall = vi.mocked(client.send).mock.calls.find((call) => call[2] === 256);
    expect(result.candidates).toHaveLength(1);
    expect(result.featuredIdea).toBeUndefined();
    expect(featuredCall?.[3]).toEqual({
      maxAttempts: 1,
      timeoutMs: 20_000,
    });
  });

  it('returns candidates unchanged for empty filter queries without calling the LLM', async () => {
    const second = { ...candidate, id: 'idea-2' };
    const client = createMockClient('unused');
    const agent = new EntrepreneurAgent(client);

    const result = await agent.filterIdeas({ query: ' ', candidates: [second, candidate] });

    expect(result.filteredCandidates.map((idea) => idea.id)).toEqual(['idea-2', 'idea-1']);
    expect(client.send).not.toHaveBeenCalled();
  });

  it('does not attach unrelated RSS articles as evidence', async () => {
    vi.mocked(fetchRssContext).mockResolvedValueOnce({
      trendingKeywords: [{ word: 'AI', count: 3 }],
      relatedArticles: [
        {
          title: 'AI Ops incident memo automation',
          link: 'https://example.com/relevant-ai-ops',
          url: 'https://example.com/relevant-ai-ops',
          published: '2026-05-14T00:00:00.000Z',
          summary: 'SRE teams use AI Ops to organize incident logs and recurrence prevention notes.',
          source: 'Test RSS',
          keywords: ['SRE', 'incident', 'AI Ops'],
        },
        {
          title: 'How to choose a budget monitor',
          link: 'https://example.com/unrelated-monitor',
          url: 'https://example.com/unrelated-monitor',
          published: '2026-05-14T00:00:00.000Z',
          summary: 'Display size, refresh rate, and desk setup advice for home offices.',
          source: 'Test RSS',
          keywords: ['monitor', 'display'],
        },
      ],
    });

    const candidateWithoutEvidence: IdeaCandidate = {
      ...candidate,
      sources: {
        rssKeywords: [],
        evidenceUrls: [],
      },
    };
    const client = createIdeaGenerationMockClient(candidateWithoutEvidence);
    const agent = new EntrepreneurAgent(client);
    const result = await agent.generateIdeas();
    const urls = result.candidates[0].sources.evidenceUrls ?? [];

    expect(urls.some((source) => source.url === 'https://example.com/relevant-ai-ops')).toBe(true);
    expect(urls.some((source) => source.url === 'https://example.com/unrelated-monitor')).toBe(false);
  });
});
