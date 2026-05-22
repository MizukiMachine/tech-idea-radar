import fs from 'node:fs';
import path from 'node:path';
import {
  DEFAULT_IDEA_COUNT,
  MAX_BATCHES,
  BATCH_SCHEDULE_HOURS_JST,
  MAX_TREND_HISTORY,
  RSS_ARTICLE_SUMMARY_POLICY,
  EntrepreneurAgent,
  isRssSourceUnavailableError,
  type IdeaGenerationOutput,
  type SemanticFilterInput,
  type SemanticFilterOutput,
  type TrendScanOutput,
} from 'ai-engine';
import { getClient } from './ai-engine';
import { dedupeWithinBatch } from './idea-history';
import { notifyAdminOfRssFailure } from './admin-notifier';

const SERVER_STARTED_AT = new Date().toISOString();
const INSTANCE_ID = `${process.pid}-${Date.now().toString(36)}`;
const PERSISTENT_CACHE_FILE = process.env.IDEA_CACHE_FILE?.trim() ?? '';
const CACHE_DISABLED = isTruthy(process.env.IDEA_CACHE_DISABLED);
const FILE_CACHE_DISABLED = CACHE_DISABLED || !PERSISTENT_CACHE_FILE;
const PUBLIC_READONLY_MODE = isTruthy(process.env.PUBLIC_READONLY_MODE);
const ADMIN_API_TOKEN = process.env.ADMIN_API_TOKEN?.trim() ?? '';
const PERSISTENT_CACHE_VERSION = 3;
const TREND_CACHE_TTL_MS = 4 * 60 * 60 * 1000;
const WARMUP_ON_START = process.env.IDEA_WARMUP_ON_START === undefined
  ? true
  : isTruthy(process.env.IDEA_WARMUP_ON_START);
const IDEA_GENERATION_BATCH_SIZE = parsePositiveInt(process.env.IDEA_GENERATION_BATCH_SIZE, DEFAULT_IDEA_COUNT);

// --- Batch data structure ---

interface BatchEntry {
  batchTime: string;
  data: IdeaGenerationOutput;
}

let batches: BatchEntry[] = [];

type CacheStatus = 'empty' | 'cached' | 'stale';

let generationLock: Promise<IdeaGenerationOutput> | null = null;

// --- Trend history data structure ---

interface TrendHistoryEntry {
  scannedAt: string;
  data: TrendScanOutput;
}

let trendHistory: TrendHistoryEntry[] = [];
let trendScanLock: Promise<TrendScanOutput> | null = null;
let persistentCacheLoaded = false;
let persistentCacheMtimeMs = 0;
let backgroundRefreshLock: Promise<void> | null = null;
let batchScheduleTimer: NodeJS.Timeout | null = null;

// --- Utility functions ---

function isTruthy(value: string | undefined): boolean {
  return ['1', 'true', 'yes', 'on'].includes((value ?? '').trim().toLowerCase());
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return fallback;
  return parsed;
}

// --- JST schedule helpers ---

function toJST(date: Date): Date {
  // Convert UTC to JST (UTC+9)
  return new Date(date.getTime() + 9 * 60 * 60 * 1000);
}

function getNextScheduledBatchTime(now: Date): Date {
  const jst = toJST(now);
  const jstHour = jst.getUTCHours();
  const scheduleHours = [...BATCH_SCHEDULE_HOURS_JST];

  // Find the next scheduled hour in JST
  let targetHour = scheduleHours.find((h) => h > jstHour);
  const targetDate = new Date(jst);

  if (targetHour === undefined) {
    // No more slots today — use first slot tomorrow
    targetHour = scheduleHours[0];
    targetDate.setUTCDate(targetDate.getUTCDate() + 1);
  }

  targetDate.setUTCHours(targetHour, 0, 0, 0);

  // Convert back from JST to UTC
  return new Date(targetDate.getTime() - 9 * 60 * 60 * 1000);
}

