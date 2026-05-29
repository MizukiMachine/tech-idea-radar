import { XMLParser } from 'fast-xml-parser';
import { isIP } from 'node:net';
import {
  observeRssArticles,
  rssArticleFingerprint,
  type RssObservationMetadata,
  type RssTopicCluster,
  type RssTopicStatus,
} from './rss-observation';

export interface RssTrendItem {
  word: string;
  count: number;
}

export interface RssArticle {
  title: string;
  titleJa?: string;
  link: string;
  url?: string;
  published: string;
  publishedAt?: string;
  summary: string;
  summaryJa?: string;
  description?: string;
  source: string;
  sourceUrl?: string;
  keywords?: string[];
  topicKey?: string;
  topicStatus?: RssTopicStatus;
  firstSeenAt?: string;
  lastSeenAt?: string;
  topicArticleCount?: number;
  topicSourceCount?: number;
}

export interface RssSourceError {
  source: string;
  message: string;
}

export interface RssSummaryError {
  index: number;
  title: string;
  source: string;
  message: string;
  url?: string;
}

export interface RssContext {
  trendingKeywords: RssTrendItem[];
  relatedArticles: RssArticle[];
  topicClusters?: RssTopicCluster[];
  sourceErrors?: RssSourceError[];
  summaryErrors?: RssSummaryError[];
  replacedSummaryErrors?: RssSummaryError[];
  observationWarning?: string;
}

const DEFAULT_RSS_FETCH_TIMEOUT_MS = 8000;
const DEFAULT_ARTICLE_FETCH_TIMEOUT_MS = 5000;
const DEFAULT_RSS_FETCH_CONCURRENCY = 3;
const DEFAULT_ARTICLE_FETCH_CONCURRENCY = 3;
const DEFAULT_RSS_FEED_CACHE_TTL_MS = 5 * 60 * 1000;
const DEFAULT_DISPLAY_RELATED_ARTICLES = 4;
const DEFAULT_RELATED_ARTICLE_CANDIDATE_COUNT = 9;
const DEFAULT_SOURCE_FIRST_PASS_LIMIT = 1;
const DEFAULT_SOURCE_TOTAL_LIMIT = 3;
const MIN_USEFUL_SUMMARY_LENGTH = 280;

interface PublicFeed {
  name: string;
  url: string;
}

type ParsedXml = Record<string, unknown>;
type FeedFetchResult = { articles: RssArticle[]; error?: RssSourceError };
type CachedFeed = { articles: RssArticle[]; fetchedAt: number };

const feedCache = new Map<string, CachedFeed>();

const DEFAULT_RSS_FEEDS: PublicFeed[] = [
  { name: 'Hacker News', url: 'https://hnrss.org/frontpage' },
  { name: 'TechCrunch', url: 'https://techcrunch.com/feed/' },
  { name: 'GitHub Blog', url: 'https://github.blog/feed/' },
  { name: 'Stack Overflow Blog', url: 'https://stackoverflow.blog/feed/' },
  { name: 'InfoQ', url: 'https://feed.infoq.com/' },
  { name: 'AWS News Blog', url: 'https://aws.amazon.com/blogs/aws/feed/' },
  { name: 'Microsoft DevBlogs', url: 'https://devblogs.microsoft.com/feed/' },
  { name: 'Product Hunt', url: 'https://www.producthunt.com/feed' },
];

const STOP_WORDS = new Set([
  'https', 'http', 'www', 'com', 'with', 'from', 'that', 'this', 'your', 'you',
  'for', 'and', 'the', 'are', 'was', 'were', 'into', 'about', 'using', 'how',
  'what', 'why', 'new', 'news', 'more', 'after', 'over', 'under', 'their',
  'they', 'will', 'can', 'has', 'have', 'had', 'not', 'but', 'all',
  'です', 'ます', 'でした', 'ました', 'する', 'した', 'して', 'いる', 'ある',
  'ない', 'こと', 'これ', 'それ', 'ため', 'よう', 'など', 'その', 'この',
  'もの', 'また', 'から', 'まで', 'より', 'として', 'について', '記事',
  '今回', '紹介', 'では', 'とは', 'にも', 'には', 'への', 'でも', 'という',
  'そして', 'ただし', '一方', 'できる', 'できた', 'なる', 'なった', 'れる',
  'られる', 'された', 'される', 'ための', 'ような', '中で', '上で',
]);

