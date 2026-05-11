import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock environment variables
const originalEnv = process.env;

beforeEach(() => {
  vi.resetModules();
  process.env = { ...originalEnv };
});

afterEach(() => {
  vi.restoreAllMocks();
  process.env = originalEnv;
});

describe('fetchXContext', () => {
  it('returns empty arrays when X_BEARER_TOKEN is not set', async () => {
    delete process.env.X_BEARER_TOKEN;
    // Re-import to pick up env change
    const { fetchXContext: fetchFresh } = await import('../src/services/x-client');
    const result = await fetchFresh(['AI']);
    expect(result.trendingTopics).toEqual([]);
    expect(result.demandSignals).toEqual([]);
    expect(result.competitorSentiments).toEqual([]);
    expect(result.fetchedAt).toBeTruthy();
  });

  it('returns empty arrays on API failure (graceful degradation)', async () => {
    process.env.X_BEARER_TOKEN = 'test-token';
    const { XApiClient: FreshClient, fetchXContext: fetchFresh } = await import('../src/services/x-client');

    // Mock searchRecentTweets to throw
    vi.spyOn(FreshClient.prototype, 'searchRecentTweets').mockRejectedValue(new Error('API error'));

    const result = await fetchFresh(['TypeScript']);
    expect(result.trendingTopics).toEqual([]);
    expect(result.demandSignals).toEqual([]);
    expect(result.competitorSentiments).toEqual([]);
  });

  it('maps API responses to XContext correctly', async () => {
    process.env.X_BEARER_TOKEN = 'test-token';
    const { XApiClient: FreshClient, fetchXContext: fetchFresh } = await import('../src/services/x-client');

    const mockTrendingTweets = [
      {
        id: '1',
        text: 'AI開発がトレンド #AI #SaaS',
        author: 'TestUser',
        authorHandle: 'testuser',
        likeCount: 500,
        retweetCount: 100,
        replyCount: 50,
        createdAt: '2025-01-01T00:00:00Z',
        url: 'https://x.com/testuser/status/1',
      },
    ];

    const mockDemandTweets = [
      {
        id: '2',
        text: 'AIツールが欲しい。不便すぎる',
        author: 'DevUser',
        authorHandle: 'devuser',
        likeCount: 200,
        retweetCount: 30,
        replyCount: 10,
        createdAt: '2025-01-01T01:00:00Z',
        url: 'https://x.com/devuser/status/2',
      },
    ];

    const mockCompetitorTweets = [
      {
        id: '3',
        text: 'CompetitorXが最高すぎる。素晴らしいサービス',
        author: 'FanUser',
        authorHandle: 'fanuser',
        likeCount: 100,
        retweetCount: 20,
        replyCount: 5,
        createdAt: '2025-01-01T02:00:00Z',
        url: 'https://x.com/fanuser/status/3',
      },
    ];

    vi.spyOn(FreshClient.prototype, 'searchRecentTweets')
      .mockResolvedValueOnce(mockTrendingTweets) // trending
      .mockResolvedValueOnce(mockDemandTweets)   // demand
      .mockResolvedValueOnce(mockCompetitorTweets); // competitor

    const result = await fetchFresh(['TypeScript'], ['CompetitorX']);

    expect(result.trendingTopics.length).toBeGreaterThan(0);
    expect(result.trendingTopics[0].relatedHashtags).toContain('#AI');

    expect(result.demandSignals.length).toBeGreaterThan(0);
    expect(result.demandSignals[0].needCategory).toBeDefined();
    expect(result.demandSignals[0].matchedKeywords.length).toBeGreaterThan(0);
    expect(result.demandSignals[0].relevanceScore).toBeGreaterThan(0);

    expect(result.competitorSentiments.length).toBeGreaterThan(0);
    expect(result.competitorSentiments[0].competitorName).toBe('CompetitorX');
    expect(result.competitorSentiments[0].sentimentSummary).toBeTruthy();
  });

  it('includes both Japanese and English demand keywords in queries', async () => {
    process.env.X_BEARER_TOKEN = 'test-token';
    const { XApiClient: FreshClient, fetchXContext: fetchFresh } = await import('../src/services/x-client');

    const spy = vi.spyOn(FreshClient.prototype, 'searchRecentTweets')
      .mockResolvedValue([]);

    await fetchFresh(['SaaS']);

    // Second call should be the demand signal query
    const demandCall = spy.mock.calls[1];
    expect(demandCall).toBeDefined();
    const demandQuery = demandCall[0];
    // Should contain Japanese keywords
    expect(demandQuery).toContain('欲しい');
    // Should contain English keywords
    expect(demandQuery).toContain('wish there was');
  });

  it('limits competitor lookups to the first five names', async () => {
    process.env.X_BEARER_TOKEN = 'test-token';
    const { XApiClient: FreshClient, fetchXContext: fetchFresh } = await import('../src/services/x-client');

    const spy = vi.spyOn(FreshClient.prototype, 'searchRecentTweets').mockResolvedValue([]);

    await fetchFresh(['SaaS'], ['CompA', 'CompB', 'CompC', 'CompD', 'CompE', 'CompF']);

    expect(spy).toHaveBeenCalledTimes(7);
    expect(spy.mock.calls.slice(2).map(([query]) => query)).toEqual([
      '"CompA"',
      '"CompB"',
      '"CompC"',
      '"CompD"',
      '"CompE"',
    ]);
  });
});

