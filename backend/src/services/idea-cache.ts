import fs from 'node:fs';
import path from 'node:path';
import {
  DEFAULT_IDEA_COUNT,
  MAX_BATCHES,
  BATCH_SCHEDULE_HOURS_JST,
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
const PUBLIC_READONLY_MODE = isTruthy(process.env.PUBLIC_READONLY_MODE);
const ADMIN_API_TOKEN = process.env.ADMIN_API_TOKEN?.trim() ?? '';
const PERSISTENT_CACHE_VERSION = 2;
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
let trendCache: {
  data: TrendScanOutput;
  expiresAt: number;
} | null = null;
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

function getCurrentBatchTimeJST(now: Date): string {
  const jst = toJST(now);
  const jstHour = jst.getUTCHours();
  const scheduleHours = [...BATCH_SCHEDULE_HOURS_JST];

  // Find the current or most recent slot
  let currentHour = 0;
  for (const h of scheduleHours) {
    if (h <= jstHour) currentHour = h;
    else break;
  }

  const batchDate = new Date(jst);
  batchDate.setUTCHours(currentHour, 0, 0, 0);

  // Format as ISO with +09:00 offset
  const year = batchDate.getUTCFullYear();
  const month = String(batchDate.getUTCMonth() + 1).padStart(2, '0');
  const day = String(batchDate.getUTCDate()).padStart(2, '0');
  const hour = String(batchDate.getUTCHours()).padStart(2, '0');
  return `${year}-${month}-${day}T${hour}:00:00+09:00`;
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

function isPersistentTrendCache(value: unknown): value is { data: TrendScanOutput; expiresAt: number } {
  if (!isRecord(value)) return false;
  return isRecord(value.data)
    && typeof value.expiresAt === 'number'
    && Number.isFinite(value.expiresAt);
}

function loadPersistentCache(): void {
  if (!PERSISTENT_CACHE_FILE) return;

  try {
    const stat = fs.statSync(PERSISTENT_CACHE_FILE);
    if (persistentCacheLoaded && stat.mtimeMs <= persistentCacheMtimeMs) return;

    const raw = JSON.parse(fs.readFileSync(PERSISTENT_CACHE_FILE, 'utf8')) as Record<string, unknown>;
    const version = typeof raw.version === 'number' ? raw.version : 0;
    let nextBatches: BatchEntry[] = [];
    let nextTrendCache: typeof trendCache = null;

    if (version === PERSISTENT_CACHE_VERSION) {
      // v2: batch-based cache
      nextBatches = Array.isArray(raw.batches)
        ? raw.batches.filter(isPersistentBatchEntry).slice(0, MAX_BATCHES)
        : [];
      nextTrendCache = isPersistentTrendCache(raw.trends) ? raw.trends : null;
    } else if (version === 1) {
      // v1 migration: convert single cache to a single batch entry
      const v1 = raw as {
        version?: number;
        ideas?: { data: IdeaGenerationOutput; expiresAt: number };
        trends?: { data: TrendScanOutput; expiresAt: number };
      };
      if (isPersistentTrendCache(v1.trends)) nextTrendCache = v1.trends;
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
    trendCache = nextTrendCache;
    persistentCacheLoaded = true;
    persistentCacheMtimeMs = stat.mtimeMs;
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return;
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[Cache] Failed to load persistent cache: ${message}`);
  }
}

function persistCache(): void {
  if (!PERSISTENT_CACHE_FILE) return;

  try {
    fs.mkdirSync(path.dirname(PERSISTENT_CACHE_FILE), { recursive: true });
    const tmpFile = `${PERSISTENT_CACHE_FILE}.tmp.${process.pid}`;
    fs.writeFileSync(
      tmpFile,
      JSON.stringify({
        version: PERSISTENT_CACHE_VERSION,
        updatedAt: new Date().toISOString(),
        batches,
        trends: trendCache,
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

function cacheStatus(entry: { expiresAt: number } | null): CacheStatus {
  if (!entry) return 'empty';
  return Date.now() > entry.expiresAt ? 'stale' : 'cached';
}

function isExpired(entry: { expiresAt: number } | null): boolean {
  return Boolean(entry && Date.now() > entry.expiresAt);
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
      trendCacheGeneratedAt: trendCache?.data.generatedAt ?? null,
    });
  } catch (notifyError) {
    const message = notifyError instanceof Error ? notifyError.message : String(notifyError);
    console.warn(`[AdminNotifier] Failed to send RSS failure alert: ${message}`);
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

  return {
    candidates: allCandidates,
    generatedAt: latestGeneratedAt,
    sourceSummary: latestSourceSummary,
  };
}

export function getCachedTrends(): TrendScanOutput | null {
  loadPersistentCache();
  return trendCache?.data ?? null;
}

export function getIdeaCacheStatus(): CacheStatus {
  loadPersistentCache();
  if (batches.length === 0) return 'empty';
  return 'cached';
}

export function getTrendCacheStatus(): CacheStatus {
  loadPersistentCache();
  return cacheStatus(trendCache);
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
    warmupOnStart: boolean;
    ideaGenerationBatchSize: number;
    batchScheduleHours: readonly number[];
    maxBatches: number;
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
      persistentCacheEnabled: Boolean(PERSISTENT_CACHE_FILE),
      warmupOnStart: WARMUP_ON_START,
      ideaGenerationBatchSize: IDEA_GENERATION_BATCH_SIZE,
      batchScheduleHours: BATCH_SCHEDULE_HOURS_JST,
      maxBatches: MAX_BATCHES,
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

// --- Generation ---

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
      const batchTime = getCurrentBatchTimeJST(new Date());
      const agent = new EntrepreneurAgent(getClient());
      const result = trendScanOverride && !focusKeywords
        ? await agent.generateIdeasFromTrendScan(
          trendScanOverride,
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
      const result = await agent.scanTrends(onProgress);
      trendCache = {
        data: result,
        expiresAt: Date.now() + 4 * 60 * 60 * 1000,
      };
      persistCache();
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

export function refreshCachesInBackground(reason: string, force = false): Promise<void> {
  if (backgroundRefreshLock) return backgroundRefreshLock;

  loadPersistentCache();
  const shouldRefreshTrends = force || !trendCache || isExpired(trendCache);
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

  if (!isBackgroundCacheOwner()) {
    console.log(`[Cache] Background refresh skipped on worker ${process.env.NODE_APP_INSTANCE} (worker 0 only)`);
    return;
  }

  if (WARMUP_ON_START) {
    void refreshCachesInBackground('startup');
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
