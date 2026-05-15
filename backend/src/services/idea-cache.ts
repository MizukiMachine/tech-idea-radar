import fs from 'node:fs';
import path from 'node:path';
import {
  DEFAULT_IDEA_COUNT,
  EntrepreneurAgent,
  type IdeaGenerationOutput,
  type SemanticFilterInput,
  type SemanticFilterOutput,
  type TrendScanOutput,
} from 'ai-engine';
import { getClient } from './ai-engine';
import { CACHE_REFRESH_INTERVAL_MS } from 'ai-engine';
import { mergeIdeaHistory } from './idea-history';
import {
  buildSourceUsageHistory,
  mergeSourceUsageHistory,
  sourceUsageForPrompt,
  type SourceUsageRecord,
} from './source-usage';

const SERVER_STARTED_AT = new Date().toISOString();
const INSTANCE_ID = `${process.pid}-${Date.now().toString(36)}`;
const PERSISTENT_CACHE_FILE = process.env.IDEA_CACHE_FILE?.trim() ?? '';
const PUBLIC_READONLY_MODE = isTruthy(process.env.PUBLIC_READONLY_MODE);
const ADMIN_API_TOKEN = process.env.ADMIN_API_TOKEN?.trim() ?? '';
const PERSISTENT_CACHE_VERSION = 1;
const CACHE_TTL_MS = parseHoursToMs(
  process.env.IDEA_CACHE_TTL_HOURS,
  PUBLIC_READONLY_MODE ? 24 * 60 * 60 * 1000 : CACHE_REFRESH_INTERVAL_MS,
);
const WARMUP_ON_START = process.env.IDEA_WARMUP_ON_START === undefined
  ? true
  : isTruthy(process.env.IDEA_WARMUP_ON_START);
const BACKGROUND_REFRESH_INTERVAL_MS = parseHoursToMs(process.env.IDEA_BACKGROUND_REFRESH_HOURS, 0);
const IDEA_GENERATION_BATCH_SIZE = parsePositiveInt(process.env.IDEA_GENERATION_BATCH_SIZE, DEFAULT_IDEA_COUNT);
const IDEA_MAX_STORED_CANDIDATES = parsePositiveInt(process.env.IDEA_MAX_STORED_CANDIDATES, 60);
const IDEA_SOURCE_HISTORY_LIMIT = parsePositiveInt(process.env.IDEA_SOURCE_HISTORY_LIMIT, 240);

type CacheStatus = 'empty' | 'cached' | 'stale';

let cache: {
  data: IdeaGenerationOutput;
  expiresAt: number;
} | null = null;

let generationLock: Promise<IdeaGenerationOutput> | null = null;
let trendCache: {
  data: TrendScanOutput;
  expiresAt: number;
} | null = null;
let trendScanLock: Promise<TrendScanOutput> | null = null;
let sourceUsageHistory: SourceUsageRecord[] = [];
let persistentCacheLoaded = false;
let backgroundRefreshLock: Promise<void> | null = null;
let backgroundRefreshTimer: NodeJS.Timeout | null = null;

function isTruthy(value: string | undefined): boolean {
  return ['1', 'true', 'yes', 'on'].includes((value ?? '').trim().toLowerCase());
}

