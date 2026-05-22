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
    `・最終的には、AIを大きく導入する前に、対象業務、確認責任、成功指標を明確にすることが重要になる。小さな検証で効果とリスクを見極めれば、現場に無理なく定着するプロダクト改善につなげやすい`,
  ].join('\n');
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(fetchRssContext).mockResolvedValue({
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
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('IdeaGenerationAgent', () => {
  it('builds a RSS trend-aware prompt and parses idea candidates', async () => {
    const client = createMockClient(JSON.stringify([candidate]));
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
    expect(article.summaryJa?.split('\n')).toHaveLength(6);
    expect(article.summaryJa?.split('\n').every((line) => line.startsWith('・'))).toBe(true);
    expect(article.summaryJa?.split('\n').every((line) => !/[。．.]$/.test(line))).toBe(true);
    expect(article.summaryJa).not.toContain('はじめに');
    expect(article.summaryJa).not.toContain('...');
    expect(summarizationPrompt).toContain('文末に「...」「…」を付けない');
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
    expect(article.summaryJa?.split('\n')).toHaveLength(6);
    expect(article.summaryJa).not.toContain('Article URL');
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
    expect(result.sourceSummary.warnings?.[0]).toContain('1件');
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
    const client = createMockClient(JSON.stringify([candidate]));
    const agent = new EntrepreneurAgent(client);
    const progress: string[] = [];

    const result = await agent.generateIdeas((text) => progress.push(text));

    expect(fetchRssContext).toHaveBeenCalled();
    expect(client.sendStream).toHaveBeenCalledOnce();
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].sources.evidenceUrls).toEqual([
      { title: 'AI Ops article', url: 'https://example.com/ai-ops', type: 'rss' },
    ]);
    expect(result.sourceSummary.usedLLMFallback).toBe(false);
    expect(progress.length).toBeGreaterThan(0);
  });

  it('passes requested count into the generation prompt', async () => {
    const client = createMockClient(JSON.stringify([candidate]));
    const agent = new EntrepreneurAgent(client);

    await agent.generateIdeas(undefined, ['AI'], 3);

    const prompt = vi.mocked(client.send).mock.calls[0]?.[1] ?? '';
    expect(prompt).toContain('最大 3 件');
  });

  it('sets batchTime on candidates when provided', async () => {
    const client = createMockClient(JSON.stringify([candidate]));
    const agent = new EntrepreneurAgent(client);

    const result = await agent.generateIdeas(undefined, undefined, 15, '2026-05-16T08:00:00+09:00');

    expect(result.candidates[0].batchTime).toBe('2026-05-16T08:00:00+09:00');
    expect(result.batchTime).toBe('2026-05-16T08:00:00+09:00');
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
    const client = createMockClient(JSON.stringify([candidateWithoutEvidence]));
    const agent = new EntrepreneurAgent(client);
    const result = await agent.generateIdeas();
    const urls = result.candidates[0].sources.evidenceUrls ?? [];

    expect(urls.some((source) => source.url === 'https://example.com/relevant-ai-ops')).toBe(true);
    expect(urls.some((source) => source.url === 'https://example.com/unrelated-monitor')).toBe(false);
  });
});
