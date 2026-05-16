import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LLMClient } from '../src/services/llm-client';
import { IdeaGenerationAgent } from '../src/agents/idea-generation-agent';
import { FilterAgent } from '../src/agents/filter-agent';
import { EntrepreneurAgent } from '../src/agents/entrepreneur-agent';
import { fetchRssContext } from '../src/services/mcp-client';
import type { IdeaCandidate } from '../src/types/idea-candidate';

vi.mock('../src/services/mcp-client', () => ({
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
  it('generates ideas with RSS enrichment and trusted evidence URLs', async () => {
    const client = createMockClient(JSON.stringify([candidate]));
    const agent = new EntrepreneurAgent(client);
    const progress: string[] = [];

    const result = await agent.generateIdeas((text) => progress.push(text));

    expect(fetchRssContext).toHaveBeenCalled();
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
