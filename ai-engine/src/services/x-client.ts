import fs from 'node:fs';
import path from 'node:path';
import type {
  XTweet,
  XTrendingTopic,
  XDemandSignal,
  XCompetitorSentiment,
  XContext,
} from '../types/x-context';
import { McpClient, type McpToolResult } from './mcp-client';

const X_BEARER_TOKEN = process.env.X_BEARER_TOKEN ?? '';
const X_API_BASE = 'https://api.x.com/2';
const REQUEST_TIMEOUT_MS = 8000;
type XDataSource = 'rest' | 'xmcp';
type XSearchFixtureMode = 'off' | 'record' | 'replay' | 'record-if-missing';
const X_DATA_SOURCE: XDataSource = process.env.X_DATA_SOURCE === 'xmcp' ? 'xmcp' : 'rest';
const X_MCP_SERVER_URL = process.env.X_MCP_SERVER_URL ?? 'http://127.0.0.1:8000/mcp';
const X_INCLUDE_USER_FIELDS = isTruthy(process.env.X_INCLUDE_USER_FIELDS);
const X_API_CACHE_TTL_MS = parseHoursToMs(process.env.X_API_CACHE_TTL_HOURS, 6);
const X_API_CACHE_FILE = process.env.X_API_CACHE_FILE?.trim() ?? '';
const X_SEARCH_FIXTURE_MODE = parseSearchFixtureMode(process.env.X_SEARCH_FIXTURE_MODE);
const X_SEARCH_FIXTURE_FILE = process.env.X_SEARCH_FIXTURE_FILE?.trim() ?? '';
const X_USAGE_CACHE_TTL_MS = 15 * 60 * 1000;

interface TweetData {
  id: string;
  text: string;
  created_at?: string;
  public_metrics?: {
    like_count: number;
    retweet_count: number;
    reply_count: number;
  };
  author_id?: string;
}

interface UserData {
  id: string;
  name: string;
  username: string;
}

interface SearchResponse {
  data?: TweetData[];
  includes?: { users?: UserData[] };
}

interface XSearchClient {
  searchRecentTweets(query: string, maxResults?: number): Promise<XTweet[]>;
  getUsage(): Promise<unknown>;
  disconnect?(): Promise<void>;
}

export interface XUsageSnapshot {
  source: XDataSource;
  fetchedAt: string;
  data: unknown;
}

export interface XRuntimeConfig {
  dataSource: XDataSource;
  includeUserFields: boolean;
  cacheTtlHours: number;
  cacheFileEnabled: boolean;
  searchFixtureMode: XSearchFixtureMode;
  searchFixtureEnabled: boolean;
  hasXBearerToken: boolean;
  hasXMcpServerUrl: boolean;
}

// --- Search-result cache ---

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry<unknown>>();

const CACHE_FILE_VERSION = 1;
let cacheFileLoaded = false;
let usageCache: CacheEntry<XUsageSnapshot> | null = null;

interface SearchFixtureEntry {
  key: string;
  source: XDataSource;
  query: string;
  maxResults: number;
  includeUserFields: boolean;
  capturedAt: string;
  data: XTweet[];
}

const SEARCH_FIXTURE_FILE_VERSION = 1;
let searchFixtureLoaded = false;
const searchFixtureEntries = new Map<string, SearchFixtureEntry>();

function isTruthy(value: string | undefined): boolean {
  return ['1', 'true', 'yes', 'on'].includes((value ?? '').trim().toLowerCase());
}

function parseHoursToMs(raw: string | undefined, fallbackHours: number): number {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallbackHours * 60 * 60 * 1000;
  return parsed * 60 * 60 * 1000;
}

function parseSearchFixtureMode(raw: string | undefined): XSearchFixtureMode {
  if (raw === 'record' || raw === 'replay' || raw === 'record-if-missing') return raw;
  return 'off';
}

