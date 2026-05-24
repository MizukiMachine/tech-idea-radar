import type { IdeaCandidate } from '../types/idea-candidate';

const EXPECTED_DEV_STACK_ID = (import.meta.env.VITE_DEV_STACK_ID ?? '').trim();
const RAW_API_BASE = normalizeApiBase(import.meta.env.VITE_API_BASE_URL ?? '');
const API_BASE = EXPECTED_DEV_STACK_ID ? '' : RAW_API_BASE;
const ALLOWED_API_BASES = String(import.meta.env.VITE_ALLOWED_API_BASES ?? '')
  .split(',')
  .map((value: string) => normalizeApiBase(value.trim()))
  .filter(Boolean);
const BACKEND_SERVICE_NAME = 'builder-agent-chain-backend';
const HEALTH_CHECK_TIMEOUT_MS = 5_000;

export function getApiBase(): string {
  return API_BASE || '(same-origin /api)';
}

export function getExpectedDevStackId(): string {
  return EXPECTED_DEV_STACK_ID;
}

interface BackendHealth {
  status?: string;
  service?: string;
  config?: {
    requireDevStackHeader?: boolean;
  };
  process?: {
    devStackId?: string | null;
  };
}

function devStackError(message: string): Error {
  return new Error(`DEV_STACK_MISMATCH: ${message}`);
}

function normalizeApiBase(value: string): string {
  if (!value) return '';
  try {
    const url = new URL(value);
    url.hash = '';
    url.pathname = url.pathname.replace(/\/+$/, '');
    if (url.pathname === '/') url.pathname = '';
    return url.toString().replace(/\/$/, '');
  } catch {
    return value.replace(/\/$/, '');
  }
}

function assertApiBaseAllowed(): void {
  if (EXPECTED_DEV_STACK_ID || !RAW_API_BASE) return;
  if (ALLOWED_API_BASES.includes(normalizeApiBase(RAW_API_BASE))) return;
  throw devStackError(
    `explicit VITE_API_BASE_URL=${RAW_API_BASE} is not allowed without VITE_DEV_STACK_ID unless VITE_ALLOWED_API_BASES includes the exact URL. Use same-origin /api, npm run dev, or npm run preview:stack so the frontend and backend are verified together.`,
  );
}

async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    window.clearTimeout(timeout);
  }
}

async function assertBackendConnection(): Promise<void> {
  if (!EXPECTED_DEV_STACK_ID) return;

  let res: Response;
  try {
    res = await fetchWithTimeout(`${API_BASE}/health`, { cache: 'no-store' }, HEALTH_CHECK_TIMEOUT_MS);
  } catch (error) {
    const message = error instanceof DOMException && error.name === 'AbortError'
      ? `timed out after ${HEALTH_CHECK_TIMEOUT_MS}ms`
      : error instanceof Error ? error.message : String(error);
    throw devStackError(`backend health check failed (${message})`);
  }

  if (!res.ok) {
    throw devStackError(`backend health check returned HTTP ${res.status}`);
  }

  let health: BackendHealth;
  try {
    health = await res.json() as BackendHealth;
  } catch {
    throw devStackError('backend health check did not return JSON');
  }

  if (health.status !== 'ok' || health.service !== BACKEND_SERVICE_NAME) {
    throw devStackError('backend health check did not identify the expected service');
  }

  const actualStackId = health.process?.devStackId ?? null;
  if (actualStackId !== EXPECTED_DEV_STACK_ID) {
    throw devStackError(`expected ${EXPECTED_DEV_STACK_ID}, got ${actualStackId ?? 'none'}`);
  }

  if (health.config?.requireDevStackHeader !== true) {
    throw devStackError('backend is not enforcing the local dev-stack API boundary');
  }
}

async function apiFetch(path: string, label: string, init?: RequestInit): Promise<Response> {
  assertApiBaseAllowed();
  await assertBackendConnection();
  const res = await fetch(`${API_BASE}${path}`, init);
  if (!res.ok) await throwApiError(res, label);
  return res;
}

async function throwApiError(res: Response, label: string): Promise<never> {
  let message = `${label} failed: ${res.status}`;
  try {
    const body = await res.json() as { error?: string; message?: string };
    if (body.error && body.message) message = `${body.error}: ${body.message}`;
    else if (body.error) message = body.error;
    else if (body.message) message = body.message;
  } catch {
    // Keep the status-based message when the response is not JSON.
  }
  throw new Error(message);
}

