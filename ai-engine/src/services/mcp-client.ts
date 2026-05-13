import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { XMLParser } from 'fast-xml-parser';

export interface McpToolResult {
  content: { type: string; text: string }[];
}

export class McpClient {
  private client: Client | null = null;
  private transport: StdioClientTransport | null = null;

  async connect(command: string, args: string[] = [], timeoutMs = 10000): Promise<void> {
    this.transport = new StdioClientTransport({ command, args });
    this.client = new Client({ name: 'builder-agent-chain', version: '1.0.0' });

    let timer: ReturnType<typeof setTimeout> | undefined;
    const connectPromise = this.client.connect(this.transport);
    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('MCP connection timeout')), timeoutMs);
    });

    try {
      await Promise.race([connectPromise, timeoutPromise]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  async callTool(name: string, args: Record<string, unknown> = {}): Promise<McpToolResult> {
    if (!this.client) throw new Error('MCP client not connected');
    return this.client.callTool({ name, arguments: args }) as Promise<McpToolResult>;
  }

  async disconnect(): Promise<void> {
    if (this.transport) {
      await this.transport.close?.();
      this.transport = null;
    }
    this.client = null;
  }
}

export interface RssTrendItem {
  word: string;
  count: number;
}

export interface RssArticle {
  title: string;
  link: string;
  url?: string;
  published: string;
  publishedAt?: string;
  summary: string;
  description?: string;
  source: string;
  keywords?: string[];
}

export interface RssContext {
  trendingKeywords: RssTrendItem[];
  relatedArticles: RssArticle[];
}

const MCP_RSS_SCOUT_PATH = process.env.MCP_RSS_SCOUT_PATH ?? '';
const MCP_TIMEOUT = 5000;
const PUBLIC_RSS_TIMEOUT = 8000;
const PUBLIC_RSS_CACHE_TTL = 30 * 60 * 1000;
const MAX_RELATED_ARTICLES = 18;

interface PublicFeed {
  name: string;
  url: string;
}

interface PublicRssCache {
  data: RssContext;
  expiresAt: number;
}

type ParsedXml = Record<string, unknown>;

const PUBLIC_RSS_FEEDS: PublicFeed[] = [
  { name: 'Hacker News', url: 'https://hnrss.org/frontpage' },
  { name: 'TechCrunch', url: 'https://techcrunch.com/feed/' },
  { name: 'The Verge', url: 'https://www.theverge.com/rss/index.xml' },
  { name: 'DEV Community', url: 'https://dev.to/feed' },
  { name: 'Zenn', url: 'https://zenn.dev/feed' },
  { name: 'Qiita Popular', url: 'https://qiita.com/popular-items/feed' },
];

const STOP_WORDS = new Set([
  'https', 'http', 'www', 'com', 'with', 'from', 'that', 'this', 'your', 'you',
  'for', 'and', 'the', 'are', 'was', 'were', 'into', 'about', 'using', 'how',
  'what', 'why', 'new', 'news', 'more', 'after', 'over', 'under', 'their',
  'they', 'will', 'can', 'has', 'have', 'had', 'not', 'but', 'all',
]);

let publicRssCache: PublicRssCache | null = null;

function asArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function textValue(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    if (typeof obj['#text'] === 'string') return obj['#text'];
    if (typeof obj._text === 'string') return obj._text;
    if (typeof obj.href === 'string') return obj.href;
  }
  return '';
}

