import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const originalEnv = process.env;

beforeEach(() => {
  vi.resetModules();
  process.env = { ...originalEnv };
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  process.env = originalEnv;
});

describe('fetchRssContext', () => {
  it('fetches direct RSS feeds and extracts keywords', async () => {
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

    const { fetchRssContext } = await import('../src/services/rss-client');
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

  it('decodes numeric and named HTML entities in RSS titles', async () => {
    process.env.RSS_FEEDS = JSON.stringify([
      { name: 'Entity Feed', url: 'https://example.com/entity.xml' },
    ]);
    process.env.RSS_FETCH_ARTICLE_EXCERPTS = 'false';
    const feedXml = `<?xml version="1.0"?>
      <rss version="2.0">
        <channel>
          <title>Entity Feed</title>
          <item>
            <title>The AX stack: what&#8217;s fixed &amp; where you can win</title>
            <link>https://example.com/ax-stack</link>
            <pubDate>Sun, 24 May 2026 12:00:00 GMT</pubDate>
            <description>AI developer platform workflows are changing.</description>
          </item>
        </channel>
      </rss>`;

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      statusText: 'OK',
      text: async () => feedXml,
    }));

    const { fetchRssContext } = await import('../src/services/rss-client');
    const result = await fetchRssContext(['AI', 'developer']);

    expect(result.relatedArticles[0].title).toBe("The AX stack: what’s fixed & where you can win");
  });

  it('keeps escaped angle-bracket text while cleaning RSS title markup', async () => {
    process.env.RSS_FEEDS = JSON.stringify([
      { name: 'Generic Feed', url: 'https://example.com/generic.xml' },
    ]);
    process.env.RSS_FETCH_ARTICLE_EXCERPTS = 'false';
    const feedXml = `<?xml version="1.0"?>
      <rss version="2.0">
        <channel>
          <title>Generic Feed</title>
          <item>
            <title>Using Promise&lt;Result&gt; &lt;b&gt;safely&lt;/b&gt; &amp; fast</title>
            <link>https://example.com/promise-result</link>
            <pubDate>Sun, 24 May 2026 12:00:00 GMT</pubDate>
            <description>AI developer platform workflows are changing.</description>
          </item>
        </channel>
      </rss>`;

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      statusText: 'OK',
      text: async () => feedXml,
    }));

    const { fetchRssContext } = await import('../src/services/rss-client');
    const result = await fetchRssContext(['Promise', 'developer']);

    expect(result.relatedArticles[0].title).toBe('Using Promise<Result> safely & fast');
  });

  it('filters Japanese sentence endings from extracted RSS keywords', async () => {
    process.env.RSS_FEEDS = JSON.stringify([
      { name: 'Japanese Feed', url: 'https://example.com/japanese.xml' },
    ]);
    process.env.RSS_FETCH_ARTICLE_EXCERPTS = 'false';
    const feedXml = `<?xml version="1.0"?>
      <rss version="2.0">
        <channel>
          <title>Japanese Feed</title>
          <item>
            <title>生成AIです 開発基盤の更新</title>
            <link>https://example.com/ai-platform</link>
            <pubDate>Sun, 24 May 2026 12:00:00 GMT</pubDate>
            <description>開発チーム向けの自動化です。AIプロダクトの運用基盤を改善します。</description>
          </item>
        </channel>
      </rss>`;

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      statusText: 'OK',
      text: async () => feedXml,
    }));

    const { fetchRssContext } = await import('../src/services/rss-client');
    const result = await fetchRssContext(['AI', 'です']);
    const articleKeywords = result.relatedArticles.flatMap((article) => article.keywords ?? []);
    const trendingKeywords = result.trendingKeywords.map((keyword) => keyword.word);

    expect(articleKeywords).toContain('AI');
    expect(articleKeywords).not.toContain('です');
    expect(trendingKeywords).not.toContain('です');
  });

  it('parses Atom feeds from direct RSS sources', async () => {
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

    const { fetchRssContext } = await import('../src/services/rss-client');
    const result = await fetchRssContext(['AI', 'developer']);

    expect(result.relatedArticles.some((article) => article.url === 'https://example.com/llm-workflow')).toBe(true);
  });

  it('parses nested RSS and Atom text nodes used by major feeds', async () => {
    process.env.RSS_FEEDS = JSON.stringify([
      { name: 'Nested RSS', url: 'https://example.com/nested-rss.xml' },
      { name: 'Nested Atom', url: 'https://example.com/nested-atom.xml' },
    ]);

    const nestedRssXml = `<?xml version="1.0"?>
      <rss version="2.0">
        <channel>
          <item>
            <title><span>AI developer platform expands</span></title>
            <link>https://example.com/nested-rss</link>
            <pubDate>Wed, 13 May 2026 12:00:00 GMT</pubDate>
            <description><p>Developer teams are adopting AI workflow automation.</p></description>
          </item>
        </channel>
      </rss>`;

    const nestedAtomXml = `<?xml version="1.0"?>
      <feed xmlns="http://www.w3.org/2005/Atom">
        <entry>
          <title type="html"><span>AI tooling reaches product teams</span></title>
          <link href="https://example.com/nested-atom" rel="alternate" />
          <updated>2026-05-13T09:00:00Z</updated>
          <summary type="html"><p>SaaS builders are using AI agents in planning workflows.</p></summary>
        </entry>
      </feed>`;

    vi.stubGlobal('fetch', vi.fn(async (input: unknown) => {
      const url = String(input);
      return {
        ok: true,
        statusText: 'OK',
        text: async () => (url.includes('nested-atom') ? nestedAtomXml : nestedRssXml),
      };
    }));

    const { fetchRssContext } = await import('../src/services/rss-client');
    const result = await fetchRssContext(['AI', 'developer']);

    expect(result.relatedArticles).toEqual(expect.arrayContaining([
      expect.objectContaining({ source: 'Nested RSS', title: 'AI developer platform expands' }),
      expect.objectContaining({ source: 'Nested Atom', title: 'AI tooling reaches product teams' }),
    ]));
  });

  it('uses eight built-in overseas technology feeds by default', async () => {
    delete process.env.RSS_FEEDS;
    process.env.RSS_FETCH_ARTICLE_EXCERPTS = 'false';

    const fetchMock = vi.fn(async (input: unknown) => {
      const sourceKey = String(input).replace(/^https?:\/\//, '').replace(/[^a-z0-9]+/gi, '-');
      const items = Array.from({ length: 3 }, (_, index) => `
        <item>
          <title>AI developer platform signal ${sourceKey} ${index + 1}</title>
          <link>${String(input).replace(/\/$/, '')}/article-${index + 1}</link>
          <pubDate>Sun, 17 May 2026 1${index}:00:00 GMT</pubDate>
          <description>AI developer workflow automation and product platform updates for engineering teams.</description>
        </item>
      `).join('');

      return {
        ok: true,
        statusText: 'OK',
        text: async () => `<?xml version="1.0"?><rss version="2.0"><channel>${items}</channel></rss>`,
      };
    });
    vi.stubGlobal('fetch', fetchMock);

    const { fetchRssContext } = await import('../src/services/rss-client');
    const result = await fetchRssContext(['AI', 'developer']);
    const sources = new Set(result.relatedArticles.map((article) => article.source));

    expect(fetchMock.mock.calls.length).toBe(8);
    expect(result.relatedArticles).toHaveLength(18);
    expect(sources.size).toBe(8);
    expect([...sources]).toEqual(expect.arrayContaining([
      'Hacker News',
      'GitHub Blog',
      'Stack Overflow Blog',
      'Product Hunt',
    ]));
    expect([...sources]).not.toEqual(expect.arrayContaining([
      'DEV Community',
      'The Verge',
      'Ars Technica',
      'Lobsters',
      'MIT Technology Review',
      'Zenn',
      'Qiita Popular',
    ]));
  });

  it('keeps one article per source before filling by source-balanced score rounds', async () => {
    process.env.RSS_MAX_RELATED_ARTICLES = '18';
    process.env.RSS_FEEDS = JSON.stringify(
      Array.from({ length: 6 }, (_, index) => ({
        name: `Source ${index + 1}`,
        url: `https://example.com/source-${index + 1}.xml`,
      })),
    );

    vi.stubGlobal('fetch', vi.fn(async (input: unknown) => {
      const sourceMatch = String(input).match(/source-(\d+)/);
      const sourceNumber = sourceMatch?.[1] ?? '0';
      const highSignal = sourceNumber === '1';
      const itemCount = highSignal ? 12 : 3;
      const items = Array.from({ length: itemCount }, (_, index) => `
        <item>
          <title>${highSignal ? 'AI SaaS developer automation platform' : 'Engineering update'} ${sourceNumber}-${index + 1}</title>
          <link>https://example.com/${sourceNumber}/${index + 1}</link>
          <pubDate>${highSignal ? 'Sun, 17 May 2026' : 'Wed, 13 May 2026'} 1${index}:00:00 GMT</pubDate>
          <description>${highSignal ? 'AI SaaS developer workflow automation productivity.' : 'General software release notes and architecture update.'}</description>
        </item>
      `).join('');

      return {
        ok: true,
        statusText: 'OK',
        text: async () => `<?xml version="1.0"?><rss version="2.0"><channel>${items}</channel></rss>`,
      };
    }));

    const { fetchRssContext } = await import('../src/services/rss-client');
    const result = await fetchRssContext(['AI', 'SaaS', 'developer']);
    const counts = result.relatedArticles.reduce<Record<string, number>>((acc, article) => {
      acc[article.source] = (acc[article.source] ?? 0) + 1;
      return acc;
    }, {});

    expect(result.relatedArticles).toHaveLength(18);
    expect(Object.keys(counts)).toHaveLength(6);
    expect(counts['Source 1']).toBe(3);
    for (let index = 2; index <= 6; index += 1) {
      expect(counts[`Source ${index}`]).toBe(3);
    }
  });

  it('keeps the RSS candidate pool at least as large as the display article count', async () => {
    process.env.RSS_MAX_RELATED_ARTICLES = '8';
    process.env.RSS_RELATED_ARTICLE_CANDIDATE_COUNT = '5';
    process.env.RSS_FETCH_ARTICLE_EXCERPTS = 'false';
    process.env.RSS_FEEDS = JSON.stringify(
      Array.from({ length: 4 }, (_, index) => ({
        name: `Source ${index + 1}`,
        url: `https://example.com/min-${index + 1}.xml`,
      })),
    );

    vi.stubGlobal('fetch', vi.fn(async (input: unknown) => {
      const sourceMatch = String(input).match(/min-(\d+)/);
      const sourceNumber = sourceMatch?.[1] ?? '0';
      const items = Array.from({ length: 3 }, (_, index) => `
        <item>
          <title>AI developer workflow candidate ${sourceNumber}-${index + 1}</title>
          <link>https://example.com/min/${sourceNumber}/${index + 1}</link>
          <pubDate>Sun, 17 May 2026 1${index}:00:00 GMT</pubDate>
          <description>AI developer workflow automation productivity for engineering teams.</description>
        </item>
      `).join('');

      return {
        ok: true,
        statusText: 'OK',
        text: async () => `<?xml version="1.0"?><rss version="2.0"><channel>${items}</channel></rss>`,
      };
    }));

    const { fetchRssContext } = await import('../src/services/rss-client');
    const result = await fetchRssContext(['AI', 'developer']);

    expect(result.relatedArticles).toHaveLength(8);
  });

  it('strips Hacker News metadata and enriches weak summaries from the article page', async () => {
    process.env.RSS_FEEDS = JSON.stringify([
      { name: 'Hacker News', url: 'https://example.com/hn.xml' },
    ]);

    const feedXml = `<?xml version="1.0"?>
      <rss version="2.0">
        <channel>
          <item>
            <title>ThinkPad history from IBM to Lenovo</title>
            <link>https://news.ycombinator.com/item?id=48173547</link>
            <pubDate>Sun, 17 May 2026 12:00:00 GMT</pubDate>
            <description>
              Article URL: https://www.jdhodges.com/blog/thinkpad-history/
              Comments URL: https://news.ycombinator.com/item?id=48173547
              Points: 54
              # Comments: 26
            </description>
          </item>
        </channel>
      </rss>`;

    const articleHtml = `
      <html>
        <head><meta name="description" content="A detailed history of ThinkPad hardware and business ownership changes." /></head>
        <body>
          <article>
            <p>ThinkPad began as an IBM laptop line, became known for durable keyboards and business-focused hardware, and later moved under Lenovo after the acquisition.</p>
            <p>The article traces design changes, workstation models, and the way modern AI-era machines still inherit earlier enterprise priorities.</p>
          </article>
        </body>
      </html>`;

    vi.stubGlobal('fetch', vi.fn(async (input: unknown) => {
      const url = String(input);
      if (url === 'https://example.com/hn.xml') {
        return {
          ok: true,
          statusText: 'OK',
          text: async () => feedXml,
        };
      }
      return {
        ok: true,
        statusText: 'OK',
        headers: new Headers({ 'content-type': 'text/html' }),
        text: async () => articleHtml,
      };
    }));

    const { fetchRssContext } = await import('../src/services/rss-client');
    const result = await fetchRssContext(['ThinkPad']);
    const article = result.relatedArticles[0];

    expect(article.url).toBe('https://www.jdhodges.com/blog/thinkpad-history/');
    expect(article.summary).toContain('ThinkPad began as an IBM laptop line');
    expect(article.summary).not.toContain('Article URL');
    expect(article.summary).not.toContain('Comments URL');
    expect(article.summary).not.toContain('Points');
  });

  it('caches successful feed fetches within the configured TTL', async () => {
    process.env.RSS_FEEDS = JSON.stringify([
      { name: 'Cached Feed', url: 'https://example.com/cached.xml' },
    ]);
    process.env.RSS_FETCH_ARTICLE_EXCERPTS = 'false';
    process.env.RSS_FEED_CACHE_TTL_MS = '300000';

    const fetchMock = vi.fn(async () => ({
      ok: true,
      statusText: 'OK',
      text: async () => `<?xml version="1.0"?>
        <rss version="2.0">
          <channel>
            <item>
              <title>AI developer workflow cache signal</title>
              <link>https://example.com/cached-article</link>
              <pubDate>Sun, 17 May 2026 12:00:00 GMT</pubDate>
              <description>AI workflow automation for engineering teams.</description>
            </item>
          </channel>
        </rss>`,
    }));
    vi.stubGlobal('fetch', fetchMock);

    const { fetchRssContext } = await import('../src/services/rss-client');
    await fetchRssContext(['AI']);
    await fetchRssContext(['AI']);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('limits concurrent RSS source fetches', async () => {
    process.env.RSS_FEEDS = JSON.stringify(
      Array.from({ length: 5 }, (_, index) => ({
        name: `Concurrent ${index + 1}`,
        url: `https://example.com/concurrent-${index + 1}.xml`,
      })),
    );
    process.env.RSS_FETCH_ARTICLE_EXCERPTS = 'false';
    process.env.RSS_FEED_CACHE_TTL_MS = '0';
    process.env.RSS_FETCH_CONCURRENCY = '2';

    let active = 0;
    let maxActive = 0;
    vi.stubGlobal('fetch', vi.fn(async (input: unknown) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await Promise.resolve();
      active -= 1;
      const source = String(input).match(/concurrent-(\d+)/)?.[1] ?? '0';
      return {
        ok: true,
        statusText: 'OK',
        text: async () => `<?xml version="1.0"?>
          <rss version="2.0">
            <channel>
              <item>
                <title>AI developer workflow source ${source}</title>
                <link>https://example.com/concurrent/${source}</link>
                <pubDate>Sun, 17 May 2026 12:00:00 GMT</pubDate>
                <description>AI workflow automation for source ${source}.</description>
              </item>
            </channel>
          </rss>`,
      };
    }));

    const { fetchRssContext } = await import('../src/services/rss-client');
    await fetchRssContext(['AI']);

    expect(maxActive).toBeLessThanOrEqual(2);
  });

  it('adds observation-backed topic clusters and article topic metadata', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-20T00:00:00Z'));
    process.env.RSS_FEEDS = JSON.stringify([
      { name: 'Source A', url: 'https://example.com/source-a.xml' },
      { name: 'Source B', url: 'https://example.com/source-b.xml' },
    ]);
    process.env.RSS_FETCH_ARTICLE_EXCERPTS = 'false';
    process.env.RSS_FEED_CACHE_TTL_MS = '0';
    process.env.RSS_TOPIC_WINDOW_HOURS = '24';

    const firstScanXml = `<?xml version="1.0"?>
      <rss version="2.0">
        <channel>
          <item>
            <title>AI developer workflow automation</title>
            <link>https://example.com/previous</link>
            <pubDate>Wed, 20 May 2026 00:00:00 GMT</pubDate>
            <description>AI developer workflow automation is appearing in teams.</description>
          </item>
        </channel>
      </rss>`;

    const secondScan = (source: string) => `<?xml version="1.0"?>
      <rss version="2.0">
        <channel>
          <item>
            <title>AI developer workflow automation</title>
            <link>https://example.com/current-${source}</link>
            <pubDate>Thu, 21 May 2026 01:00:00 GMT</pubDate>
            <description>AI developer workflow automation is spreading across product teams.</description>
          </item>
        </channel>
      </rss>`;

    const fetchMock = vi.fn(async (input: unknown) => ({
      ok: true,
      statusText: 'OK',
      text: async () => (String(input).includes('source-a') ? firstScanXml : firstScanXml),
    }));
    vi.stubGlobal('fetch', fetchMock);

    const { fetchRssContext } = await import('../src/services/rss-client');
    await fetchRssContext(['AI']);

    vi.setSystemTime(new Date('2026-05-21T01:00:00Z'));
    fetchMock.mockImplementation(async (input: unknown) => ({
      ok: true,
      statusText: 'OK',
      text: async () => (String(input).includes('source-a') ? secondScan('a') : secondScan('b')),
    }));

    const result = await fetchRssContext(['AI']);

    expect(result.topicClusters?.length).toBeGreaterThan(0);
    expect(result.topicClusters?.[0]).toMatchObject({
      status: 'new',
      sourceCount: 2,
    });
    expect(result.relatedArticles[0]).toMatchObject({
      topicKey: expect.any(String),
      topicStatus: 'new',
      firstSeenAt: expect.any(String),
      lastSeenAt: expect.any(String),
    });
  });
});