const NUMBER_ONLY_KEYWORD = /^[\d０-９]+$/;
const HTML_ENTITIES: Record<string, string> = {
  amp: '&',
  apos: "'",
  copy: '(c)',
  euro: 'EUR',
  gt: '>',
  hellip: '...',
  laquo: '«',
  ldquo: '"',
  lsquo: "'",
  lt: '<',
  mdash: '-',
  nbsp: ' ',
  ndash: '-',
  quot: '"',
  raquo: '»',
  reg: '(R)',
  rdquo: '"',
  rsquo: "'",
  trade: 'TM',
};

const HTML_TAG_NAMES = [
  'a', 'abbr', 'address', 'area', 'article', 'aside', 'audio', 'b', 'base',
  'bdi', 'bdo', 'blockquote', 'br', 'button', 'canvas', 'caption', 'cite',
  'code', 'col', 'colgroup', 'data', 'datalist', 'dd', 'del', 'details',
  'dfn', 'dialog', 'div', 'dl', 'dt', 'em', 'embed', 'fieldset',
  'figcaption', 'figure', 'footer', 'form', 'h1', 'h2', 'h3', 'h4', 'h5',
  'h6', 'head', 'header', 'hr', 'html', 'i', 'iframe', 'img', 'input',
  'ins', 'kbd', 'label', 'legend', 'li', 'link', 'main', 'map', 'mark',
  'meta', 'meter', 'nav', 'noscript', 'object', 'ol', 'optgroup', 'option',
  'output', 'p', 'param', 'picture', 'pre', 'progress', 'q', 'rp', 'rt',
  'ruby', 's', 'samp', 'script', 'section', 'select', 'slot', 'small',
  'source', 'span', 'strong', 'style', 'sub', 'summary', 'sup', 'svg',
  'table', 'tbody', 'td', 'template', 'textarea', 'tfoot', 'th', 'thead',
  'time', 'title', 'tr', 'track', 'u', 'ul', 'var', 'video', 'wbr',
] as const;
const HTML_TAG_PATTERN = new RegExp(
  `</?(?:${HTML_TAG_NAMES.join('|')})(?:\\s[^<>]*)?/?>`,
  'gi',
);
const HTML_BLOCK_TAG_PATTERN = new RegExp(
  `<(?:script|style|template)(?:\\s[^<>]*)?>[\\s\\S]*?</(?:script|style|template)>`,
  'gi',
);

const PRODUCT_SIGNAL_TERMS = [
  'ai', 'agent', 'agents', 'api', 'automation', 'cloud', 'code', 'coding',
  'database', 'developer', 'developers', 'engineering', 'infrastructure',
  'llm', 'model', 'open source', 'platform', 'privacy', 'product', 'saas',
  'sdk', 'security', 'startup', 'tool', 'tools', 'workflow',
  'エンジニア', 'クラウド', 'コード', 'セキュリティ', 'ツール', 'データ',
  'プロダクト', 'モデル', '開発', '基盤', '自動化', '生成ai',
];

type ScoredArticle = {
  article: RssArticle;
  score: number;
};

function asArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function relatedArticleCandidateCount(): number {
  const displayCount = parsePositiveInt(
    process.env.RSS_DISPLAY_RELATED_ARTICLES ?? process.env.RSS_MAX_RELATED_ARTICLES,
    DEFAULT_DISPLAY_RELATED_ARTICLES,
  );
  const defaultCandidateCount = Math.max(displayCount, DEFAULT_RELATED_ARTICLE_CANDIDATE_COUNT);
  return Math.max(displayCount, parsePositiveInt(
    process.env.RSS_RELATED_ARTICLE_CANDIDATE_COUNT,
    defaultCandidateCount,
  ));
}

function parseNonNegativeInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

function isPrivateIpv4(ip: string): boolean {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return true;
  }
  const [a, b] = parts;
  return a === 10
    || a === 127
    || a === 0
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168);
}

function isPrivateIpv6(ip: string): boolean {
  const normalized = ip.toLowerCase();
  return normalized === '::1'
    || normalized.startsWith('fc')
    || normalized.startsWith('fd')
    || normalized.startsWith('fe80:');
}

function isAllowedHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol)) return false;

    const host = url.hostname.toLowerCase();
    if (!host || host === 'localhost' || host.endsWith('.localhost')) return false;

    const ipVersion = isIP(host);
    if (ipVersion === 4) return !isPrivateIpv4(host);
    if (ipVersion === 6) return !isPrivateIpv6(host);

    return true;
  } catch {
    return false;
  }
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  const workerCount = Math.max(1, Math.min(concurrency, items.length));

  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(items[index], index);
    }
  }));

  return results;
}

function cloneArticle(article: RssArticle): RssArticle {
  return {
    ...article,
    keywords: article.keywords ? [...article.keywords] : undefined,
  };
}

function getCachedFeed(url: string): RssArticle[] | undefined {
  const ttlMs = parseNonNegativeInt(process.env.RSS_FEED_CACHE_TTL_MS, DEFAULT_RSS_FEED_CACHE_TTL_MS);
  if (ttlMs === 0) return undefined;

  const entry = feedCache.get(url);
  if (!entry) return undefined;
  if (Date.now() - entry.fetchedAt > ttlMs) {
    feedCache.delete(url);
    return undefined;
  }
  return entry.articles.map(cloneArticle);
}

function setCachedFeed(url: string, articles: RssArticle[]): void {
  const ttlMs = parseNonNegativeInt(process.env.RSS_FEED_CACHE_TTL_MS, DEFAULT_RSS_FEED_CACHE_TTL_MS);
  if (ttlMs === 0) return;
  feedCache.set(url, {
    articles: articles.map(cloneArticle),
    fetchedAt: Date.now(),
  });
}

function withObservationMetadata(article: RssArticle, metadata?: RssObservationMetadata): RssArticle {
  if (!metadata) return article;
  return {
    ...article,
    topicKey: metadata.topicKey,
    topicStatus: metadata.topicStatus,
    firstSeenAt: metadata.firstSeenAt,
    lastSeenAt: metadata.lastSeenAt,
    topicArticleCount: metadata.topicArticleCount,
    topicSourceCount: metadata.topicSourceCount,
  };
}

