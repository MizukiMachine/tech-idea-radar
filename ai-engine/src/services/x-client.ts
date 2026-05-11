import type {
  XTweet,
  XTrendingTopic,
  XDemandSignal,
  XCompetitorSentiment,
  XContext,
} from '../types/x-context';

const X_BEARER_TOKEN = process.env.X_BEARER_TOKEN ?? '';
const X_API_BASE = 'https://api.twitter.com/2';
const REQUEST_TIMEOUT_MS = 8000;

// --- In-memory cache (1-hour TTL) ---

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry<unknown>>();

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

function getCached<T>(key: string): T | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return entry.data as T;
}

function setCache<T>(key: string, data: T): void {
  cache.set(key, { data, expiresAt: Date.now() + CACHE_TTL_MS });
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

    const cacheKey = `search:${query}:${maxResults}`;
    const cached = getCached<XTweet[]>(cacheKey);
    if (cached) return cached;

    try {
      const result = await this.request<SearchResponse>('/tweets/search/recent', {
        query: `${query} -is:retweet lang:ja`,
        max_results: String(Math.min(Math.max(maxResults, 10), 100)),
        'tweet.fields': 'created_at,public_metrics,author_id',
        'user.fields': 'name,username',
        expansions: 'author_id',
      });

      if (!result.data) return [];

      const userMap = new Map<string, UserData>();
      for (const u of result.includes?.users ?? []) {
        userMap.set(u.id, u);
      }

      const tweets: XTweet[] = result.data.map((t) => {
        const user = userMap.get(t.author_id ?? '');
        return {
          id: t.id,
          text: t.text,
          author: user?.name ?? 'Unknown',
          authorHandle: user?.username ?? 'unknown',
          likeCount: t.public_metrics?.like_count ?? 0,
          retweetCount: t.public_metrics?.retweet_count ?? 0,
          replyCount: t.public_metrics?.reply_count ?? 0,
          createdAt: t.created_at ?? '',
          url: `https://x.com/${user?.username ?? 'i'}/status/${t.id}`,
        };
      });

      setCache(cacheKey, tweets);
      return tweets;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.warn(`[X API] searchRecentTweets failed: ${msg}`);
      return [];
    }
  }
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

  if (!X_BEARER_TOKEN) {
    console.warn('[X API] X_BEARER_TOKEN not set — skipping X enrichment');
    return empty;
  }

  const client = new XApiClient();

  try {
    // Build query strings
    const trendingQuery = '"AI" OR "SaaS" OR "アプリ" OR "開発" lang:ja min_faves:100';
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
      client.searchRecentTweets(demandQuery, 20),
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
  }
}

function extractHashtags(text: string): string[] {
  const matches = text.match(/#[\w぀-ゟ゠-ヿ一-龯]+/g);
  return matches ? [...new Set(matches)] : [];
}