describe('XApiClient', () => {
  it('caches search results and returns cached data on second call', async () => {
    process.env.X_BEARER_TOKEN = 'test-token';
    const { XApiClient: FreshClient } = await import('../src/services/x-client');

    const mockResponse = [
      {
        id: 'cached-1',
        text: 'Cached tweet',
        author: 'CacheUser',
        authorHandle: 'cacheuser',
        likeCount: 10,
        retweetCount: 5,
        replyCount: 1,
        createdAt: '2025-01-01T00:00:00Z',
        url: 'https://x.com/cacheuser/status/cached-1',
      },
    ];

    const requestSpy = vi.spyOn(FreshClient.prototype, 'request')
      .mockResolvedValue({
        data: [
          {
            id: 'cached-1',
            text: 'Cached tweet',
            created_at: '2025-01-01T00:00:00Z',
            public_metrics: { like_count: 10, retweet_count: 5, reply_count: 1 },
            author_id: 'u1',
          },
        ],
        includes: { users: [{ id: 'u1', name: 'CacheUser', username: 'cacheuser' }] },
      });

    const client = new FreshClient('test-token');
    const result1 = await client.searchRecentTweets('test query', 10);
    const result2 = await client.searchRecentTweets('test query', 10);

    expect(result1).toEqual(mockResponse);
    expect(result2).toEqual(mockResponse);
    // request should only be called once (second call uses cache)
    expect(requestSpy).toHaveBeenCalledTimes(1);
  });
});

describe('buildUserPrompt with xContext', () => {
  it('includes X (Twitter) section when xContext is provided', async () => {
    const { MarketResearchAgent } = await import('../src/agents/market-research-agent');
    const { LLMClient } = await import('../src/services/llm-client');

    vi.mock('../src/services/llm-client');
    const client = new LLMClient('test-key');
    vi.spyOn(client, 'send').mockResolvedValue('{}');

    const agent = new MarketResearchAgent(client);
    const prompt = agent.buildUserPrompt({
      selfAnalysisHandoff: {
        swot: { strengths: ['Tech'], weaknesses: [], opportunities: [], threats: [] },
        recommendedAreas: ['AI'],
        areasToAvoid: [],
        uniqueStrengths: [],
      },
      targetMarkets: [{ name: 'Japan', description: 'JP market', priority: 1 }],
      initialCompetitors: ['CompA'],
      xContext: {
        trendingTopics: [{ topic: 'AI trend', tweetVolume: 100, url: 'https://x.com', relatedHashtags: ['#AI'] }],
        demandSignals: [{
          tweet: {
            id: '1', text: 'AIツールが欲しい', author: 'User', authorHandle: 'user',
            likeCount: 50, retweetCount: 10, replyCount: 5,
            createdAt: '2025-01-01T00:00:00Z', url: 'https://x.com/user/status/1',
          },
          needCategory: 'want',
          matchedKeywords: ['欲しい'],
          relevanceScore: 75,
        }],
        competitorSentiments: [],
        fetchedAt: '2025-01-01T00:00:00Z',
      },
    });

    expect(prompt).toContain('X (Twitter)');
    expect(prompt).toContain('AI trend');
    expect(prompt).toContain('欲しい');
  });

  it('includes fallback message when xContext is empty', async () => {
    const { MarketResearchAgent } = await import('../src/agents/market-research-agent');
    const { LLMClient } = await import('../src/services/llm-client');

    const client = new LLMClient('test-key');
    vi.spyOn(client, 'send').mockResolvedValue('{}');

    const agent = new MarketResearchAgent(client);
    const prompt = agent.buildUserPrompt({
      selfAnalysisHandoff: {
        swot: { strengths: ['Tech'], weaknesses: [], opportunities: [], threats: [] },
        recommendedAreas: ['AI'],
        areasToAvoid: [],
        uniqueStrengths: [],
      },
      targetMarkets: [{ name: 'Japan', description: 'JP market', priority: 1 }],
      initialCompetitors: ['CompA'],
    });

    expect(prompt).toContain('X (Twitter)');
    expect(prompt).toContain('LLMの知識に基づいて');
  });

  it('includes fallback message when xContext exists but has no usable data', async () => {
    const { MarketResearchAgent } = await import('../src/agents/market-research-agent');
    const { LLMClient } = await import('../src/services/llm-client');

    const client = new LLMClient('test-key');
    vi.spyOn(client, 'send').mockResolvedValue('{}');

    const agent = new MarketResearchAgent(client);
    const prompt = agent.buildUserPrompt({
      selfAnalysisHandoff: {
        swot: { strengths: ['Tech'], weaknesses: [], opportunities: [], threats: [] },
        recommendedAreas: ['AI'],
        areasToAvoid: [],
        uniqueStrengths: [],
      },
      targetMarkets: [{ name: 'Japan', description: 'JP market', priority: 1 }],
      initialCompetitors: ['CompA'],
      xContext: {
        trendingTopics: [],
        demandSignals: [],
        competitorSentiments: [],
        fetchedAt: '2025-01-01T00:00:00Z',
      },
    });

    expect(prompt).toContain('X (Twitter)');
    expect(prompt).toContain('LLMの知識に基づいて');
  });
});
