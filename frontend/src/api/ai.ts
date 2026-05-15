import type { IdeaCandidate } from '../types/idea-candidate';

const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '');

export function getApiBase(): string {
  return API_BASE || '(same-origin /api)';
}

export interface SourceSummary {
  rssItemCount: number;
  xSignalCount: number;
  usedLLMFallback: boolean;
  dataQuality?: 'external' | 'llm_fallback';
  warnings?: string[];
}

export interface IdeasMeta {
  instanceId: string;
  pid: number;
  startedAt: string;
  port: string | null;
  env: {
    hasZaiApiKey: boolean;
    hasXBearerToken: boolean;
    hasXMcpServerUrl?: boolean;
    xDataSource?: string;
    xIncludeUserFields?: boolean;
    xCacheTtlHours?: number;
    xCacheFileEnabled?: boolean;
    xSearchFixtureMode?: string;
    xSearchFixtureEnabled?: boolean;
    xEnrichmentEnabled?: boolean;
    publicReadonlyMode?: boolean;
    adminAuthEnabled?: boolean;
    persistentCacheEnabled?: boolean;
    cacheTtlHours?: number;
  };
  xUsage?: {
    source: string;
    fetchedAt: string;
    data: unknown;
  } | null;
  cache: {
    status: 'empty' | 'cached';
    expiresAt: string | null;
    generatedAt: string | null;
    candidateCount: number;
    sourceSummary: SourceSummary | null;
  };
  generationInProgress: boolean;
}

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
  keywords?: string[];
}

export interface XTweet {
  id: string;
  text: string;
  author: string;
  authorHandle: string;
  likeCount: number;
  retweetCount: number;
  replyCount: number;
  createdAt: string;
  url: string;
}

export interface XTrendingTopic {
  topic: string;
  tweetVolume: number;
  url: string;
  relatedHashtags: string[];
}

export interface XDemandSignal {
  tweet: XTweet;
  needCategory: 'want' | 'frustration' | 'problem' | 'wish';
  matchedKeywords: string[];
  relevanceScore: number;
}

export interface XCompetitorSentiment {
  competitorName: string;
  tweets: XTweet[];
  sentimentSummary: string;
  keyComplaints: string[];
  keyPraises: string[];
}

export interface TrendScan {
  status: string;
  rssContext: {
    trendingKeywords: RssTrendItem[];
    relatedArticles: RssArticle[];
  };
  xContext: {
    trendingTopics: XTrendingTopic[];
    demandSignals: XDemandSignal[];
    competitorSentiments: XCompetitorSentiment[];
    fetchedAt: string;
  };
  focusKeywords: string[];
  generatedAt: string;
  sourceSummary: SourceSummary;
}

// GET /api/ideas
export async function fetchIdeas(): Promise<{
  status: string;
  candidates: IdeaCandidate[];
  generatedAt: string;
  sourceSummary: SourceSummary;
}> {
  const res = await fetch(`${API_BASE}/api/ai/ideas`);
  if (!res.ok) throw new Error(`fetchIdeas failed: ${res.status}`);
  return res.json();
}

// GET /api/ideas/meta
export async function fetchIdeasMeta(): Promise<IdeasMeta> {
  const res = await fetch(`${API_BASE}/api/ai/ideas/meta`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`fetchIdeasMeta failed: ${res.status}`);
  return res.json();
}

// GET /api/trends
export async function fetchTrends(): Promise<TrendScan> {
  const res = await fetch(`${API_BASE}/api/ai/trends`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`fetchTrends failed: ${res.status}`);
  return res.json();
}

// POST /api/trends/refresh
export async function refreshTrends(): Promise<TrendScan> {
  const res = await fetch(`${API_BASE}/api/ai/trends/refresh`, {
    method: 'POST',
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`refreshTrends failed: ${res.status}`);
  return res.json();
}

// SSE helper for idea generation / refresh streams
function ideaStream(
  url: string,
  method: string,
  callbacks: {
    onProgress?: (text: string) => void;
    onIdeaGenerated: (idea: IdeaCandidate) => void;
    onComplete: (summary: { generatedAt: string; count: number; sourceSummary?: SourceSummary }) => void;
    onError: (error: string) => void;
  },
  body?: Record<string, unknown>,
): AbortController {
  const controller = new AbortController();

  fetch(url, {
    method,
    signal: controller.signal,
    ...(body ? {
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    } : {}),
  })
    .then(async (res) => {
      if (!res.ok) {
        callbacks.onError(`Stream failed: ${res.status}`);
        return;
      }
      const reader = res.body?.getReader();
      if (!reader) { callbacks.onError('No response body'); return; }

      const decoder = new TextDecoder();
      let buffer = '';
      let currentEvent = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (line.startsWith('event: ')) {
            currentEvent = line.slice(7).trim();
          } else if (line.startsWith('data: ')) {
            try {
              const parsed = JSON.parse(line.slice(6));
              if (currentEvent === 'generation_progress') callbacks.onProgress?.(parsed.text);
              else if (currentEvent === 'idea_generated') callbacks.onIdeaGenerated(parsed);
              else if (currentEvent === 'generation_complete') callbacks.onComplete(parsed);
              else if (currentEvent === 'error') callbacks.onError(parsed.error || 'Unknown error');
            } catch { /* skip */ }
            currentEvent = '';
          }
        }
      }
    })
    .catch((err) => {
      if (err.name !== 'AbortError') callbacks.onError(err.message);
    });

  return controller;
}

// GET /api/ideas/stream
export function streamIdeas(callbacks: Parameters<typeof ideaStream>[2]): AbortController {
  return ideaStream(`${API_BASE}/api/ai/ideas/stream`, 'GET', callbacks);
}

// POST /api/ideas/filter
export async function filterIdeas(query: string, topK?: number): Promise<{
  filteredCandidates: IdeaCandidate[];
  filterReasoning: string;
  matchCriteria: string[];
}> {
  const res = await fetch(`${API_BASE}/api/ai/ideas/filter`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, topK }),
  });
  if (!res.ok) throw new Error(`filterIdeas failed: ${res.status}`);
  return res.json();
}

// POST /api/ideas/refresh
export function refreshIdeas(callbacks: Parameters<typeof ideaStream>[2], focusKeyword?: string): AbortController {
  return ideaStream(
    `${API_BASE}/api/ai/ideas/refresh`,
    'POST',
    callbacks,
    focusKeyword ? { focusKeyword } : undefined,
  );
}