function formatBatchTimeJST(jst: Date): string {
  const year = jst.getUTCFullYear();
  const month = String(jst.getUTCMonth() + 1).padStart(2, '0');
  const day = String(jst.getUTCDate()).padStart(2, '0');
  const hour = String(jst.getUTCHours()).padStart(2, '0');
  return `${year}-${month}-${day}T${hour}:00:00+09:00`;
}

function getCurrentBatchTimeJST(now: Date): string {
  const jst = toJST(now);
  const jstHour = jst.getUTCHours();
  const scheduleHours = [...BATCH_SCHEDULE_HOURS_JST];

  let currentHour = 0;
  for (const h of scheduleHours) {
    if (h <= jstHour) currentHour = h;
    else break;
  }

  const batchDate = new Date(jst);
  batchDate.setUTCHours(currentHour, 0, 0, 0);
  return formatBatchTimeJST(batchDate);
}

function getActualBatchTimeJST(now: Date): string {
  const batchDate = toJST(now);
  batchDate.setUTCMinutes(0, 0, 0);
  return formatBatchTimeJST(batchDate);
}

function scheduleNextBatch(): void {
  const now = new Date();
  const next = getNextScheduledBatchTime(now);
  const delay = Math.max(next.getTime() - now.getTime(), 1000);

  batchScheduleTimer = setTimeout(() => {
    void refreshCachesInBackground('scheduled-batch', true)
      .finally(() => {
        scheduleNextBatch();
      });
  }, delay);
  batchScheduleTimer.unref?.();

  console.log(`[Cache] Next batch scheduled at ${next.toISOString()} (in ${Math.round(delay / 60000)}min)`);
}

// --- Persistent cache ---

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object');
}

function isPersistentBatchEntry(value: unknown): value is BatchEntry {
  if (!isRecord(value) || typeof value.batchTime !== 'string' || !isRecord(value.data)) return false;
  return Array.isArray(value.data.candidates)
    && typeof value.data.generatedAt === 'string'
    && isRecord(value.data.sourceSummary);
}

function isPersistentTrendScanOutput(value: unknown): value is TrendScanOutput {
  if (!isRecord(value) || !isRecord(value.rssContext)) return false;
  return Array.isArray(value.rssContext.trendingKeywords)
    && Array.isArray(value.rssContext.relatedArticles)
    && Array.isArray(value.focusKeywords)
    && typeof value.generatedAt === 'string'
    && isRecord(value.sourceSummary);
}

function withSummaryPolicy(data: TrendScanOutput): TrendScanOutput {
  const { featuredTrend: _featuredTrend, ...cleanData } = data as TrendScanOutput & { featuredTrend?: unknown };
  return {
    ...cleanData,
    summaryPolicy: cleanData.summaryPolicy ?? RSS_ARTICLE_SUMMARY_POLICY,
  };
}

function isPersistentTrendHistoryEntry(value: unknown): value is TrendHistoryEntry {
  return isRecord(value)
    && typeof value.scannedAt === 'string'
    && isPersistentTrendScanOutput(value.data);
}

function isPersistentV2TrendCache(value: unknown): value is { data: TrendScanOutput; expiresAt: number } {
  if (!isRecord(value)) return false;
  return isPersistentTrendScanOutput(value.data)
    && typeof value.expiresAt === 'number'
    && Number.isFinite(value.expiresAt);
}