function parseHoursToMs(value: string | undefined, fallbackMs: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallbackMs;
  return parsed * 60 * 60 * 1000;
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function loadPersistentCache(): void {
  if (persistentCacheLoaded || !PERSISTENT_CACHE_FILE) return;
  persistentCacheLoaded = true;

  try {
    if (!fs.existsSync(PERSISTENT_CACHE_FILE)) return;
    const parsed = JSON.parse(fs.readFileSync(PERSISTENT_CACHE_FILE, 'utf8')) as {
      version?: number;
      ideas?: { data: IdeaGenerationOutput; expiresAt: number };
      trends?: { data: TrendScanOutput; expiresAt: number };
      sourceUsageHistory?: SourceUsageRecord[];
    };

    if (parsed.version !== PERSISTENT_CACHE_VERSION) return;
    if (parsed.ideas?.data && Number.isFinite(parsed.ideas.expiresAt)) cache = parsed.ideas;
    if (parsed.trends?.data && Number.isFinite(parsed.trends.expiresAt)) trendCache = parsed.trends;
    if (Array.isArray(parsed.sourceUsageHistory)) {
      sourceUsageHistory = parsed.sourceUsageHistory.slice(0, IDEA_SOURCE_HISTORY_LIMIT);
    }
    if (sourceUsageHistory.length === 0 && cache?.data.candidates.length) {
      sourceUsageHistory = buildSourceUsageHistory(
        cache.data.candidates,
        cache.data.generatedAt,
        IDEA_SOURCE_HISTORY_LIMIT,
      );
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[Cache] Failed to load persistent cache: ${message}`);
  }
}

function persistCache(): void {
  if (!PERSISTENT_CACHE_FILE) return;

  try {
    fs.mkdirSync(path.dirname(PERSISTENT_CACHE_FILE), { recursive: true });
    fs.writeFileSync(
      PERSISTENT_CACHE_FILE,
      JSON.stringify({
        version: PERSISTENT_CACHE_VERSION,
        updatedAt: new Date().toISOString(),
        ideas: cache,
        trends: trendCache,
        sourceUsageHistory,
      }, null, 2),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[Cache] Failed to persist cache: ${message}`);
  }
}

function isExpired(entry: { expiresAt: number } | null): boolean {
  return Boolean(entry && Date.now() > entry.expiresAt);
}

function cacheStatus(entry: { expiresAt: number } | null): CacheStatus {
  if (!entry) return 'empty';
  return isExpired(entry) ? 'stale' : 'cached';
}

export function getCachedIdeas(): IdeaGenerationOutput | null {
  loadPersistentCache();
  return cache?.data ?? null;
}

export function getCachedTrends(): TrendScanOutput | null {
  loadPersistentCache();
  return trendCache?.data ?? null;
}

export function getIdeaCacheStatus(): CacheStatus {
  loadPersistentCache();
  return cacheStatus(cache);
}

export function getTrendCacheStatus(): CacheStatus {
  loadPersistentCache();
  return cacheStatus(trendCache);
}

export function isPublicReadonlyMode(): boolean {
  return PUBLIC_READONLY_MODE;
}

export function isAdminAuthEnabled(): boolean {
  return Boolean(ADMIN_API_TOKEN);
}

export function isPersistentCacheEnabled(): boolean {
  return Boolean(PERSISTENT_CACHE_FILE);
}

export function getAdminApiToken(): string {
  return ADMIN_API_TOKEN;
}

export function getRuntimeMeta(): {
  instanceId: string;
  pid: number;
  startedAt: string;
  port: string | null;
  env: {
    hasZaiApiKey: boolean;
    publicReadonlyMode: boolean;
    adminAuthEnabled: boolean;
    persistentCacheEnabled: boolean;
    cacheTtlHours: number;
    warmupOnStart: boolean;
    backgroundRefreshIntervalHours: number;
    ideaGenerationBatchSize: number;
    ideaMaxStoredCandidates: number;
    ideaSourceHistoryLimit: number;
  };
  cache: {
    status: CacheStatus;
    expiresAt: string | null;
    generatedAt: string | null;
    candidateCount: number;
    sourceUsageCount: number;
    sourceSummary: IdeaGenerationOutput['sourceSummary'] | null;
  };
  generationInProgress: boolean;
  trendScanInProgress: boolean;
  backgroundRefreshInProgress: boolean;
} {
  const cached = getCachedIdeas();
  const ideaStatus = getIdeaCacheStatus();
  return {
    instanceId: INSTANCE_ID,
    pid: process.pid,
    startedAt: SERVER_STARTED_AT,
    port: process.env.PORT ?? null,
    env: {
      hasZaiApiKey: Boolean(process.env.ZAI_API_KEY),
      publicReadonlyMode: PUBLIC_READONLY_MODE,
      adminAuthEnabled: Boolean(ADMIN_API_TOKEN),
      persistentCacheEnabled: Boolean(PERSISTENT_CACHE_FILE),
      cacheTtlHours: CACHE_TTL_MS / 60 / 60 / 1000,
      warmupOnStart: WARMUP_ON_START,
      backgroundRefreshIntervalHours: BACKGROUND_REFRESH_INTERVAL_MS / 60 / 60 / 1000,
      ideaGenerationBatchSize: IDEA_GENERATION_BATCH_SIZE,
      ideaMaxStoredCandidates: IDEA_MAX_STORED_CANDIDATES,
      ideaSourceHistoryLimit: IDEA_SOURCE_HISTORY_LIMIT,
    },
    cache: cached ? {
      status: ideaStatus,
      expiresAt: cache ? new Date(cache.expiresAt).toISOString() : null,
      generatedAt: cached.generatedAt,
      candidateCount: cached.candidates.length,
      sourceUsageCount: sourceUsageHistory.length,
      sourceSummary: cached.sourceSummary,
    } : {
      status: 'empty',
      expiresAt: null,
      generatedAt: null,
      candidateCount: 0,
      sourceUsageCount: sourceUsageHistory.length,
      sourceSummary: null,
    },
    generationInProgress: Boolean(generationLock),
    trendScanInProgress: Boolean(trendScanLock),
    backgroundRefreshInProgress: Boolean(backgroundRefreshLock),
  };
}

export async function generateAndCacheIdeas(
  onProgress?: (text: string) => void,
  focusKeywords?: string[],
  trendScanOverride?: TrendScanOutput,
): Promise<IdeaGenerationOutput> {
  // If already generating, reuse the same promise
  if (generationLock) return generationLock;

  generationLock = (async () => {
    try {
      loadPersistentCache();
      const existingCandidates = cache?.data.candidates ?? [];
      if (sourceUsageHistory.length === 0 && existingCandidates.length > 0) {
        sourceUsageHistory = buildSourceUsageHistory(
          existingCandidates,
          cache?.data.generatedAt ?? new Date().toISOString(),
          IDEA_SOURCE_HISTORY_LIMIT,
        );
      }
      const recentlyUsedSources = sourceUsageForPrompt(sourceUsageHistory);
      const agent = new EntrepreneurAgent(getClient());
      const result = trendScanOverride && !focusKeywords
        ? await agent.generateIdeasFromTrendScan(
          trendScanOverride,
          onProgress,
          existingCandidates,
          IDEA_GENERATION_BATCH_SIZE,
          recentlyUsedSources,
        )
        : await agent.generateIdeas(
          onProgress,
          focusKeywords,
          existingCandidates,
          IDEA_GENERATION_BATCH_SIZE,
          recentlyUsedSources,
        );
      const merged = mergeIdeaHistory(existingCandidates, result.candidates, {
        maxCandidates: IDEA_MAX_STORED_CANDIDATES,
      });
      const output: IdeaGenerationOutput = {
        ...result,
        candidates: merged.candidates,
        sourceSummary: {
          ...result.sourceSummary,
          generatedIdeaCount: result.candidates.length,
          newIdeaCount: merged.addedCandidates.length,
          duplicateIdeaCount: merged.duplicateCandidates.length,
          totalIdeaCount: merged.candidates.length,
          maxStoredIdeaCount: IDEA_MAX_STORED_CANDIDATES,
          usedSourceUrlCount: sourceUsageHistory.length,
        },
      };
      sourceUsageHistory = mergeSourceUsageHistory(
        sourceUsageHistory,
        merged.addedCandidates,
        output.generatedAt,
        IDEA_SOURCE_HISTORY_LIMIT,
      );
      output.sourceSummary.usedSourceUrlCount = sourceUsageHistory.length;
      cache = {
        data: output,
        expiresAt: Date.now() + CACHE_TTL_MS,
      };
      persistCache();
      return output;
    } finally {
      generationLock = null;
    }
  })();

  return generationLock;
}

export async function scanAndCacheTrends(
  onProgress?: (text: string) => void,
): Promise<TrendScanOutput> {
  if (trendScanLock) return trendScanLock;

  trendScanLock = (async () => {
    try {
      const agent = new EntrepreneurAgent(getClient());
      const result = await agent.scanTrends(onProgress);
      trendCache = {
        data: result,
        expiresAt: Date.now() + CACHE_TTL_MS,
      };
      persistCache();
      return result;
    } finally {
      trendScanLock = null;
    }
  })();

  return trendScanLock;
}

export function refreshCachesInBackground(reason: string, force = false): Promise<void> {
  if (backgroundRefreshLock) return backgroundRefreshLock;

  loadPersistentCache();
  const shouldRefreshTrends = force || !trendCache || isExpired(trendCache);
  const shouldRefreshIdeas = force || !cache || isExpired(cache);

  if (!shouldRefreshTrends && !shouldRefreshIdeas) {
    console.log(`[Cache] Background refresh skipped (${reason}): cache is fresh`);
    return Promise.resolve();
  }

  backgroundRefreshLock = (async () => {
    console.log(`[Cache] Background refresh started (${reason})`);
    let refreshedTrendScan: TrendScanOutput | undefined;
    if (shouldRefreshTrends) {
      refreshedTrendScan = await scanAndCacheTrends();
    }
    if (shouldRefreshIdeas) {
      await generateAndCacheIdeas(undefined, undefined, refreshedTrendScan);
    }
    console.log(`[Cache] Background refresh completed (${reason})`);
  })()
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[Cache] Background refresh failed (${reason}): ${message}`);
    })
    .finally(() => {
      backgroundRefreshLock = null;
    });

  return backgroundRefreshLock;
}

export function startBackgroundCacheRefresh(): void {
  loadPersistentCache();

  if (WARMUP_ON_START) {
    void refreshCachesInBackground('startup');
  }

  if (BACKGROUND_REFRESH_INTERVAL_MS <= 0 || backgroundRefreshTimer) return;

  backgroundRefreshTimer = setInterval(() => {
    void refreshCachesInBackground('scheduled', true);
  }, BACKGROUND_REFRESH_INTERVAL_MS);
  backgroundRefreshTimer.unref?.();
  console.log(`[Cache] Scheduled background refresh every ${BACKGROUND_REFRESH_INTERVAL_MS / 60 / 60 / 1000} hours`);
}

export async function filterCachedIdeas(input: SemanticFilterInput): Promise<SemanticFilterOutput> {
  const agent = new EntrepreneurAgent(getClient());
  return agent.filterIdeas(input);
}
