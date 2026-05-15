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

export function getCachedIdeas(): IdeaGenerationOutput | null {
  if (!cache || Date.now() > cache.expiresAt) return null;
  return cache.data;
}

export function getCachedTrends(): TrendScanOutput | null {
  if (!trendCache || Date.now() > trendCache.expiresAt) return null;
  return trendCache.data;
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
        expiresAt: Date.now() + CACHE_REFRESH_INTERVAL_MS,
      };
      void fetchXUsage()
        .then((usage) => {
          if (usage) console.log(`[X API] Usage snapshot (${usage.source}): ${JSON.stringify(usage.data).slice(0, 1000)}`);
        })
        .catch((error: unknown) => {
          const message = error instanceof Error ? error.message : String(error);
          console.warn(`[X API] Usage snapshot failed: ${message}`);
        });
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
        expiresAt: Date.now() + CACHE_REFRESH_INTERVAL_MS,
      };
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