function loadPersistentCache(): void {
  if (FILE_CACHE_DISABLED) return;

  try {
    const stat = fs.statSync(PERSISTENT_CACHE_FILE);
    if (persistentCacheLoaded && stat.mtimeMs <= persistentCacheMtimeMs) return;

    const raw = JSON.parse(fs.readFileSync(PERSISTENT_CACHE_FILE, 'utf8')) as Record<string, unknown>;
    const version = typeof raw.version === 'number' ? raw.version : 0;
    let nextBatches: BatchEntry[] = [];
    let nextTrendHistory: TrendHistoryEntry[] = [];
    let migrated = false;

    if (version === PERSISTENT_CACHE_VERSION) {
      // v3: batch-based cache + trend history
      nextBatches = Array.isArray(raw.batches)
        ? raw.batches.filter(isPersistentBatchEntry).slice(0, MAX_BATCHES)
        : [];
      nextTrendHistory = Array.isArray(raw.trendHistory)
        ? raw.trendHistory.filter(isPersistentTrendHistoryEntry).slice(0, MAX_TREND_HISTORY)
        : [];
    } else if (version === 2) {
      // v2 → v3 migration: convert single trendCache to trendHistory[0]
      migrated = true;
      nextBatches = Array.isArray(raw.batches)
        ? raw.batches.filter(isPersistentBatchEntry).slice(0, MAX_BATCHES)
        : [];
      const v2TrendCache = isPersistentV2TrendCache(raw.trends) ? raw.trends : null;
      if (v2TrendCache) {
        nextTrendHistory = [{ scannedAt: v2TrendCache.data.generatedAt, data: v2TrendCache.data }];
      }
    } else if (version === 1) {
      // v1 migration: convert single cache to a single batch entry
      migrated = true;
      const v1 = raw as {
        version?: number;
        ideas?: { data: IdeaGenerationOutput; expiresAt: number };
        trends?: { data: TrendScanOutput; expiresAt: number };
      };
      if (isPersistentV2TrendCache(v1.trends)) {
        nextTrendHistory = [{ scannedAt: v1.trends.data.generatedAt, data: v1.trends.data }];
      }
      if (v1.ideas?.data?.candidates?.length) {
        const batchTime = getCurrentBatchTimeJST(new Date(v1.ideas.data.generatedAt));
        const migrated: IdeaGenerationOutput = {
          ...v1.ideas.data,
          batchTime,
          candidates: v1.ideas.data.candidates.map((c) => ({ ...c, batchTime })),
        };
        nextBatches = [{ batchTime, data: migrated }];
      }
    }

    batches = nextBatches;
    trendHistory = nextTrendHistory.map((entry) => ({
      ...entry,
      data: withSummaryPolicy(entry.data),
    }));
    persistentCacheLoaded = true;
    persistentCacheMtimeMs = stat.mtimeMs;

    if (migrated) {
      console.log('[Cache] Persistent cache migrated to v3');
      persistCache();
    }
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return;
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[Cache] Failed to load persistent cache: ${message}`);
  }
}

function persistCache(): void {
  if (FILE_CACHE_DISABLED) return;

  try {
    fs.mkdirSync(path.dirname(PERSISTENT_CACHE_FILE), { recursive: true });
    const tmpFile = `${PERSISTENT_CACHE_FILE}.tmp.${process.pid}`;
    fs.writeFileSync(
      tmpFile,
      JSON.stringify({
        version: PERSISTENT_CACHE_VERSION,
        updatedAt: new Date().toISOString(),
        batches,
        trendHistory,
      }, null, 2),
    );
    fs.renameSync(tmpFile, PERSISTENT_CACHE_FILE);
    persistentCacheLoaded = true;
    persistentCacheMtimeMs = fs.statSync(PERSISTENT_CACHE_FILE).mtimeMs;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[Cache] Failed to persist cache: ${message}`);
  }
}

function isTrendEntryStale(entry: TrendHistoryEntry | null): boolean {
  if (!entry) return true;
  const scannedAt = new Date(entry.scannedAt).getTime();
  return Number.isNaN(scannedAt) || Date.now() - scannedAt > TREND_CACHE_TTL_MS;
}

function isBackgroundCacheOwner(): boolean {
  const instanceId = process.env.NODE_APP_INSTANCE;
  return instanceId === undefined || instanceId === '0';
}

