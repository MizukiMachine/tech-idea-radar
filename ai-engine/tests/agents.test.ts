import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LLMClient } from '../src/services/llm-client';
import { IdeaGenerationAgent } from '../src/agents/idea-generation-agent';
import { FilterAgent } from '../src/agents/filter-agent';
import { EntrepreneurAgent } from '../src/agents/entrepreneur-agent';
import { fetchRssContext } from '../src/services/mcp-client';
import { fetchXContext, isXEnrichmentEnabled } from '../src/services/x-client';
import type { IdeaCandidate } from '../src/types/idea-candidate';

vi.mock('../src/services/mcp-client', () => ({
  fetchRssContext: vi.fn(),
}));

vi.mock('../src/services/x-client', () => ({
  fetchXContext: vi.fn(),
  isXEnrichmentEnabled: vi.fn(),
}));

const candidate: IdeaCandidate = {
  id: 'idea-1',
  title: 'AI Ops Memo',
  tagline: '障害対応メモを自動整理',
  description: 'SRE チーム向けに障害対応ログを分類し、再発防止策を提案する。',
  trendScore: 88,
  tags: ['AI', 'SaaS', 'dev-tools'],
  productType: 'B2B SaaS',
  targetUsers: '小規模な SRE チーム',
  coreProblem: '障害対応の知見が散らばる',
  revenuePotential: 'high',
  estimatedMvpTime: '2週間',
  differentiation: 'RSS 由来の運用トレンドを根拠に提案する',
  sources: {
    rssKeywords: ['AI', 'SRE'],
    demandSignals: 2,
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

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(isXEnrichmentEnabled).mockReturnValue(true);
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
  vi.mocked(fetchXContext).mockResolvedValue({
    trendingTopics: [],
    demandSignals: [],
    competitorSentiments: [],
    fetchedAt: '2026-05-14T00:00:00.000Z',
  });
});