function cleanText(value: string): string {
  return value
    .replace(/<!\[CDATA\[(.*?)\]\]>/gs, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function parseDate(value: string): string {
  if (!value) return '';
  const time = Date.parse(value);
  return Number.isNaN(time) ? value : new Date(time).toISOString();
}

function extractAtomLink(link: unknown): string {
  const links = asArray(link);
  for (const item of links) {
    if (typeof item === 'string') return item;
    if (item && typeof item === 'object') {
      const obj = item as Record<string, unknown>;
      const rel = textValue(obj.rel);
      const href = textValue(obj.href);
      if (href && (!rel || rel === 'alternate')) return href;
    }
  }
  return '';
}

function extractKeywords(text: string, seedKeywords: string[]): string[] {
  const lower = text.toLowerCase();
  const counts = new Map<string, number>();

  for (const keyword of seedKeywords) {
    if (keyword && lower.includes(keyword.toLowerCase())) {
      counts.set(keyword, (counts.get(keyword) ?? 0) + 3);
    }
  }

  const matches = text.match(/[A-Za-z][A-Za-z0-9+#.-]{2,}|[ぁ-んァ-ヶ一-龯ー]{2,}/g) ?? [];
  for (const match of matches) {
    const normalized = match.trim();
    const key = normalized.toLowerCase();
    if (STOP_WORDS.has(key) || normalized.length > 32) continue;
    counts.set(normalized, (counts.get(normalized) ?? 0) + 1);
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([word]) => word);
}

function parseFeed(xml: string, source: string, seedKeywords: string[]): RssArticle[] {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '',
    textNodeName: '#text',
    cdataPropName: '#text',
  });
  const parsed = parser.parse(xml) as ParsedXml;

  const rss = parsed.rss as Record<string, unknown> | undefined;
  const channel = rss?.channel as Record<string, unknown> | undefined;
  const rssItems = asArray(channel?.item as Record<string, unknown> | Record<string, unknown>[] | undefined);

  const feed = parsed.feed as Record<string, unknown> | undefined;
  const atomEntries = asArray(feed?.entry as Record<string, unknown> | Record<string, unknown>[] | undefined);

  const rawItems = rssItems.length > 0 ? rssItems : atomEntries;
  return rawItems
    .map((item) => {
      const title = cleanText(textValue(item.title));
      const link = cleanText(rssItems.length > 0 ? textValue(item.link) : extractAtomLink(item.link));
      const published = parseDate(cleanText(textValue(item.pubDate) || textValue(item.published) || textValue(item.updated)));
      const summary = cleanText(
        textValue(item.description) ||
        textValue(item.summary) ||
        textValue(item.content) ||
        textValue(item['content:encoded']),
      );
      const keywords = extractKeywords(`${title} ${summary}`, seedKeywords);

      return {
        title,
        link,
        url: link,
        published,
        publishedAt: published,
        summary,
        description: summary,
        source,
        keywords,
      };
    })
    .filter((article) => article.title && article.link);
}

async function fetchFeed(feed: PublicFeed, keywords: string[]): Promise<RssArticle[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PUBLIC_RSS_TIMEOUT);

  try {
    const response = await fetch(feed.url, {
      headers: { 'User-Agent': 'builder-agent-chain/0.1 RSS fallback' },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    const xml = await response.text();
    return parseFeed(xml, feed.name, keywords);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.warn(`[RSS] Public feed failed (${feed.name}): ${msg}`);
    return [];
  } finally {
    clearTimeout(timer);
  }
}

function buildTrendingKeywords(articles: RssArticle[], seedKeywords: string[]): RssTrendItem[] {
  const counts = new Map<string, number>();
  for (const article of articles) {
    for (const keyword of article.keywords ?? []) {
      counts.set(keyword, (counts.get(keyword) ?? 0) + 1);
    }
    const text = `${article.title} ${article.summary}`.toLowerCase();
    for (const keyword of seedKeywords) {
      if (text.includes(keyword.toLowerCase())) {
        counts.set(keyword, (counts.get(keyword) ?? 0) + 2);
      }
    }
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([word, count]) => ({ word, count }));
}

function rankArticles(articles: RssArticle[], keywords: string[]): RssArticle[] {
  const seen = new Set<string>();
  const deduped = articles.filter((article) => {
    const key = article.link || article.title;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return deduped
    .map((article) => {
      const text = `${article.title} ${article.summary} ${(article.keywords ?? []).join(' ')}`.toLowerCase();
      const keywordScore = keywords.reduce((score, keyword) => (
        text.includes(keyword.toLowerCase()) ? score + 10 : score
      ), 0);
      const publishedTime = Date.parse(article.published);
      const recencyScore = Number.isNaN(publishedTime) ? 0 : Math.max(0, 7 - ((Date.now() - publishedTime) / 86_400_000));
      return { article, score: keywordScore + recencyScore };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_RELATED_ARTICLES)
    .map(({ article }) => article);
}

async function fetchPublicRssContext(keywords: string[]): Promise<RssContext> {
  if (publicRssCache && Date.now() < publicRssCache.expiresAt) {
    return publicRssCache.data;
  }

  const articles = (await Promise.all(
    PUBLIC_RSS_FEEDS.map((feed) => fetchFeed(feed, keywords)),
  )).flat();

  const relatedArticles = rankArticles(articles, keywords);
  const trendingKeywords = buildTrendingKeywords(relatedArticles, keywords);
  const data = { trendingKeywords, relatedArticles };
  publicRssCache = { data, expiresAt: Date.now() + PUBLIC_RSS_CACHE_TTL };

  console.log(`[RSS] Public RSS fallback: ${relatedArticles.length} articles, ${trendingKeywords.length} keywords`);
  return data;
}

export async function fetchRssContext(keywords: string[]): Promise<RssContext> {
  if (!MCP_RSS_SCOUT_PATH) {
    console.warn('[MCP] MCP_RSS_SCOUT_PATH not set — using public RSS fallback');
    return fetchPublicRssContext(keywords);
  }

  const client = new McpClient();
  try {
    await client.connect('node', [MCP_RSS_SCOUT_PATH], MCP_TIMEOUT);

    const trendingResult = await client.callTool('rss_trending', { hours: 72 });
    const trendingText = trendingResult.content?.[0]?.text ?? '{}';
    const trendingData = JSON.parse(trendingText);
    const trendingKeywords: RssTrendItem[] = trendingData.trending ?? [];

    const relatedArticles: RssArticle[] = [];
    for (const kw of keywords.slice(0, 3)) {
      try {
        const searchResult = await client.callTool('rss_search', { keyword: kw, limit: 5 });
        const searchText = searchResult.content?.[0]?.text ?? '{}';
        const searchData = JSON.parse(searchText);
        for (const article of (searchData.articles ?? [])) {
          relatedArticles.push({
            title: article.title ?? '',
            link: article.link ?? '',
            published: article.published ?? '',
            summary: article.summary ?? '',
            source: article.source ?? '',
          });
        }
      } catch {
        // skip failed search for individual keyword
      }
    }

    if (trendingKeywords.length > 0 || relatedArticles.length > 0) {
      return { trendingKeywords, relatedArticles };
    }

    console.warn('[MCP] RSS returned no data — using public RSS fallback');
    return fetchPublicRssContext(keywords);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.warn(`[MCP] RSS enrichment failed: ${msg} — using public RSS fallback`);
    return fetchPublicRssContext(keywords);
  } finally {
    await client.disconnect();
  }
}