function configuredFeeds(): PublicFeed[] {
  const raw = process.env.RSS_FEEDS?.trim();
  if (!raw) return DEFAULT_RSS_FEEDS;

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) throw new Error('RSS_FEEDS must be a JSON array');
    const feeds = parsed
      .map((item): PublicFeed | null => {
        if (!item || typeof item !== 'object') return null;
        const record = item as Record<string, unknown>;
        const name = typeof record.name === 'string' ? record.name.trim() : '';
        const url = typeof record.url === 'string' ? record.url.trim() : '';
        return name && url ? { name, url } : null;
      })
      .filter((feed): feed is PublicFeed => Boolean(feed));

    if (feeds.length === 0) throw new Error('RSS_FEEDS did not contain usable feeds');
    return feeds;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[RSS] Invalid RSS_FEEDS configuration: ${message}. Using default feeds.`);
    return DEFAULT_RSS_FEEDS;
  }
}

function textValue(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  if (Array.isArray(value)) {
    return value
      .map((item) => textValue(item))
      .filter(Boolean)
      .join(' ');
  }
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const directText = textValue(obj['#text']) || textValue(obj._text) || textValue(obj.href);
    if (directText) return directText;

    return Object.entries(obj)
      .filter(([key]) => !key.startsWith('@') && key !== 'type' && key !== 'rel')
      .map(([, nested]) => textValue(nested))
      .filter(Boolean)
      .join(' ');
  }
  return '';
}

function decodeHtmlEntities(value: string): string {
  return value.replace(/&(#x[\da-f]+|#\d+|[a-z][a-z0-9]+);/gi, (entity, body: string) => {
    if (body.startsWith('#x') || body.startsWith('#X')) {
      const codePoint = Number.parseInt(body.slice(2), 16);
      return Number.isInteger(codePoint) && codePoint >= 0 && codePoint <= 0x10ffff
        ? String.fromCodePoint(codePoint)
        : entity;
    }
    if (body.startsWith('#')) {
      const codePoint = Number.parseInt(body.slice(1), 10);
      return Number.isInteger(codePoint) && codePoint >= 0 && codePoint <= 0x10ffff
        ? String.fromCodePoint(codePoint)
        : entity;
    }
    return HTML_ENTITIES[body.toLowerCase()] ?? entity;
  });
}

function cleanText(value: string): string {
  const withoutCdata = value.replace(/<!\[CDATA\[(.*?)\]\]>/gs, '$1');
  return decodeHtmlEntities(stripHtmlTags(withoutCdata))
    .replace(HTML_BLOCK_TAG_PATTERN, ' ')
    .replace(HTML_TAG_PATTERN, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripHtmlTags(value: string): string {
  return value
    .replace(HTML_BLOCK_TAG_PATTERN, ' ')
    .replace(/<!\[CDATA\[(.*?)\]\]>/gs, '$1')
    .replace(HTML_TAG_PATTERN, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripFeedMetadata(value: string): string {
  return value
    .replace(/\bArticle URL:\s*\S+/gi, ' ')
    .replace(/\bComments URL:\s*\S+/gi, ' ')
    .replace(/\bPoints:\s*\d+/gi, ' ')
    .replace(/#\s*Comments:\s*\d+/gi, ' ')
    .replace(/\bRead the full story at\s+[^.。]+[.。]?/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractMetadataArticleUrl(value: string): string {
  const cleaned = cleanText(value);
  const match = /\bArticle URL:\s*(https?:\/\/\S+)/i.exec(cleaned);
  if (!match) return '';
  return match[1].replace(/[),.;]+$/g, '');
}

function containsFeedMetadata(value: string): boolean {
  return /\bArticle URL:|\bComments URL:|\bPoints:|#\s*Comments:/i.test(value);
}

function longestText(...values: string[]): string {
  return values
    .map(cleanText)
    .map(stripFeedMetadata)
    .sort((a, b) => b.length - a.length)[0] ?? '';
}

function htmlAttributeValue(tag: string, attribute: string): string {
  const match = new RegExp(`${attribute}=["']([^"']+)["']`, 'i').exec(tag);
  return match?.[1] ?? '';
}

function extractHtmlExcerpt(html: string): string {
  const metaDescriptions = [...html.matchAll(/<meta\b[^>]*>/gi)]
    .map(([tag]) => {
      const name = htmlAttributeValue(tag, 'name').toLowerCase();
      const property = htmlAttributeValue(tag, 'property').toLowerCase();
      if (!['description', 'og:description', 'twitter:description'].includes(name || property)) return '';
      return htmlAttributeValue(tag, 'content');
    })
    .filter(Boolean);

  const readableHtml = html
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, ' ');
  const articleMatch = /<article\b[^>]*>([\s\S]*?)<\/article>/i.exec(readableHtml);
  const body = articleMatch?.[1] ?? readableHtml;
  const paragraphs = [...body.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)]
    .map(([, paragraph]) => cleanText(paragraph))
    .filter((paragraph) => paragraph.length >= 40)
    .slice(0, 10);

  return longestText(
    metaDescriptions.join(' '),
    paragraphs.join(' '),
  );
}

async function fetchArticleExcerpt(article: RssArticle): Promise<string> {
  const targetUrl = article.url || article.link;
  if (!isAllowedHttpUrl(targetUrl)) return '';

  const controller = new AbortController();
  const timeoutMs = parsePositiveInt(process.env.RSS_ARTICLE_FETCH_TIMEOUT_MS, DEFAULT_ARTICLE_FETCH_TIMEOUT_MS);
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(targetUrl, {
      headers: { 'User-Agent': 'tech-idea-radar/0.1 article excerpt reader' },
      signal: controller.signal,
    });
    if (!response.ok) return '';

    const contentType = response.headers?.get('content-type') ?? '';
    if (contentType && !/text\/html|application\/xhtml\+xml/i.test(contentType)) return '';

    return extractHtmlExcerpt(await response.text());
  } catch {
    return '';
  } finally {
    clearTimeout(timer);
  }
}

function needsArticleExcerpt(article: RssArticle): boolean {
  if (containsFeedMetadata(article.summary) || containsFeedMetadata(article.description ?? '')) return true;
  if (article.source.toLowerCase().includes('hacker news')) return true;
  return article.summary.length < MIN_USEFUL_SUMMARY_LENGTH;
}

async function enrichArticleSummaries(articles: RssArticle[], keywords: string[]): Promise<RssArticle[]> {
  const shouldFetchExcerpts = process.env.RSS_FETCH_ARTICLE_EXCERPTS !== 'false';
  if (!shouldFetchExcerpts) return articles;
  const concurrency = parsePositiveInt(process.env.RSS_ARTICLE_FETCH_CONCURRENCY, DEFAULT_ARTICLE_FETCH_CONCURRENCY);

  return mapWithConcurrency(articles, concurrency, async (article) => {
    if (!needsArticleExcerpt(article)) return article;

    const excerpt = await fetchArticleExcerpt(article);
    if (excerpt.length <= article.summary.length) return article;

    const summary = excerpt.slice(0, 5000);
    return {
      ...article,
      summary,
      description: summary,
      keywords: extractKeywords(`${article.title} ${summary}`, keywords),
    };
  });
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

function articleKey(article: RssArticle): string {
  return (article.link || article.url || article.title).trim().toLowerCase();
}

function extractKeywords(text: string, seedKeywords: string[]): string[] {
  const lower = text.toLowerCase();
  const counts = new Map<string, number>();

  for (const keyword of seedKeywords) {
    const normalized = normalizeKeyword(keyword);
    if (isUsefulKeyword(normalized) && lower.includes(normalized.toLowerCase())) {
      counts.set(normalized, (counts.get(normalized) ?? 0) + 3);
    }
  }

  const matches = text.match(/[A-Za-z][A-Za-z0-9+#.-]{2,}|[ぁ-んァ-ヶ一-龯ー]{2,}/g) ?? [];
  for (const match of matches) {
    const normalized = normalizeKeyword(match);
    if (!isUsefulKeyword(normalized)) continue;
    counts.set(normalized, (counts.get(normalized) ?? 0) + 1);
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([word]) => word);
}

function normalizeKeyword(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function isUsefulKeyword(value: string): boolean {
  const normalized = normalizeKeyword(value);
  if (!normalized || normalized.length > 32) return false;
  const key = normalized.toLowerCase();
  if (STOP_WORDS.has(key)) return false;
  if (NUMBER_ONLY_KEYWORD.test(normalized)) return false;
  return true;
}

function parseFeed(xml: string, source: string, sourceUrl: string, seedKeywords: string[]): RssArticle[] {
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
      const rawSummaryParts = [
        textValue(item.description) || '',
        textValue(item.summary) || '',
        textValue(item.content) || '',
        textValue(item['content:encoded']) || '',
      ];
      const articleUrl = rawSummaryParts.map(extractMetadataArticleUrl).find(Boolean) || link;
      const summary = longestText(
        ...rawSummaryParts
      );
      const keywords = extractKeywords(`${title} ${summary}`, seedKeywords);

      return {
        title,
        link,
        url: articleUrl,
        published,
        publishedAt: published,
        summary,
        description: summary,
        source,
        sourceUrl,
        keywords,
      };
    })
    .filter((article) => article.title && article.link);
}

async function fetchFeed(feed: PublicFeed, keywords: string[]): Promise<FeedFetchResult> {
  if (!isAllowedHttpUrl(feed.url)) {
    return {
      articles: [],
      error: { source: feed.name, message: 'RSS feed URL is not allowed' },
    };
  }

  const cached = getCachedFeed(feed.url);
  if (cached) return { articles: cached };

  const controller = new AbortController();
  const timeoutMs = parsePositiveInt(process.env.RSS_FETCH_TIMEOUT_MS, DEFAULT_RSS_FETCH_TIMEOUT_MS);
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(feed.url, {
      headers: { 'User-Agent': 'tech-idea-radar/0.1 RSS reader' },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    const xml = await response.text();
    const articles = parseFeed(xml, feed.name, feed.url, keywords);
    if (articles.length === 0) throw new Error('No valid RSS articles found');
    setCachedFeed(feed.url, articles);
    return { articles };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.warn(`[RSS] Feed failed (${feed.name}): ${msg}`);
    return { articles: [], error: { source: feed.name, message: msg } };
  } finally {
    clearTimeout(timer);
  }
}

function buildTrendingKeywords(articles: RssArticle[], seedKeywords: string[]): RssTrendItem[] {
  const counts = new Map<string, number>();
  for (const article of articles) {
    for (const keyword of article.keywords ?? []) {
      const normalized = normalizeKeyword(keyword);
      if (!isUsefulKeyword(normalized)) continue;
      counts.set(normalized, (counts.get(normalized) ?? 0) + 1);
    }
    const text = `${article.title} ${article.summary}`.toLowerCase();
    for (const keyword of seedKeywords) {
      const normalized = normalizeKeyword(keyword);
      if (isUsefulKeyword(normalized) && text.includes(normalized.toLowerCase())) {
        counts.set(normalized, (counts.get(normalized) ?? 0) + 2);
      }
    }
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([word, count]) => ({ word, count }));
}

function articleScore(article: RssArticle, keywords: string[]): number {
  const title = normalizeSearchText(article.title);
  const summary = normalizeSearchText(article.summary);
  const keywordText = normalizeSearchText((article.keywords ?? []).join(' '));
  const combined = `${title} ${summary} ${keywordText}`;

  const keywordScore = keywords.reduce((score, keyword) => {
    const normalized = normalizeSearchText(keyword);
    if (!normalized) return score;
    if (title.includes(normalized)) return score + 16;
    if (summary.includes(normalized)) return score + 10;
    if (keywordText.includes(normalized)) return score + 8;
    return score;
  }, 0);

  const signalMatches = PRODUCT_SIGNAL_TERMS.reduce((count, term) => (
    combined.includes(normalizeSearchText(term)) ? count + 1 : count
  ), 0);
  const signalScore = Math.min(18, signalMatches * 3);

  const publishedTime = Date.parse(article.published);
  const ageDays = Number.isNaN(publishedTime) ? 14 : Math.max(0, (Date.now() - publishedTime) / 86_400_000);
  const recencyScore = Math.max(0, 12 - ageDays);

  const summaryLength = article.summary.trim().length;
  const substanceScore = summaryLength >= 280 ? 8 : summaryLength >= 120 ? 4 : 0;

  return keywordScore + signalScore + recencyScore + substanceScore;
}

function normalizeSearchText(value: string): string {
  return value
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function rankArticles(articles: RssArticle[], keywords: string[], feeds: PublicFeed[]): RssArticle[] {
  const seen = new Set<string>();
  const deduped = articles.filter((article) => {
    const key = articleKey(article);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const ranked = deduped
    .map((article): ScoredArticle => ({ article, score: articleScore(article, keywords) }))
    .sort((a, b) => b.score - a.score);

  const sourceOrder = [
    ...feeds.map((feed) => feed.name).filter((source) => ranked.some((item) => item.article.source === source)),
    ...new Set(ranked.map(({ article }) => article.source).filter((source) => !feeds.some((feed) => feed.name === source))),
  ].filter(Boolean);
  const selected: ScoredArticle[] = [];
  const selectedUrls = new Set<string>();
  const sourceCounts = new Map<string, number>();
  const maxArticles = relatedArticleCandidateCount();
  const firstPassLimit = parsePositiveInt(process.env.RSS_SOURCE_FIRST_PASS_LIMIT, DEFAULT_SOURCE_FIRST_PASS_LIMIT);
  const sourceTotalLimit = Math.max(
    firstPassLimit,
    parsePositiveInt(process.env.RSS_SOURCE_TOTAL_LIMIT, DEFAULT_SOURCE_TOTAL_LIMIT),
  );
  const rankedBySource = new Map<string, ScoredArticle[]>();

  for (const scored of ranked) {
    const { article } = scored;
    const sourceArticles = rankedBySource.get(article.source) ?? [];
    sourceArticles.push(scored);
    rankedBySource.set(article.source, sourceArticles);
  }

  const addArticle = (scored: ScoredArticle): boolean => {
    if (selected.length >= maxArticles) return false;
    const { article } = scored;
    const key = articleKey(article);
    if (selectedUrls.has(key)) return false;
    const currentCount = sourceCounts.get(article.source) ?? 0;
    if (currentCount >= sourceTotalLimit) return false;
    selected.push(scored);
    selectedUrls.add(key);
    sourceCounts.set(article.source, currentCount + 1);
    return true;
  };

  for (let index = 0; index < firstPassLimit && selected.length < maxArticles; index += 1) {
    for (const source of sourceOrder) {
      const article = rankedBySource.get(source)?.[index];
      if (article) addArticle(article);
    }
  }

  for (let index = firstPassLimit; selected.length < maxArticles; index += 1) {
    const round = sourceOrder
      .map((source) => rankedBySource.get(source)?.[index])
      .filter((article): article is ScoredArticle => Boolean(article))
      .sort((a, b) => b.score - a.score);

    if (round.length === 0) break;
    for (const article of round) {
      addArticle(article);
      if (selected.length >= maxArticles) break;
    }
  }

  return selected
    .sort((a, b) => b.score - a.score)
    .map(({ article }) => article);
}

export async function fetchRssContext(keywords: string[]): Promise<RssContext> {
  const feeds = configuredFeeds();
  const fetchConcurrency = parsePositiveInt(process.env.RSS_FETCH_CONCURRENCY, DEFAULT_RSS_FETCH_CONCURRENCY);
  const results = await mapWithConcurrency(
    feeds,
    fetchConcurrency,
    (feed) => fetchFeed(feed, keywords),
  );

  const articles = results.flatMap((result) => result.articles);
  const observation = observeRssArticles(articles);
  const observedArticles = articles.map((article) => withObservationMetadata(
    article,
    observation.metadataByFingerprint.get(rssArticleFingerprint(article)),
  ));
  const sourceErrors = results
    .map((result) => result.error)
    .filter((error): error is RssSourceError => Boolean(error));
  const relatedArticles = await enrichArticleSummaries(rankArticles(observedArticles, keywords, feeds), keywords);
  const trendingKeywords = buildTrendingKeywords(relatedArticles, keywords);
  const sourceCount = new Set(relatedArticles.map((article) => article.source).filter(Boolean)).size;
  const data = {
    trendingKeywords,
    relatedArticles,
    topicClusters: observation.topics,
    ...(sourceErrors.length > 0 ? { sourceErrors } : {}),
    ...(observation.warning ? { observationWarning: observation.warning } : {}),
  };

  console.log(`[RSS] Direct RSS: ${relatedArticles.length} candidate articles across ${sourceCount} sources, ${trendingKeywords.length} keywords, ${observation.topics.length} topics`);
  return data;
}