function loadCacheFile(): void {
  if (cacheFileLoaded || !X_API_CACHE_FILE) return;
  cacheFileLoaded = true;

  try {
    if (!fs.existsSync(X_API_CACHE_FILE)) return;
    const raw = fs.readFileSync(X_API_CACHE_FILE, 'utf8');
    const parsed = JSON.parse(raw) as {
      version?: number;
      entries?: Array<{ key: string; expiresAt: number; data: unknown }>;
    };
    if (parsed.version !== CACHE_FILE_VERSION || !Array.isArray(parsed.entries)) return;

    const now = Date.now();
    for (const entry of parsed.entries) {
      if (entry.key && entry.expiresAt > now) {
        cache.set(entry.key, { data: entry.data, expiresAt: entry.expiresAt });
      }
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.warn(`[X API] Failed to load cache file: ${msg}`);
  }
}

function persistCacheFile(): void {
  if (!X_API_CACHE_FILE) return;

  try {
    const now = Date.now();
    const entries = [...cache.entries()]
      .filter(([, entry]) => entry.expiresAt > now)
      .map(([key, entry]) => ({ key, expiresAt: entry.expiresAt, data: entry.data }));

    fs.mkdirSync(path.dirname(X_API_CACHE_FILE), { recursive: true });
    fs.writeFileSync(
      X_API_CACHE_FILE,
      JSON.stringify({ version: CACHE_FILE_VERSION, entries }, null, 2),
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.warn(`[X API] Failed to persist cache file: ${msg}`);
  }
}

function getCached<T>(key: string): T | null {
  loadCacheFile();
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    persistCacheFile();
    return null;
  }
  return entry.data as T;
}

function setCache<T>(key: string, data: T): void {
  cache.set(key, { data, expiresAt: Date.now() + X_API_CACHE_TTL_MS });
  persistCacheFile();
}

function isSearchFixtureEnabled(): boolean {
  return X_SEARCH_FIXTURE_MODE !== 'off' && Boolean(X_SEARCH_FIXTURE_FILE);
}

function canReplaySearchFixture(): boolean {
  return isSearchFixtureEnabled()
    && (X_SEARCH_FIXTURE_MODE === 'replay' || X_SEARCH_FIXTURE_MODE === 'record-if-missing');
}

function loadSearchFixtureFile(): void {
  if (searchFixtureLoaded || !isSearchFixtureEnabled()) return;
  searchFixtureLoaded = true;

  try {
    if (!fs.existsSync(X_SEARCH_FIXTURE_FILE)) return;
    const parsed = JSON.parse(fs.readFileSync(X_SEARCH_FIXTURE_FILE, 'utf8')) as {
      version?: number;
      entries?: SearchFixtureEntry[];
    };
    if (parsed.version !== SEARCH_FIXTURE_FILE_VERSION || !Array.isArray(parsed.entries)) return;

    for (const entry of parsed.entries) {
      if (entry.key && Array.isArray(entry.data)) {
        searchFixtureEntries.set(entry.key, entry);
      }
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.warn(`[X API] Failed to load search fixture: ${msg}`);
  }
}

function persistSearchFixtureFile(): void {
  if (!isSearchFixtureEnabled() || X_SEARCH_FIXTURE_MODE === 'replay') return;

  try {
    const entries = [...searchFixtureEntries.values()]
      .sort((a, b) => a.key.localeCompare(b.key));
    fs.mkdirSync(path.dirname(X_SEARCH_FIXTURE_FILE), { recursive: true });
    fs.writeFileSync(
      X_SEARCH_FIXTURE_FILE,
      JSON.stringify({
        version: SEARCH_FIXTURE_FILE_VERSION,
        updatedAt: new Date().toISOString(),
        entries,
      }, null, 2),
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.warn(`[X API] Failed to persist search fixture: ${msg}`);
  }
}

function getSearchFixture(cacheKey: string): XTweet[] | null {
  if (!canReplaySearchFixture()) return null;
  loadSearchFixtureFile();
  return searchFixtureEntries.get(cacheKey)?.data ?? null;
}

function recordSearchFixture(
  source: XDataSource,
  query: string,
  maxResults: number,
  data: XTweet[],
): void {
  if (!isSearchFixtureEnabled() || X_SEARCH_FIXTURE_MODE === 'replay') return;
  loadSearchFixtureFile();
  const key = searchCacheKey(source, query, maxResults);
  searchFixtureEntries.set(key, {
    key,
    source,
    query,
    maxResults,
    includeUserFields: X_INCLUDE_USER_FIELDS,
    capturedAt: new Date().toISOString(),
    data,
  });
  persistSearchFixtureFile();
}

function shouldStopOnMissingFixture(): boolean {
  return X_SEARCH_FIXTURE_MODE === 'replay' && isSearchFixtureEnabled();
}

function isFixtureReplayMode(): boolean {
  return X_SEARCH_FIXTURE_MODE === 'replay' && isSearchFixtureEnabled();
}

// --- Japanese & English demand keywords ---

const JP_DEMAND_KEYWORDS = [
  '欲しい',
  '不便',
  '困ってる',
  '辛い',
  'めんどくさい',
  '誰か作って',
  'ないのか',
  'イライラ',
  '改善してほしい',
];

const EN_DEMAND_KEYWORDS = [
  'wish there was',
  'so frustrating',
  'someone should build',
  'need a tool',
  'why is there no',
  'this is painful',
];

// --- X API client ---

export class XApiClient {
  private readonly bearerToken: string;

  constructor(bearerToken?: string) {
    this.bearerToken = bearerToken ?? X_BEARER_TOKEN;
  }

  async request<T>(endpoint: string, params: Record<string, string> = {}): Promise<T> {
    const url = new URL(`${X_API_BASE}${endpoint}`);
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${this.bearerToken}`,
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
      });

      if (!response.ok) {
        const body = await response.text().catch(() => '');
        throw new Error(`X API ${response.status}: ${body.slice(0, 200)}`);
      }

      return (await response.json()) as T;
    } finally {
      clearTimeout(timer);
    }
  }

  async searchRecentTweets(query: string, maxResults = 10): Promise<XTweet[]> {
    const cacheKey = searchCacheKey('rest', query, maxResults);
    const fixture = getSearchFixture(cacheKey);
    if (fixture !== null) return fixture;
    if (shouldStopOnMissingFixture()) {
      console.warn(`[X API] Search fixture miss in replay mode: ${query}`);
      return [];
    }

    const cached = getCached<XTweet[]>(cacheKey);
    if (cached) {
      if (X_SEARCH_FIXTURE_MODE === 'record-if-missing') {
        recordSearchFixture('rest', query, maxResults, cached);
      }
      return cached;
    }

    if (!this.bearerToken) {
      console.warn('[X API] X_BEARER_TOKEN not set — skipping live X search');
      return [];
    }

    try {
      const result = await this.request<SearchResponse>(
        '/tweets/search/recent',
        buildRecentSearchParams(query, maxResults),
      );

      if (!result.data) return [];

      const tweets = mapSearchResponse(result);

      setCache(cacheKey, tweets);
      recordSearchFixture('rest', query, maxResults, tweets);
      return tweets;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.warn(`[X API] searchRecentTweets failed: ${msg}`);
      return [];
    }
  }

  async getUsage(): Promise<unknown> {
    return this.request<unknown>('/usage/tweets');
  }
}

export class XMcpXClient implements XSearchClient {
  private client: McpClient | null = null;
  private connectPromise: Promise<McpClient> | null = null;

  constructor(private readonly serverUrl = X_MCP_SERVER_URL) {}

  private async ensureConnected(): Promise<McpClient> {
    if (this.client) return this.client;
    if (!this.connectPromise) {
      this.connectPromise = (async () => {
        const client = new McpClient();
        try {
          await client.connectHttp(this.serverUrl, REQUEST_TIMEOUT_MS);
          this.client = client;
          return client;
        } finally {
          this.connectPromise = null;
        }
      })();
    }
    return this.connectPromise;
  }

  private async callTool<T>(name: string, args: Record<string, unknown> = {}): Promise<T> {
    const client = await this.ensureConnected();
    const result = await client.callTool(name, args);
    return parseMcpToolJson<T>(result);
  }

  async searchRecentTweets(query: string, maxResults = 10): Promise<XTweet[]> {
    const cacheKey = searchCacheKey('xmcp', query, maxResults);
    const fixture = getSearchFixture(cacheKey);
    if (fixture !== null) return fixture;
    if (shouldStopOnMissingFixture()) {
      console.warn(`[X MCP] Search fixture miss in replay mode: ${query}`);
      return [];
    }

    const cached = getCached<XTweet[]>(cacheKey);
    if (cached) {
      if (X_SEARCH_FIXTURE_MODE === 'record-if-missing') {
        recordSearchFixture('xmcp', query, maxResults, cached);
      }
      return cached;
    }

    try {
      const result = await this.callTool<unknown>('searchPostsRecent', buildRecentSearchParams(query, maxResults));
      const tweets = mapSearchResponse(normalizeSearchResponse(result));
      setCache(cacheKey, tweets);
      recordSearchFixture('xmcp', query, maxResults, tweets);
      return tweets;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.warn(`[X MCP] searchPostsRecent failed: ${msg}`);
      return [];
    }
  }

  async getUsage(): Promise<unknown> {
    return this.callTool<unknown>('getUsage');
  }

  async disconnect(): Promise<void> {
    await this.client?.disconnect();
    this.client = null;
    this.connectPromise = null;
  }
}

function searchCacheKey(source: XDataSource, query: string, maxResults: number): string {
  const userMode = X_INCLUDE_USER_FIELDS ? 'with-users' : 'posts-only';
  return `search:${source}:${userMode}:${query}:${maxResults}`;
}

function normalizedQuery(query: string): string {
  const clauses = [query, '-is:retweet'];
  if (!/\blang:/i.test(query)) clauses.push('lang:ja');
  return clauses.join(' ');
}

function buildRecentSearchParams(query: string, maxResults: number): Record<string, string> {
  const params: Record<string, string> = {
    query: normalizedQuery(query),
    max_results: String(Math.min(Math.max(maxResults, 10), 100)),
    'tweet.fields': 'created_at,public_metrics',
  };

  if (X_INCLUDE_USER_FIELDS) {
    params['tweet.fields'] = 'created_at,public_metrics,author_id';
    params['user.fields'] = 'name,username';
    params.expansions = 'author_id';
  }

  return params;
}

function mapSearchResponse(result: SearchResponse): XTweet[] {
  const userMap = new Map<string, UserData>();
  for (const u of result.includes?.users ?? []) {
    userMap.set(u.id, u);
  }

  return (result.data ?? []).map((t) => {
    const user = userMap.get(t.author_id ?? '');
    const username = user?.username;
    return {
      id: t.id,
      text: t.text,
      author: user?.name ?? 'Unknown',
      authorHandle: username ?? 'unknown',
      likeCount: t.public_metrics?.like_count ?? 0,
      retweetCount: t.public_metrics?.retweet_count ?? 0,
      replyCount: t.public_metrics?.reply_count ?? 0,
      createdAt: t.created_at ?? '',
      url: `https://x.com/${username ?? 'i'}/status/${t.id}`,
    };
  });
}

function parseMcpToolJson<T>(result: McpToolResult): T {
  const text = result.content?.find((item) => item.type === 'text')?.text ?? '{}';
  try {
    return JSON.parse(text) as T;
  } catch {
    return { text } as T;
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function normalizeSearchResponse(value: unknown): SearchResponse {
  const obj = asRecord(value);
  if (!obj) return {};
  if ('data' in obj || 'includes' in obj) return obj as unknown as SearchResponse;

  for (const key of ['response', 'result', 'body']) {
    const nested = asRecord(obj[key]);
    if (nested && ('data' in nested || 'includes' in nested)) {
      return nested as unknown as SearchResponse;
    }
  }

  return {};
}

function isLiveXConfigured(): boolean {
  return X_DATA_SOURCE === 'xmcp'
    ? Boolean(X_MCP_SERVER_URL.trim())
    : Boolean(X_BEARER_TOKEN);
}

function isXSearchConfigured(): boolean {
  return isLiveXConfigured() || canReplaySearchFixture();
}

function createXClient(): XSearchClient {
  return X_DATA_SOURCE === 'xmcp' ? new XMcpXClient() : new XApiClient();
}

export function getXRuntimeConfig(): XRuntimeConfig {
  return {
    dataSource: X_DATA_SOURCE,
    includeUserFields: X_INCLUDE_USER_FIELDS,
    cacheTtlHours: X_API_CACHE_TTL_MS / 60 / 60 / 1000,
    cacheFileEnabled: Boolean(X_API_CACHE_FILE),
    searchFixtureMode: X_SEARCH_FIXTURE_MODE,
    searchFixtureEnabled: isSearchFixtureEnabled(),
    hasXBearerToken: Boolean(X_BEARER_TOKEN),
    hasXMcpServerUrl: Boolean(X_MCP_SERVER_URL.trim()),
  };
}

// --- Keyword-based sentiment classifier ---

const NEGATIVE_KEYWORDS = [
  '最悪', 'ひどい', 'がっかり', '使えない', 'バグ', 'クラッシュ', '遅い',
  '高い', '解約', '不満', '悪い', '酷い',
  'terrible', 'awful', 'worst', 'useless', 'buggy', 'slow', 'expensive', 'frustrated',
];

const POSITIVE_KEYWORDS = [
  '最高', '素晴らしい', '便利', '使いやすい', 'お気に入り', '愛用',
  'おすすめ', '感動', 'いいね',
  'amazing', 'great', 'love', 'best', 'awesome', 'excellent', 'helpful',
];

function classifySentiment(text: string): 'positive' | 'negative' | 'neutral' {
  const lower = text.toLowerCase();
  const negHits = NEGATIVE_KEYWORDS.filter((k) => lower.includes(k)).length;
  const posHits = POSITIVE_KEYWORDS.filter((k) => lower.includes(k)).length;
  if (negHits > posHits) return 'negative';
  if (posHits > negHits) return 'positive';
  return 'neutral';
}

// --- Demand signal keyword matching ---

function matchDemandKeywords(text: string): { keywords: string[]; category: XDemandSignal['needCategory'] } {
  const matched: string[] = [];
  let category: XDemandSignal['needCategory'] = 'problem';

  for (const kw of JP_DEMAND_KEYWORDS) {
    if (text.includes(kw)) matched.push(kw);
  }
  for (const kw of EN_DEMAND_KEYWORDS) {
    if (text.toLowerCase().includes(kw.toLowerCase())) matched.push(kw);
  }

  if (matched.length === 0) return { keywords: [], category };

  // Infer category from matched keywords
  const wishWords = ['誰か作って', 'wish there was', 'someone should build', 'why is there no', 'ないのか'];
  const wantWords = ['欲しい', 'need a tool'];
  const frustrationWords = ['不便', 'イライラ', 'so frustrating', 'this is painful', 'めんどくさい'];
  const problemWords = ['困ってる', '辛い', '改善してほしい'];

  if (matched.some((m) => wishWords.includes(m))) category = 'wish';
  else if (matched.some((m) => wantWords.includes(m))) category = 'want';
  else if (matched.some((m) => frustrationWords.includes(m))) category = 'frustration';
  else if (matched.some((m) => problemWords.includes(m))) category = 'problem';

  return { keywords: matched, category };
}

// --- Main fetchXContext function ---

export async function fetchXContext(
  keywords: string[],
  competitorNames: string[] = [],
): Promise<XContext> {
  const empty: XContext = {
    trendingTopics: [],
    demandSignals: [],
    competitorSentiments: [],
    fetchedAt: new Date().toISOString(),
  };

  if (!isXSearchConfigured()) {
    const missing = X_DATA_SOURCE === 'xmcp'
      ? 'X_MCP_SERVER_URL or X_SEARCH_FIXTURE_FILE'
      : 'X_BEARER_TOKEN or X_SEARCH_FIXTURE_FILE';
    console.warn(`[X API] ${missing} not set — skipping X enrichment`);
    return empty;
  }

  const client = createXClient();

  try {
    // Build query strings
    const trendingQuery = '"AI" OR "SaaS" OR "アプリ" OR "開発" lang:ja';
    const demandKeywordsStr = [
      ...JP_DEMAND_KEYWORDS.slice(0, 3),
      ...EN_DEMAND_KEYWORDS.slice(0, 2),
    ].map((k) => `"${k}"`).join(' OR ');
    const demandQuery = keywords.length > 0
      ? `(${keywords.map((k) => `"${k}"`).join(' OR ')}) (${demandKeywordsStr}) lang:ja`
      : demandKeywordsStr;

    // Run 3 queries in parallel
    const [trendingTweets, demandTweets, ...competitorResults] = await Promise.all([
      client.searchRecentTweets(trendingQuery, 10),
      client.searchRecentTweets(demandQuery, 10),
      ...competitorNames.slice(0, 5).map((name) =>
        client.searchRecentTweets(`"${name}"`, 10),
      ),
    ]);

    // Build trending topics from popular tweets
    const trendingTopics: XTrendingTopic[] = trendingTweets
      .sort((a, b) => b.likeCount - a.likeCount)
      .slice(0, 5)
      .map((tweet) => ({
        topic: tweet.text.slice(0, 80),
        tweetVolume: tweet.likeCount + tweet.retweetCount,
        url: tweet.url,
        relatedHashtags: extractHashtags(tweet.text),
      }));

    // Build demand signals
    const demandSignals: XDemandSignal[] = demandTweets
      .map((tweet) => {
        const { keywords: matched, category } = matchDemandKeywords(tweet.text);
        if (matched.length === 0) return null;
        return {
          tweet,
          needCategory: category,
          matchedKeywords: matched,
          relevanceScore: Math.min(
            matched.length * 25 + Math.floor(tweet.likeCount / 2),
            100,
          ),
        };
      })
      .filter((s): s is XDemandSignal => s !== null)
      .sort((a, b) => b.relevanceScore - a.relevanceScore)
      .slice(0, 10);

    // Build competitor sentiments
    const competitorSentiments: XCompetitorSentiment[] = competitorNames
      .slice(0, 5)
      .map((name, i) => {
        const tweets = competitorResults[i] ?? [];
        const positives: XTweet[] = [];
        const negatives: XTweet[] = [];
        const complaints: string[] = [];
        const praises: string[] = [];

        for (const tweet of tweets) {
          const sentiment = classifySentiment(tweet.text);
          if (sentiment === 'positive') {
            positives.push(tweet);
            praises.push(tweet.text.slice(0, 100));
          } else if (sentiment === 'negative') {
            negatives.push(tweet);
            complaints.push(tweet.text.slice(0, 100));
          }
        }

        const posCount = positives.length;
        const negCount = negatives.length;
        let sentimentSummary: string;
        if (posCount > negCount) sentimentSummary = 'positive';
        else if (negCount > posCount) sentimentSummary = 'negative';
        else sentimentSummary = 'mixed/neutral';

        return {
          competitorName: name,
          tweets: tweets.slice(0, 3),
          sentimentSummary,
          keyComplaints: complaints.slice(0, 3),
          keyPraises: praises.slice(0, 3),
        };
      })
      .filter((cs) => cs.tweets.length > 0);

    return {
      trendingTopics,
      demandSignals,
      competitorSentiments,
      fetchedAt: new Date().toISOString(),
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.warn(`[X API] X enrichment failed: ${msg}`);
    return empty;
  } finally {
    await client.disconnect?.();
  }
}

export function getCachedXUsage(): XUsageSnapshot | null {
  if (!usageCache || Date.now() > usageCache.expiresAt) return null;
  return usageCache.data;
}

export async function fetchXUsage(): Promise<XUsageSnapshot | null> {
  const cached = getCachedXUsage();
  if (cached) return cached;

  if (isFixtureReplayMode()) {
    console.warn('[X API] Search fixture replay mode enabled — skipping X usage lookup');
    return null;
  }

  if (!isLiveXConfigured()) {
    const missing = X_DATA_SOURCE === 'xmcp' ? 'X_MCP_SERVER_URL' : 'X_BEARER_TOKEN';
    console.warn(`[X API] ${missing} not set — skipping X usage lookup`);
    return null;
  }

  const client = createXClient();
  try {
    const snapshot: XUsageSnapshot = {
      source: X_DATA_SOURCE,
      fetchedAt: new Date().toISOString(),
      data: await client.getUsage(),
    };
    usageCache = { data: snapshot, expiresAt: Date.now() + X_USAGE_CACHE_TTL_MS };
    return snapshot;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.warn(`[X API] usage lookup failed: ${msg}`);
    return null;
  } finally {
    await client.disconnect?.();
  }
}

function extractHashtags(text: string): string[] {
  const matches = text.match(/#[\w぀-ゟ゠-ヿ一-龯]+/g);
  return matches ? [...new Set(matches)] : [];
}