describe('IdeaGenerationAgent', () => {
  it('builds a trend-aware prompt and parses idea candidates', async () => {
    const client = createMockClient(JSON.stringify([candidate]));
    const agent = new IdeaGenerationAgent(client);
    const xContext = {
      trendingTopics: [],
      demandSignals: [{
        tweet: {
          id: 'x1',
          text: 'SREの障害対応メモが散らばっていて、再発防止策を自動整理するAI Opsツールが欲しい',
          author: 'tester',
          authorHandle: 'tester',
          likeCount: 10,
          retweetCount: 2,
          replyCount: 1,
          createdAt: '2026-05-14T00:00:00.000Z',
          url: 'https://x.com/tester/status/x1',
        },
        needCategory: 'want' as const,
        matchedKeywords: ['欲しい'],
        relevanceScore: 70,
      }],
      competitorSentiments: [],
      fetchedAt: '2026-05-14T00:00:00.000Z',
    };

    const result = await agent.execute({
      rssContext: { trendingKeywords: [{ word: 'AI', count: 2 }], relatedArticles: [] },
      xContext,
      focusKeywords: ['AI', 'SaaS'],
    });

    expect(result[0].title).toBe('AI Ops Memo');
    expect(client.send).toHaveBeenCalledOnce();
    const prompt = vi.mocked(client.send).mock.calls[0]?.[1] ?? '';
    expect(prompt).toContain('AI, SaaS');
    expect(prompt).toContain('### X需要シード');
    expect(prompt).toContain('x-demand-1');
    expect(prompt).toContain('https://x.com/tester/status/x1');
    expect(prompt).toContain('SREの障害対応メモ');
    expect(vi.mocked(client.send).mock.calls[0]?.[0]).toContain('sourceSeedId');
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
  it('generates ideas with RSS/X enrichment and trusted evidence URLs', async () => {
    const client = createMockClient(JSON.stringify([candidate]));
    const agent = new EntrepreneurAgent(client);
    const progress: string[] = [];

    const result = await agent.generateIdeas((text) => progress.push(text));

    expect(fetchRssContext).toHaveBeenCalled();
    expect(fetchXContext).toHaveBeenCalled();
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].sources.evidenceUrls).toEqual([
      { title: 'AI Ops article', url: 'https://example.com/ai-ops', type: 'rss' },
    ]);
    expect(result.sourceSummary.usedLLMFallback).toBe(false);
    expect(progress.length).toBeGreaterThan(0);
  });

  it('generates ideas from RSS only when X enrichment is disabled', async () => {
    vi.mocked(isXEnrichmentEnabled).mockReturnValue(false);
    const client = createMockClient(JSON.stringify([candidate]));
    const agent = new EntrepreneurAgent(client);

    const result = await agent.generateIdeas();

    expect(fetchRssContext).toHaveBeenCalled();
    expect(fetchXContext).not.toHaveBeenCalled();
    expect(result.sourceSummary.xSignalCount).toBe(0);
    expect(result.candidates[0].sources.evidenceUrls).toEqual([
      { title: 'AI Ops article', url: 'https://example.com/ai-ops', type: 'rss' },
    ]);
  });

  it('sorts empty filter queries by trend score without calling the LLM', async () => {
    const lowScore = { ...candidate, id: 'idea-2', trendScore: 20 };
    const client = createMockClient('unused');
    const agent = new EntrepreneurAgent(client);

    const result = await agent.filterIdeas({ query: ' ', candidates: [lowScore, candidate] });

    expect(result.filteredCandidates.map((idea) => idea.id)).toEqual(['idea-1', 'idea-2']);
    expect(client.send).not.toHaveBeenCalled();
  });

  it('includes trusted X URLs only when the post matches the candidate', async () => {
    vi.mocked(fetchRssContext).mockResolvedValueOnce({
      trendingKeywords: [],
      relatedArticles: [],
    });
    vi.mocked(fetchXContext).mockResolvedValueOnce({
      trendingTopics: [],
      demandSignals: [{
        tweet: {
          id: 'x1',
          text: 'SREの障害対応メモが散らばっていて、再発防止策を自動整理するAI Opsツールが欲しい',
          author: 'tester',
          authorHandle: 'tester',
          likeCount: 10,
          retweetCount: 2,
          replyCount: 1,
          createdAt: '2026-05-14T00:00:00.000Z',
          url: 'https://x.com/tester/status/x1',
        },
        needCategory: 'want',
        matchedKeywords: ['欲しい'],
        relevanceScore: 70,
      }],
      competitorSentiments: [],
      fetchedAt: '2026-05-14T00:00:00.000Z',
    });

    const xSeedCandidate: IdeaCandidate = {
      ...candidate,
      coreProblem: 'SREの障害対応メモが散らばっていて、再発防止策を自動整理できない',
      description: 'SRE チームの障害対応ログを集約し、再発防止策を自動抽出する。',
      sources: {
        rssKeywords: [],
        demandSignals: 1,
        sourceSeedId: 'x-demand-1',
        evidenceUrls: [],
      },
    };
    const client = createMockClient(JSON.stringify([xSeedCandidate]));
    const agent = new EntrepreneurAgent(client);
    const result = await agent.generateIdeas();
    const urls = result.candidates[0].sources.evidenceUrls ?? [];

    expect(urls).toEqual([
      {
        title: 'SREの障害対応メモが散らばっていて、再発防止策を自動整理するAI Opsツールが欲しい',
        url: 'https://x.com/tester/status/x1',
        type: 'x',
      },
    ]);
  });

  it('does not attach unrelated high-engagement X posts as evidence', async () => {
    vi.mocked(fetchXContext).mockResolvedValueOnce({
      trendingTopics: [{
        topic: '参考画像と指示文こだわったらサムネイルが作れる。AI感を消すのが今後のセンターピン。',
        tweetVolume: 5000,
        url: 'https://x.com/i/status/unrelated-1',
        relatedHashtags: [],
      }],
      demandSignals: [{
        tweet: {
          id: 'x2',
          text: 'モニター欲しいけど、何を基準に選べばいいのか分からない。コスパ良いモデルを教えてほしい',
          author: 'tester',
          authorHandle: 'tester',
          likeCount: 3000,
          retweetCount: 900,
          replyCount: 100,
          createdAt: '2026-05-14T00:00:00.000Z',
          url: 'https://x.com/tester/status/unrelated-2',
        },
        needCategory: 'want',
        matchedKeywords: ['欲しい'],
        relevanceScore: 100,
      }],
      competitorSentiments: [],
      fetchedAt: '2026-05-14T00:00:00.000Z',
    });

    const misdeclaredCandidate: IdeaCandidate = {
      ...candidate,
      sources: {
        rssKeywords: [],
        demandSignals: 1,
        sourceSeedId: 'x-demand-1',
        evidenceUrls: [],
      },
    };
    const client = createMockClient(JSON.stringify([misdeclaredCandidate]));
    const agent = new EntrepreneurAgent(client);
    const result = await agent.generateIdeas();
    const urls = result.candidates[0].sources.evidenceUrls ?? [];

    expect(urls).toEqual([]);
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

    const candidateWithoutEvidence = {
      ...candidate,
      sources: {
        rssKeywords: [],
        demandSignals: 0,
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
