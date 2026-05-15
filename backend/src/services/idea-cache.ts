import fs from 'node:fs';
import path from 'node:path';
import {
  EntrepreneurAgent,
  fetchXUsage,
  getCachedXUsage,
  getXRuntimeConfig,
  type IdeaGenerationOutput,
  type SemanticFilterInput,
  type SemanticFilterOutput,
  type TrendScanOutput,
  type XUsageSnapshot,
} from 'ai-engine';
import { getClient } from './ai-engine';
import { CACHE_REFRESH_INTERVAL_MS } from 'ai-engine';

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
let persistentCacheLoaded = false;

function isTruthy(value: string | undefined): boolean {
  return ['1', 'true', 'yes', 'on'].includes((value ?? '').trim().toLowerCase());
}

function parseHoursToMs(value: string | undefined, fallbackMs: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallbackMs;
  return parsed * 60 * 60 * 1000;
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
    };

    if (parsed.version !== PERSISTENT_CACHE_VERSION) return;
    if (parsed.ideas?.data && Number.isFinite(parsed.ideas.expiresAt)) cache = parsed.ideas;
    if (parsed.trends?.data && Number.isFinite(parsed.trends.expiresAt)) trendCache = parsed.trends;
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
      }, null, 2),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[Cache] Failed to persist cache: ${message}`);
  }
}

export function getCachedIdeas(): IdeaGenerationOutput | null {
  loadPersistentCache();
  if (!cache) return null;
  if (Date.now() > cache.expiresAt) {
    cache = null;
    persistCache();
    return null;
  }
  return cache.data;
}

export function getCachedTrends(): TrendScanOutput | null {
  loadPersistentCache();
  if (!trendCache) return null;
  if (Date.now() > trendCache.expiresAt) {
    trendCache = null;
    persistCache();
    return null;
  }
  return trendCache.data;
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
    hasXBearerToken: boolean;
    hasXMcpServerUrl: boolean;
    xDataSource: string;
    xIncludeUserFields: boolean;
    xCacheTtlHours: number;
    xCacheFileEnabled: boolean;
    xSearchFixtureMode: string;
    xSearchFixtureEnabled: boolean;
    xEnrichmentEnabled: boolean;
    publicReadonlyMode: boolean;
    adminAuthEnabled: boolean;
    persistentCacheEnabled: boolean;
    cacheTtlHours: number;
  };
  xUsage: XUsageSnapshot | null;
  cache: {
    status: 'empty' | 'cached';
    expiresAt: string | null;
    generatedAt: string | null;
    candidateCount: number;
    sourceSummary: IdeaGenerationOutput['sourceSummary'] | null;
  };
  generationInProgress: boolean;
} {
  const cached = getCachedIdeas();
  const xRuntime = getXRuntimeConfig();
  return {
    instanceId: INSTANCE_ID,
    pid: process.pid,
    startedAt: SERVER_STARTED_AT,
    port: process.env.PORT ?? null,
    env: {
      hasZaiApiKey: Boolean(process.env.ZAI_API_KEY),
      hasXBearerToken: xRuntime.hasXBearerToken,
      hasXMcpServerUrl: xRuntime.hasXMcpServerUrl,
      xDataSource: xRuntime.dataSource,
      xIncludeUserFields: xRuntime.includeUserFields,
      xCacheTtlHours: xRuntime.cacheTtlHours,
      xCacheFileEnabled: xRuntime.cacheFileEnabled,
      xSearchFixtureMode: xRuntime.searchFixtureMode,
      xSearchFixtureEnabled: xRuntime.searchFixtureEnabled,
      xEnrichmentEnabled: xRuntime.enrichmentEnabled,
      publicReadonlyMode: PUBLIC_READONLY_MODE,
      adminAuthEnabled: Boolean(ADMIN_API_TOKEN),
      persistentCacheEnabled: Boolean(PERSISTENT_CACHE_FILE),
      cacheTtlHours: CACHE_TTL_MS / 60 / 60 / 1000,
    },
    xUsage: getCachedXUsage(),
    cache: cached ? {
      status: 'cached',
      expiresAt: cache ? new Date(cache.expiresAt).toISOString() : null,
      generatedAt: cached.generatedAt,
      candidateCount: cached.candidates.length,
      sourceSummary: cached.sourceSummary,
    } : {
      status: 'empty',
      expiresAt: null,
      generatedAt: null,
      candidateCount: 0,
      sourceSummary: null,
    },
    generationInProgress: Boolean(generationLock),
  };
}

export async function getXUsageSnapshot(): Promise<XUsageSnapshot | null> {
  return fetchXUsage();
}

export async function generateAndCacheIdeas(
  onProgress?: (text: string) => void,
  focusKeywords?: string[],
): Promise<IdeaGenerationOutput> {
  // If already generating, reuse the same promise
  if (generationLock) return generationLock;

  generationLock = (async () => {
    try {
      const agent = new EntrepreneurAgent(getClient());
      const result = await agent.generateIdeas(onProgress, focusKeywords);
      cache = {
        data: result,
        expiresAt: Date.now() + CACHE_TTL_MS,
      };
      persistCache();
      if (getXRuntimeConfig().enrichmentEnabled) {
        void fetchXUsage()
          .then((usage) => {
            if (usage) console.log(`[X API] Usage snapshot (${usage.source}): ${JSON.stringify(usage.data).slice(0, 1000)}`);
          })
          .catch((error: unknown) => {
            const message = error instanceof Error ? error.message : String(error);
            console.warn(`[X API] Usage snapshot failed: ${message}`);
          });
      }
      return result;
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

export async function filterCachedIdeas(input: SemanticFilterInput): Promise<SemanticFilterOutput> {
  const agent = new EntrepreneurAgent(getClient());
  return agent.filterIdeas(input);
}