export interface SourceSummary {
  rssItemCount: number;
  usedLLMFallback: boolean;
  dataQuality?: 'external';
  warnings?: string[];
}

export interface BatchInfo {
  batchTime: string;
  generatedAt: string;
  ideaCount: number;
}

export function formatBatchLabel(batchTime: string): string {
  // batchTime format: "2026-05-16T08:00:00+09:00"
  try {
    const date = new Date(batchTime);
    if (Number.isNaN(date.getTime())) return batchTime;
    return date.toLocaleString('ja-JP', {
      timeZone: 'Asia/Tokyo',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  } catch {
    return batchTime;
  }
}

export interface IdeasMeta {
  instanceId: string;
  pid: number;
  startedAt: string;
  port: string | null;
  env: {
    hasZaiApiKey: boolean;
    publicReadonlyMode?: boolean;
    adminAuthEnabled?: boolean;
    persistentCacheEnabled?: boolean;
    warmupOnStart?: boolean;
    ideaGenerationBatchSize?: number;
    ideaDetailRequestConcurrency?: number;
    ideaDetailRequestRetries?: number;
    ideaDetailRequestTimeoutMs?: number;
    ideaDetailTotalTimeoutMs?: number;
    ideaDetailRetryDelayMs?: number;
    ideaDetailRetryMaxDelayMs?: number;
    ideaSeedRequestTimeoutMs?: number;
    ideaFallbackRequestTimeoutMs?: number;
    featuredIdeaSelectionTimeoutMs?: number;
    rssTopicClusteringTimeoutMs?: number;
    rssSummaryRequestTimeoutMs?: number;
    ideaRetentionWindowHours?: number;
    batchScheduleHours?: number[];
    maxBatches?: number;
    trendHistoryWindowHours?: number;
    maxTrendHistory?: number;
  };
  cache: {
    status: 'empty' | 'cached' | 'stale';
    generatedAt: string | null;
    candidateCount: number;
    batchCount: number;
    sourceSummary: SourceSummary | null;
  };
  generationInProgress: boolean;
  trendScanInProgress?: boolean;
  backgroundRefreshInProgress?: boolean;
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
  sourceUrl?: string;
  keywords?: string[];
  topicKey?: string;
  topicStatus?: RssTopicStatus;
  firstSeenAt?: string;
  lastSeenAt?: string;
  topicArticleCount?: number;
  topicSourceCount?: number;
}

export type RssTopicStatus = 'new' | 'spiking' | 'continuing' | 'stale';

export interface RssTopicArticle {
  title: string;
  link?: string;
  url?: string;
  source: string;
  publishedAt?: string;
  firstSeenAt: string;
  summary?: string;
}

export interface RssTopicCluster {
  topic: string;
  label: string;
  status: RssTopicStatus;
  score: number;
  articleCount: number;
  sourceCount: number;
  sources: string[];
  firstSeenAt: string;
  lastSeenAt: string;
  recentCount: number;
  previousCount: number;
  representativeArticles: RssTopicArticle[];
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

export interface RssArticleSummaryPolicy {
  minItems: number;
  maxItems: number;
  minTotalChars: number;
  maxTotalChars: number;
  maxItemChars: number;
  minJapaneseChars: number;
  minJapaneseToLatinRatio: number;
}

export const DEFAULT_RSS_ARTICLE_SUMMARY_POLICY: RssArticleSummaryPolicy = {
  minItems: 3,
  maxItems: 5,
  minTotalChars: 240,
  maxTotalChars: 1200,
  maxItemChars: 260,
  minJapaneseChars: 120,
  minJapaneseToLatinRatio: 0.35,
};

export interface TrendScan {
  status: string;
  rssContext: {
    trendingKeywords: RssTrendItem[];
    relatedArticles: RssArticle[];
    topicClusters?: RssTopicCluster[];
    sourceErrors?: RssSourceError[];
    summaryErrors?: RssSummaryError[];
    observationWarning?: string;
  };
  focusKeywords: string[];
  generatedAt: string;
  batchTime?: string;
  sourceSummary: SourceSummary;
  summaryPolicy: RssArticleSummaryPolicy;
  summaryPolicySource?: 'api' | 'default';
}

export interface TrendHistoryEntry {
  scannedAt: string;
  generatedAt: string;
  articleCount: number;
  keywordCount: number;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isRssArticleSummaryPolicy(value: unknown): value is RssArticleSummaryPolicy {
  if (!value || typeof value !== 'object') return false;
  const policy = value as Record<string, unknown>;
  return isFiniteNumber(policy.minItems)
    && isFiniteNumber(policy.maxItems)
    && isFiniteNumber(policy.minTotalChars)
    && isFiniteNumber(policy.maxTotalChars)
    && isFiniteNumber(policy.maxItemChars)
    && isFiniteNumber(policy.minJapaneseChars)
    && isFiniteNumber(policy.minJapaneseToLatinRatio);
}

function normalizeTrendScan(value: TrendScan): TrendScan {
  const summaryPolicy = isRssArticleSummaryPolicy(value.summaryPolicy)
    ? value.summaryPolicy
    : DEFAULT_RSS_ARTICLE_SUMMARY_POLICY;

  return {
    ...value,
    summaryPolicy,
    summaryPolicySource: summaryPolicy === value.summaryPolicy ? 'api' : 'default',
  };
}

// GET /api/ideas
export async function fetchIdeas(): Promise<{
  status: string;
  candidates: IdeaCandidate[];
  featuredIdea?: IdeaCandidate;
  generatedAt: string;
  sourceSummary: SourceSummary;
  batches: BatchInfo[];
}> {
  const res = await apiFetch('/api/ai/ideas', 'fetchIdeas');
  return res.json();
}

// GET /api/ideas/meta
export async function fetchIdeasMeta(): Promise<IdeasMeta> {
  const res = await apiFetch('/api/ai/ideas/meta', 'fetchIdeasMeta', { cache: 'no-store' });
  return res.json();
}

// GET /api/trends
export async function fetchTrends(): Promise<TrendScan> {
  const res = await apiFetch('/api/ai/trends', 'fetchTrends', { cache: 'no-store' });
  return normalizeTrendScan(await res.json() as TrendScan);
}

// GET /api/trends/history
export async function fetchTrendHistory(): Promise<{ history: TrendHistoryEntry[] }> {
  const res = await apiFetch('/api/ai/trends/history', 'fetchTrendHistory', { cache: 'no-store' });
  return res.json();
}

// GET /api/trends/history/:index
export async function fetchTrendSnapshot(index: number): Promise<TrendScan> {
  const res = await apiFetch(`/api/ai/trends/history/${index}`, 'fetchTrendSnapshot', { cache: 'no-store' });
  return normalizeTrendScan(await res.json() as TrendScan);
}

// POST /api/trends/refresh
export async function refreshTrends(): Promise<TrendScan> {
  const res = await apiFetch('/api/ai/trends/refresh', 'refreshTrends', {
    method: 'POST',
    cache: 'no-store',
  });
  return normalizeTrendScan(await res.json() as TrendScan);
}

// SSE helper for idea generation / refresh streams
function ideaStream(
  path: string,
  method: string,
 callbacks: {
    onProgress?: (text: string) => void;
    onIdeaGenerated: (idea: IdeaCandidate) => void;
    onComplete: (summary: {
      generatedAt: string;
      count: number;
      featuredIdea?: IdeaCandidate;
      sourceSummary?: SourceSummary;
      batches?: BatchInfo[];
    }) => void;
    onError: (error: string) => void;
  },
  body?: Record<string, unknown>,
): AbortController {
  const controller = new AbortController();

  void (async () => {
    await assertBackendConnection();
    const res = await fetch(`${API_BASE}${path}`, {
      method,
      signal: controller.signal,
      ...(body ? {
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      } : {}),
    });

    if (!res.ok) {
      await throwApiError(res, 'streamIdeas');
    }

    return res;
  })()
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
  return ideaStream('/api/ai/ideas/stream', 'GET', callbacks);
}

// POST /api/ideas/filter
export async function filterIdeas(query: string, candidates: IdeaCandidate[], topK?: number): Promise<{
  filteredCandidates: IdeaCandidate[];
  filterReasoning: string;
  matchCriteria: string[];
}> {
  const res = await apiFetch('/api/ai/ideas/filter', 'filterIdeas', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, candidates, topK }),
  });
  return res.json();
}

// POST /api/ideas/refresh
export function refreshIdeas(callbacks: Parameters<typeof ideaStream>[2], focusKeyword?: string): AbortController {
  return ideaStream(
    '/api/ai/ideas/refresh',
    'POST',
    callbacks,
    focusKeyword ? { focusKeyword } : undefined,
  );
}
