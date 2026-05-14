import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LLMClient } from '../src/services/llm-client';
import { IdeaGenerationAgent } from '../src/agents/idea-generation-agent';
import { FilterAgent } from '../src/agents/filter-agent';
import { EntrepreneurAgent } from '../src/agents/entrepreneur-agent';
import { fetchRssContext } from '../src/services/mcp-client';
import { fetchXContext } from '../src/services/x-client';
import type { IdeaCandidate } from '../src/types/idea-candidate';

vi.mock('../src/services/mcp-client', () => ({
  fetchRssContext: vi.fn(),
}));

vi.mock('../src/services/x-client', () => ({
  fetchXContext: vi.fn(),
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

    const result = await agent.execute({
      rssContext: { trendingKeywords: [{ word: 'AI', count: 2 }], relatedArticles: [] },
      xContext: { trendingTopics: [], demandSignals: [], competitorSentiments: [], fetchedAt: '2026-05-14T00:00:00.000Z' },
      focusKeywords: ['AI', 'SaaS'],
    });

    expect(result[0].title).toBe('AI Ops Memo');
    expect(client.send).toHaveBeenCalledOnce();
    expect(vi.mocked(client.send).mock.calls[0]?.[1]).toContain('AI, SaaS');
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

  it('sorts empty filter queries by trend score without calling the LLM', async () => {
    const lowScore = { ...candidate, id: 'idea-2', trendScore: 20 };
    const client = createMockClient('unused');
    const agent = new EntrepreneurAgent(client);

    const result = await agent.filterIdeas({ query: ' ', candidates: [lowScore, candidate] });

    expect(result.filteredCandidates.map((idea) => idea.id)).toEqual(['idea-1', 'idea-2']);
    expect(client.send).not.toHaveBeenCalled();
  });
});