async function waitWithTimeout(job: Promise<void>, timeoutMs: number, message: string): Promise<void> {
  let timer: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      job,
      new Promise<void>((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function notifyRssSourceFailure(error: unknown, fallbackOperation: string): Promise<void> {
  if (!isRssSourceUnavailableError(error)) return;

  try {
    await notifyAdminOfRssFailure({
      operation: error.details.operation ?? fallbackOperation,
      errorMessage: error.message,
      occurredAt: new Date().toISOString(),
      details: error.details,
      ideaCacheGeneratedAt: batches[0]?.data.generatedAt ?? null,
      trendCacheGeneratedAt: latestTrend()?.data.generatedAt ?? null,
    });
  } catch (notifyError) {
    const message = notifyError instanceof Error ? notifyError.message : String(notifyError);
    console.warn(`[AdminNotifier] Failed to send RSS failure alert: ${message}`);
  }
}

function trendSourceNames(result: TrendScanOutput): string[] {
  const articleSources = result.rssContext.relatedArticles
    .map((article) => article.source)
    .filter(Boolean);
  const failedSources = result.rssContext.sourceErrors
    ?.map((error) => error.source)
    .filter(Boolean) ?? [];
  const summarySources = result.rssContext.summaryErrors
    ?.map((error) => error.source)
    .filter(Boolean) ?? [];
  return [...new Set([...articleSources, ...failedSources, ...summarySources])];
}

async function notifyTrendSummaryFailures(result: TrendScanOutput): Promise<void> {
  const summaryErrors = result.rssContext.summaryErrors ?? [];
  if (summaryErrors.length === 0) return;

  try {
    await notifyAdminOfRssFailure({
      operation: 'trend_summary',
      errorMessage: `RSS記事の要約生成または日本語変換に失敗した${summaryErrors.length}件を除外しました。`,
      occurredAt: new Date().toISOString(),
      details: {
        operation: 'trend_summary',
        focusKeywords: result.focusKeywords,
        rssArticleCount: result.rssContext.relatedArticles.length,
        trendingKeywordCount: result.rssContext.trendingKeywords.length,
        sourceNames: trendSourceNames(result),
        sourceErrors: result.rssContext.sourceErrors,
        summaryErrors,
        summaryFailureCount: summaryErrors.length,
      },
      ideaCacheGeneratedAt: batches[0]?.data.generatedAt ?? null,
      trendCacheGeneratedAt: latestTrend()?.data.generatedAt ?? null,
    });
  } catch (notifyError) {
    const message = notifyError instanceof Error ? notifyError.message : String(notifyError);
    console.warn(`[AdminNotifier] Failed to send RSS summary alert: ${message}`);
  }
}

// --- Public getters ---

export function getCachedIdeas(): IdeaGenerationOutput | null {
  loadPersistentCache();
  if (batches.length === 0) return null;

  // Flatten all batches into a single output
  const allCandidates = batches.flatMap((b) => b.data.candidates);
  const latestGeneratedAt = batches[0].data.generatedAt;
  const latestSourceSummary = batches[0].data.sourceSummary;
  const featuredIdea = batches[0].data.featuredIdea;

  return {
    candidates: allCandidates,
    featuredIdea,
    generatedAt: latestGeneratedAt,
    sourceSummary: latestSourceSummary,
  };
}

// Helper to get the latest trend entry
function latestTrend(): TrendHistoryEntry | null {
  loadPersistentCache();
  return trendHistory[0] ?? null;
}

export function getCachedTrends(): TrendScanOutput | null {
  const latest = latestTrend();
  return latest ? withSummaryPolicy(latest.data) : null;
}

export function getIdeaCacheStatus(): CacheStatus {
  loadPersistentCache();
  if (batches.length === 0) return 'empty';
  return 'cached';
}

export function getTrendCacheStatus(): CacheStatus {
  loadPersistentCache();
  const latest = latestTrend();
  if (!latest) return 'empty';
  return isTrendEntryStale(latest) ? 'stale' : 'cached';
}

export function isPublicReadonlyMode(): boolean {
  return PUBLIC_READONLY_MODE;
}

export function isGenerationInProgress(): boolean {
  return Boolean(generationLock);
}

export function isCacheActivityInProgress(): boolean {
  return Boolean(generationLock || trendScanLock || backgroundRefreshLock);
}

export async function waitForGeneration(timeoutMs: number): Promise<void> {
  if (!generationLock) return;
  await waitWithTimeout(
    generationLock.then(() => undefined, () => undefined),
    timeoutMs,
    'Generation wait timed out',
  );
}

export async function waitForCacheActivity(timeoutMs: number): Promise<void> {
  const active: Promise<unknown>[] = [];
  if (backgroundRefreshLock) active.push(backgroundRefreshLock);
  if (trendScanLock) active.push(trendScanLock);
  if (generationLock) active.push(generationLock);
  if (active.length === 0) return;

  await waitWithTimeout(
    Promise.allSettled(active).then(() => undefined),
    timeoutMs,
    'Cache activity wait timed out',
  );
}

export function isAdminAuthEnabled(): boolean {
  return Boolean(ADMIN_API_TOKEN);
}

export function isPersistentCacheEnabled(): boolean {
  return !FILE_CACHE_DISABLED;
}

export function isCacheDisabled(): boolean {
  return CACHE_DISABLED;
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
    warmupOnStart: boolean;
    ideaGenerationBatchSize: number;
    batchScheduleHours: readonly number[];
    maxBatches: number;
    maxTrendHistory: number;
  };
  cache: {
    status: CacheStatus;
    generatedAt: string | null;
    candidateCount: number;
    batchCount: number;
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
      persistentCacheEnabled: isPersistentCacheEnabled(),
      warmupOnStart: WARMUP_ON_START,
      ideaGenerationBatchSize: IDEA_GENERATION_BATCH_SIZE,
      batchScheduleHours: BATCH_SCHEDULE_HOURS_JST,
      maxBatches: MAX_BATCHES,
      maxTrendHistory: MAX_TREND_HISTORY,
    },
    cache: cached ? {
      status: ideaStatus,
      generatedAt: cached.generatedAt,
      candidateCount: cached.candidates.length,
      batchCount: batches.length,
      sourceSummary: cached.sourceSummary,
    } : {
      status: 'empty',
      generatedAt: null,
      candidateCount: 0,
      batchCount: 0,
      sourceSummary: null,
    },
    generationInProgress: Boolean(generationLock),
    trendScanInProgress: Boolean(trendScanLock),
    backgroundRefreshInProgress: Boolean(backgroundRefreshLock),
  };
}

// --- Batch metadata for API ---

export interface BatchInfoApi {
  batchTime: string;
  generatedAt: string;
  ideaCount: number;
}

export function getBatchInfos(): BatchInfoApi[] {
  loadPersistentCache();
  return batches.map((b) => ({
    batchTime: b.batchTime,
    generatedAt: b.data.generatedAt,
    ideaCount: b.data.candidates.length,
  }));
}

// --- Trend history metadata for API ---

export interface TrendHistoryEntryApi {
  scannedAt: string;
  generatedAt: string;
  articleCount: number;
  keywordCount: number;
}

export function getTrendHistory(): TrendHistoryEntryApi[] {
  loadPersistentCache();
  return trendHistory.map((entry) => ({
    scannedAt: entry.scannedAt,
    generatedAt: entry.data.generatedAt,
    articleCount: entry.data.rssContext.relatedArticles.length,
    keywordCount: entry.data.rssContext.trendingKeywords.length,
  }));
}

export function getCachedTrendByIndex(index: number): TrendScanOutput | null {
  loadPersistentCache();
  if (index < 0 || index >= trendHistory.length) return null;
  return withSummaryPolicy(trendHistory[index].data);
}

// --- Generation ---

export async function generateAndCacheIdeas(
  onProgress?: (text: string) => void,
  focusKeywords?: string[],
  trendScanOverride?: TrendScanOutput,
  useScheduleSlot = true,
): Promise<IdeaGenerationOutput> {
  // If already generating, reuse the same promise
  if (generationLock) return generationLock;

  generationLock = (async () => {
    try {
      loadPersistentCache();
      const now = new Date();
      const batchTime = useScheduleSlot ? getCurrentBatchTimeJST(now) : getActualBatchTimeJST(now);
      const agent = new EntrepreneurAgent(getClient());
      const trendScanForIdeas = trendScanOverride ?? (!focusKeywords ? latestTrend()?.data : undefined);
      const result = trendScanForIdeas && !focusKeywords
        ? await agent.generateIdeasFromTrendScan(
          withSummaryPolicy(trendScanForIdeas),
          onProgress,
          IDEA_GENERATION_BATCH_SIZE,
          batchTime,
        )
        : await agent.generateIdeas(
          onProgress,
          focusKeywords,
          IDEA_GENERATION_BATCH_SIZE,
          batchTime,
        );

      // Dedupe within this batch only
      const deduped = dedupeWithinBatch(result.candidates);

      const batchOutput: IdeaGenerationOutput = {
        ...result,
        candidates: deduped,
        batchTime,
        sourceSummary: {
          ...result.sourceSummary,
        },
      };

      // Replace same-slot batch or prepend, trim to MAX_BATCHES
      batches = [
        { batchTime, data: batchOutput },
        ...batches.filter((b) => b.batchTime !== batchTime),
      ].slice(0, MAX_BATCHES);

      persistCache();
      return batchOutput;
    } catch (error) {
      await notifyRssSourceFailure(error, 'idea_generation');
      throw error;
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
      const result = withSummaryPolicy(await agent.scanTrends(onProgress));
      const now = new Date().toISOString();

      // Prepend to history, deduplicate by generatedAt, trim to MAX_TREND_HISTORY
      trendHistory = [
        { scannedAt: now, data: result },
        ...trendHistory.filter((e) => e.data.generatedAt !== result.generatedAt),
      ].slice(0, MAX_TREND_HISTORY);

      persistCache();
      await notifyTrendSummaryFailures(result);
      return result;
    } catch (error) {
      await notifyRssSourceFailure(error, 'trend_scan');
      throw error;
    } finally {
      trendScanLock = null;
    }
  })();

  return trendScanLock;
}

export function refreshCachesInBackground(reason: string, force = false, useScheduleSlot = true): Promise<void> {
  if (backgroundRefreshLock) return backgroundRefreshLock;

  loadPersistentCache();
  const latest = latestTrend();
  const isTrendStale = isTrendEntryStale(latest);
  const shouldRefreshTrends = force || trendHistory.length === 0 || isTrendStale;
  const shouldRefreshIdeas = force || batches.length === 0;

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
      await generateAndCacheIdeas(undefined, undefined, refreshedTrendScan, useScheduleSlot);
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

  if (!isBackgroundCacheOwner()) {
    console.log(`[Cache] Background refresh skipped on worker ${process.env.NODE_APP_INSTANCE} (worker 0 only)`);
    return;
  }

  if (WARMUP_ON_START) {
    void refreshCachesInBackground('startup', false, false);
  }

  if (batchScheduleTimer) return;

  scheduleNextBatch();
  console.log(`[Cache] Batch scheduler started (JST: ${[...BATCH_SCHEDULE_HOURS_JST].join(', ')}時)`);
}

export async function filterCachedIdeas(input: SemanticFilterInput): Promise<SemanticFilterOutput> {
  const agent = new EntrepreneurAgent(getClient());
  return agent.filterIdeas(input);
}

export function flushPersistentCache(): void {
  if (batchScheduleTimer) {
    clearTimeout(batchScheduleTimer);
    batchScheduleTimer = null;
  }
  persistCache();
}
