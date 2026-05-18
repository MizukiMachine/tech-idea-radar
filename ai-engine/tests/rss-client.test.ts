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

  it('keeps one article per source before filling the rest by score without a source penalty', async () => {
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
    expect(counts['Source 1']).toBe(12);
    for (let index = 2; index <= 6; index += 1) {
      expect(counts[`Source ${index}`]).toBeGreaterThanOrEqual(1);
    }
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
});
