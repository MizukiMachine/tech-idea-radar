import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const originalEnv = process.env;

beforeEach(() => {
  vi.resetModules();
  process.env = { ...originalEnv };
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  process.env = originalEnv;
});

describe('fetchRssContext', () => {
  it('uses public RSS fallback when MCP_RSS_SCOUT_PATH is not set', async () => {
    delete process.env.MCP_RSS_SCOUT_PATH;

    const feedXml = `<?xml version="1.0"?>
      <rss version="2.0">
        <channel>
          <title>Test Feed</title>
          <item>
            <title>AI developer productivity tools are growing</title>
            <link>https://example.com/ai-tools</link>
            <pubDate>Wed, 13 May 2026 12:00:00 GMT</pubDate>
            <description>Developers want automation for review workflows and SaaS operations.</description>
          </item>
          <item>
            <title>SaaS automation for small teams</title>
            <link>https://example.com/saas-automation</link>
            <pubDate>Wed, 13 May 2026 10:00:00 GMT</pubDate>
            <description>Small teams are adopting AI agents for repetitive back-office work.</description>
          </item>
        </channel>
      </rss>`;

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      statusText: 'OK',
      text: async () => feedXml,
    }));

    const { fetchRssContext } = await import('../src/services/mcp-client');
    const result = await fetchRssContext(['AI', 'SaaS', 'developer']);

    expect(result.relatedArticles.length).toBeGreaterThan(0);
    expect(result.relatedArticles[0]).toMatchObject({
      title: expect.any(String),
      link: expect.stringContaining('https://example.com/'),
      url: expect.stringContaining('https://example.com/'),
      source: expect.any(String),
      publishedAt: expect.any(String),
    });
    expect(result.relatedArticles[0].keywords?.length).toBeGreaterThan(0);
    expect(result.trendingKeywords.length).toBeGreaterThan(0);
  });

  it('parses Atom feeds from the public fallback', async () => {
    delete process.env.MCP_RSS_SCOUT_PATH;

    const atomXml = `<?xml version="1.0"?>
      <feed xmlns="http://www.w3.org/2005/Atom">
        <entry>
          <title>LLM workflow automation</title>
          <link href="https://example.com/llm-workflow" rel="alternate" />
          <updated>2026-05-13T09:00:00Z</updated>
          <summary>AI agents help developer teams reduce manual work.</summary>
        </entry>
      </feed>`;

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      statusText: 'OK',
      text: async () => atomXml,
    }));

    const { fetchRssContext } = await import('../src/services/mcp-client');
    const result = await fetchRssContext(['AI', 'developer']);

    expect(result.relatedArticles.some((article) => article.url === 'https://example.com/llm-workflow')).toBe(true);
  });
});
