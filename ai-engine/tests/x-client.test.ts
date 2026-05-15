import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock environment variables
const originalEnv = process.env;

beforeEach(() => {
  vi.resetModules();
  process.env = { ...originalEnv };
  delete process.env.X_DATA_SOURCE;
  delete process.env.X_INCLUDE_USER_FIELDS;
  delete process.env.X_API_CACHE_FILE;
  delete process.env.X_API_CACHE_TTL_HOURS;
  delete process.env.X_SEARCH_FIXTURE_MODE;
  delete process.env.X_SEARCH_FIXTURE_FILE;
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
    // Demand search is capped at the minimum page size to reduce Post Read cost.
    expect(demandCall[1]).toBe(10);
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
        author: 'Unknown',
        authorHandle: 'unknown',
        likeCount: 10,
        retweetCount: 5,
        replyCount: 1,
        createdAt: '2025-01-01T00:00:00Z',
        url: 'https://x.com/i/status/cached-1',
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
          },
        ],
      });

    const client = new FreshClient('test-token');
    const result1 = await client.searchRecentTweets('test query', 10);
    const result2 = await client.searchRecentTweets('test query', 10);

    expect(result1).toEqual(mockResponse);
    expect(result2).toEqual(mockResponse);
    // request should only be called once (second call uses cache)
    expect(requestSpy).toHaveBeenCalledTimes(1);
    const params = requestSpy.mock.calls[0][1];
    expect(params).toMatchObject({
      max_results: '10',
      'tweet.fields': 'created_at,public_metrics',
    });
    expect(params).not.toHaveProperty('expansions');
    expect(params).not.toHaveProperty('user.fields');
  });

  it('can opt into author expansion when explicitly enabled', async () => {
    process.env.X_BEARER_TOKEN = 'test-token';
    process.env.X_INCLUDE_USER_FIELDS = 'true';
    const { XApiClient: FreshClient } = await import('../src/services/x-client');

    const requestSpy = vi.spyOn(FreshClient.prototype, 'request').mockResolvedValue({ data: [] });

    const client = new FreshClient('test-token');
    await client.searchRecentTweets('test query', 10);

    expect(requestSpy).toHaveBeenCalledTimes(1);
    expect(requestSpy.mock.calls[0][1]).toMatchObject({
      'tweet.fields': 'created_at,public_metrics,author_id',
      'user.fields': 'name,username',
      expansions: 'author_id',
    });
  });

  it('fetches usage snapshots and caches them briefly', async () => {
    process.env.X_BEARER_TOKEN = 'test-token';
    const { XApiClient: FreshClient, fetchXUsage } = await import('../src/services/x-client');

    const requestSpy = vi.spyOn(FreshClient.prototype, 'request').mockResolvedValue({
      data: [{ date: '2026-05-15', posts: 12 }],
    });

    const result1 = await fetchXUsage();
    const result2 = await fetchXUsage();

    expect(result1?.source).toBe('rest');
    expect(result2).toEqual(result1);
    expect(requestSpy).toHaveBeenCalledTimes(1);
    expect(requestSpy).toHaveBeenCalledWith('/usage/tweets');
  });

  it('skips usage lookup in search fixture replay mode', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'x-search-fixture-'));
    process.env.X_BEARER_TOKEN = 'test-token';
    process.env.X_SEARCH_FIXTURE_MODE = 'replay';
    process.env.X_SEARCH_FIXTURE_FILE = path.join(dir, 'fixture.json');

    const { XApiClient: FreshClient, fetchXUsage } = await import('../src/services/x-client');
    const requestSpy = vi.spyOn(FreshClient.prototype, 'request');

    const result = await fetchXUsage();

    expect(result).toBeNull();
    expect(requestSpy).not.toHaveBeenCalled();

    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('records and replays search fixtures without live credentials', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'x-search-fixture-'));
    const fixtureFile = path.join(dir, 'fixture.json');

    process.env.X_BEARER_TOKEN = 'test-token';
    process.env.X_SEARCH_FIXTURE_MODE = 'record';
    process.env.X_SEARCH_FIXTURE_FILE = fixtureFile;

    const { XApiClient: RecordClient } = await import('../src/services/x-client');
    const requestSpy = vi.spyOn(RecordClient.prototype, 'request')
      .mockResolvedValue({
        data: [
          {
            id: 'fixture-1',
            text: 'LINEのAIを永久的に消したい',
            created_at: '2026-05-15T00:00:00Z',
            public_metrics: { like_count: 12, retweet_count: 3, reply_count: 1 },
          },
        ],
      });

    const recorded = await new RecordClient('test-token').searchRecentTweets('fixture query', 10);
    expect(requestSpy).toHaveBeenCalledTimes(1);
    expect(fs.existsSync(fixtureFile)).toBe(true);

    vi.restoreAllMocks();
    vi.resetModules();
    process.env = { ...originalEnv };
    delete process.env.X_BEARER_TOKEN;
    process.env.X_SEARCH_FIXTURE_MODE = 'replay';
    process.env.X_SEARCH_FIXTURE_FILE = fixtureFile;

    const { XApiClient: ReplayClient } = await import('../src/services/x-client');
    const replaySpy = vi.spyOn(ReplayClient.prototype, 'request');
    const replayed = await new ReplayClient().searchRecentTweets('fixture query', 10);

    expect(replayed).toEqual(recorded);
    expect(replaySpy).not.toHaveBeenCalled();

    fs.rmSync(dir, { recursive: true, force: true });
  });
});
