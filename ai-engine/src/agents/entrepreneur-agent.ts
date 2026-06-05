import { LLMClient } from '../services/llm-client';
import { renderPromptRole } from '../services/prompt-catalog';
import { ResponseParser } from '../services/response-parser';
import { IdeaGenerationAgent } from './idea-generation-agent';
import { FilterAgent } from './filter-agent';
import { fetchRssContext } from '../services/rss-client';
import {
  DEFAULT_FEATURED_IDEA_SELECTION_TIMEOUT_MS,
  DEFAULT_IDEA_COUNT,
  DEFAULT_RSS_SUMMARY_REQUEST_TIMEOUT_MS,
  DEFAULT_RSS_TOPIC_CLUSTERING_TIMEOUT_MS,
} from '../config/constants';
import { RssSourceUnavailableError } from '../errors';
import {
  RSS_ARTICLE_SUMMARY_POLICY,
  renderRssArticleSummaryPolicy,
  renderRssArticleSummaryRepairPolicy,
} from '../policies/rss-summary-policy';
import type {
  IdeaGenerationInput,
  IdeaGenerationOutput,
  TrendScanOutput,
} from '../types/idea-generation';
import type { SemanticFilterInput, SemanticFilterOutput } from '../types/semantic-filter';
import type { IdeaCandidate } from '../types/idea-candidate';
import type { RssArticle, RssContext, RssSummaryError, RssTrendItem } from '../services/rss-client';

const DEFAULT_KEYWORDS = ['AI', 'SaaS', 'developer', 'productivity', 'automation', 'エンジニア', 'プロダクト開発'];
const MAX_EVIDENCE_URLS = 1;
const DEFAULT_DISPLAY_RSS_ARTICLES = 4;
const DEFAULT_SUMMARY_CANDIDATE_RSS_ARTICLES = 9;
const RSS_SUMMARY_BATCH_SIZE = 4;
const DEFAULT_RSS_SUMMARY_REQUEST_CONCURRENCY = 2;
const RSS_SUMMARY_MAX_TOKENS = 7000;
const RSS_TOPIC_CLUSTERING_MAX_TOKENS = 3000;
const RSS_TOPIC_CLUSTERING_MIN_CONFIDENCE = 0.55;
const MIN_RSS_EVIDENCE_SCORE = 4;
const FEED_METADATA_PATTERN = /\bArticle URL:|\bComments URL:|\bPoints:|#\s*Comments:/i;
const URL_TEXT_PATTERN = /\bhttps?:\/\/\S+|\bwww\.\S+/i;
const GENERIC_EVIDENCE_TERMS = new Set([
  'ai', 'api', 'app', 'apps', 'dev', 'developer', 'developers', 'development',
  'cli', 'saas', 'tool', 'tools', 'web', 'service', 'services', 'user', 'users',
  'アプリ', 'エンジニア', 'サービス', 'ツール', 'ユーザー', '開発',
  'スキル', '欲しい', '不便', '困ってる', '改善', '問題', '課題', '自動化',
  '文章を', '章を書', 'を書く',
]);

type RssTopicCluster = NonNullable<RssContext['topicClusters']>[number];
type RssTopicStatus = NonNullable<RssArticle['topicStatus']>;

interface LlmTopicGroup {
  topic: string;
  label: string;
  articleIndexes: number[];
  confidence: number;
}

interface TopicGroupInput {
  topic: string;
  label: string;
  articleIndexes: number[];
  confidence?: number;
  status?: RssTopicStatus;
}

interface TopicAggregate {
  articleCount: number;
  sources: string[];
  firstSeenAtMs: number;
  lastSeenAtMs: number;
  recentCount: number;
  previousCount: number;
  representativeArticles: RssTopicCluster['representativeArticles'];
}

function sourceNames(rssContext: RssContext): string[] {
  const articleSources = rssContext.relatedArticles.map((article) => article.source).filter(Boolean);
  const failedSources = rssContext.sourceErrors?.map((error) => error.source).filter(Boolean) ?? [];
  return [...new Set([...articleSources, ...failedSources])];
}

interface RssArticleTranslation {
  index?: number;
  title: string;
  titleJa?: string;
  summaryJa?: string;
}

function containsJapanese(text: string): boolean {
  return /[ぁ-んァ-ヶ一-龯]/.test(text);
}

function normalizeTitle(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function normalizeArticleSummary(text: string): string {
  return normalizeTitle(text)
    .replace(/\bArticle URL:\s*\S+/gi, '')
    .replace(/\bComments URL:\s*\S+/gi, '')
    .replace(/\bPoints:\s*\d+/gi, '')
    .replace(/#\s*Comments:\s*\d+/gi, '')
    .replace(/\bhttps?:\/\/\S+|\bwww\.\S+/gi, '')
    .replace(/^(?:はじめに|概要|要約|導入|introduction)\s*[：:]\s*/i, '')
    .replace(/\s*(?:\.{3,}|…|続きを読む|read more)\s*$/i, '')
    .trim();
}

function countMatches(text: string, pattern: RegExp): number {
  return text.match(pattern)?.length ?? 0;
}

function hasFeedMetadataOrUrl(text: string): boolean {
  return FEED_METADATA_PATTERN.test(text) || URL_TEXT_PATTERN.test(text);
}

function looksLikeJapaneseTitle(text: string): boolean {
  return countMatches(text, /[ぁ-んァ-ヶ一-龯]/g) >= 2;
}

function looksLikeJapaneseSummary(text: string): boolean {
  const japaneseChars = countMatches(text, /[ぁ-んァ-ヶ一-龯]/g);
  const latinChars = countMatches(text, /[A-Za-z]/g);
  return japaneseChars >= RSS_ARTICLE_SUMMARY_POLICY.minJapaneseChars
    && japaneseChars >= latinChars * RSS_ARTICLE_SUMMARY_POLICY.minJapaneseToLatinRatio;
}

type SummaryValidationResult =
  | { ok: true; summaryJa: string }
  | { ok: false; message: string };

type RssSummaryTarget = {
  index: number;
  title: string;
  source: string;
  language: 'ja' | 'other';
  summary: string;
};

function validateSummaryJa(value: string | undefined): SummaryValidationResult {
  const original = normalizeTitle(value ?? '');
  if (hasFeedMetadataOrUrl(original)) {
    return { ok: false, message: 'summaryJa contains RSS metadata or URL text' };
  }

  const raw = normalizeArticleSummary(value ?? '');
  if (!raw) return { ok: false, message: 'summaryJa is empty' };

  const lines = raw
    .replace(/\r\n/g, '\n')
    .replace(/\s+・/g, '\n・')
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);

  const policy = RSS_ARTICLE_SUMMARY_POLICY;
  if (lines.length < policy.minItems || lines.length > policy.maxItems) {
    return {
      ok: false,
      message: `summaryJa must contain ${policy.minItems}-${policy.maxItems} bullet items`,
    };
  }

  if (lines.some((line) => !/^・\s*/.test(line))) {
    return { ok: false, message: 'summaryJa bullet items must start with ・' };
  }

  const items = lines.map((line) => line
    .replace(/^・\s*/, '')
    .replace(/[。．.]+$/u, '')
    .trim());

  if (items.some((item) => !item)) {
    return { ok: false, message: 'summaryJa contains an empty bullet item' };
  }

  const longItem = items.find((item) => item.length > policy.maxItemChars);
  if (longItem) {
    return {
      ok: false,
      message: `summaryJa bullet item is too long (${longItem.length} chars)`,
    };
  }

  const summaryJa = items.map((item) => `・${item}`).join('\n');
  const totalChars = items.join('').length;
  if (totalChars < policy.minTotalChars || totalChars > policy.maxTotalChars) {
    return {
      ok: false,
      message: `summaryJa total length is outside the expected range (${totalChars} chars)`,
    };
  }

  if (!looksLikeJapaneseSummary(summaryJa)) {
    return { ok: false, message: 'summaryJa does not look like a Japanese summary' };
  }

  return { ok: true, summaryJa };
}

function summaryError(index: number, article: RssArticle, message: string): RssSummaryError {
  const url = article.url ?? article.link;
  return {
    index,
    title: article.title,
    source: article.source,
    message,
    ...(url ? { url } : {}),
  };
}

function titleJaForArticle(article: RssArticle, translation: RssArticleTranslation | undefined): string {
  if (containsJapanese(article.title)) return article.title;
  const titleJa = normalizeTitle(translation?.titleJa ?? '');
  return looksLikeJapaneseTitle(titleJa) ? titleJa : '';
}

function looksLikeBrandTitle(text: string): boolean {
  const normalized = normalizeTitle(text);
  if (!normalized || containsJapanese(normalized)) return false;
  if (/[。！？!?]/.test(normalized)) return false;
  const words = normalized.split(/\s+/).filter(Boolean);
  return normalized.length <= 48 && words.length <= 3;
}

function fallbackTitleJaForArticle(article: RssArticle): string {
  const title = normalizeTitle(article.title);
  if (!looksLikeBrandTitle(title)) return '';
  if (article.source === 'Product Hunt') return `${title}のプロダクト紹介`;
  return `${title}に関する記事`;
}

function displayRssArticleLimit(): number {
  return parsePositiveInt(
    process.env.RSS_DISPLAY_RELATED_ARTICLES ?? process.env.RSS_MAX_RELATED_ARTICLES,
    DEFAULT_DISPLAY_RSS_ARTICLES,
  );
}

function summaryCandidateRssArticleLimit(): number {
  return Math.max(
    displayRssArticleLimit(),
    parsePositiveInt(process.env.RSS_RELATED_ARTICLE_CANDIDATE_COUNT, DEFAULT_SUMMARY_CANDIDATE_RSS_ARTICLES),
  );
}

function rebuildTrendingKeywords(articles: RssArticle[], fallback: RssTrendItem[]): RssTrendItem[] {
  const counts = new Map<string, number>();
  for (const article of articles) {
    for (const keyword of article.keywords ?? []) {
      counts.set(keyword, (counts.get(keyword) ?? 0) + 1);
    }
  }

  const rebuilt = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([word, count]) => ({ word, count }));

  return rebuilt.length > 0 ? rebuilt : fallback;
}

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

async function runWithConcurrency<T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  const workerCount = Math.max(1, Math.min(concurrency, items.length));
  let nextIndex = 0;

  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      await worker(items[index]);
    }
  }));
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function topicWindowHours(): number {
  return parsePositiveInt(process.env.RSS_TOPIC_WINDOW_HOURS, 24);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object');
}

function articleTime(article: RssArticle): number {
  const published = Date.parse(article.publishedAt ?? article.published);
  const firstSeen = article.firstSeenAt ? Date.parse(article.firstSeenAt) : Number.NaN;
  if (Number.isFinite(published) && Number.isFinite(firstSeen)) return Math.max(published, firstSeen);
  if (Number.isFinite(published)) return published;
  if (Number.isFinite(firstSeen)) return firstSeen;
  return Date.now();
}

function articleFirstSeenTime(article: RssArticle): number {
  const firstSeen = article.firstSeenAt ? Date.parse(article.firstSeenAt) : Number.NaN;
  return Number.isFinite(firstSeen) ? firstSeen : articleTime(article);
}

function articleLastSeenTime(article: RssArticle): number {
  const lastSeen = article.lastSeenAt ? Date.parse(article.lastSeenAt) : Number.NaN;
  return Number.isFinite(lastSeen) ? lastSeen : articleTime(article);
}

function topicStatusRank(status: RssTopicStatus | undefined): number {
  if (status === 'spiking') return 3;
  if (status === 'new') return 2;
  if (status === 'continuing') return 1;
  if (status === 'stale') return 0;
  return -1;
}

function topicStatusBoost(status: RssTopicStatus): number {
  if (status === 'spiking') return 30;
  if (status === 'new') return 20;
  if (status === 'continuing') return 8;
  return 0;
}

function strongestTopicStatus(articles: RssArticle[]): RssTopicStatus | undefined {
  return articles
    .map((article) => article.topicStatus)
    .filter((status): status is RssTopicStatus => Boolean(status) && status !== 'stale')
    .sort((a, b) => topicStatusRank(b) - topicStatusRank(a))[0];
}

function classifyTopicFromArticles(
  articles: RssArticle[],
  recentCount: number,
  previousCount: number,
  sourceCount: number,
  recentCutoff: number,
): RssTopicStatus {
  if (recentCount === 0) return 'stale';
  const firstSeenAt = Math.min(...articles.map(articleFirstSeenTime));
  if (firstSeenAt >= recentCutoff) return 'new';
  if (sourceCount >= 2 && recentCount >= 2 && (previousCount === 0 || recentCount >= previousCount * 2)) {
    return 'spiking';
  }
  return 'continuing';
}

function classifyTopicFromAggregate(
  aggregate: TopicAggregate,
  sourceCount: number,
  recentCutoff: number,
): RssTopicStatus {
  if (aggregate.recentCount === 0) return 'stale';
  if (aggregate.firstSeenAtMs >= recentCutoff) return 'new';
  if (
    sourceCount >= 2
    && aggregate.recentCount >= 2
    && (aggregate.previousCount === 0 || aggregate.recentCount >= aggregate.previousCount * 2)
  ) {
    return 'spiking';
  }
  return 'continuing';
}

function normalizeTopicId(value: string, fallback: string): string {
  const normalized = value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[^\p{L}\p{N}#+.\-\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
  return normalized || fallback;
}

function toRepresentativeArticle(article: RssArticle): RssTopicCluster['representativeArticles'][number] {
  return {
    title: article.titleJa || article.title,
    link: article.link,
    url: article.url,
    source: article.source,
    publishedAt: article.publishedAt ?? article.published,
    firstSeenAt: article.firstSeenAt ?? new Date(articleFirstSeenTime(article)).toISOString(),
    summary: article.summaryJa ?? article.summary,
  };
}

function representativeArticleKey(article: RssTopicCluster['representativeArticles'][number]): string {
  return article.url || article.link || `${article.source}:${article.title}:${article.publishedAt ?? article.firstSeenAt}`;
}

function observedAggregateFromFallbacks(
  articles: RssArticle[],
  fallbackClusters: RssTopicCluster[],
  recentCutoff: number,
  previousCutoff: number,
): TopicAggregate | null {
  if (fallbackClusters.length === 0) return null;

  const sources = new Set<string>();
  const coveredTopics = new Set(fallbackClusters.map((cluster) => cluster.topic));
  let articleCount = 0;
  let recentCount = 0;
  let previousCount = 0;
  let firstSeenAtMs = Number.POSITIVE_INFINITY;
  let lastSeenAtMs = Number.NEGATIVE_INFINITY;
  const representatives = new Map<string, RssTopicCluster['representativeArticles'][number]>();

  for (const cluster of fallbackClusters) {
    articleCount += cluster.articleCount;
    recentCount += cluster.recentCount;
    previousCount += cluster.previousCount;
    cluster.sources.forEach((source) => sources.add(source));

    const firstSeen = Date.parse(cluster.firstSeenAt);
    const lastSeen = Date.parse(cluster.lastSeenAt);
    if (Number.isFinite(firstSeen)) firstSeenAtMs = Math.min(firstSeenAtMs, firstSeen);
    if (Number.isFinite(lastSeen)) lastSeenAtMs = Math.max(lastSeenAtMs, lastSeen);

    for (const article of cluster.representativeArticles) {
      representatives.set(representativeArticleKey(article), article);
    }
  }

  for (const article of articles) {
    if (article.source) sources.add(article.source);
    if (!article.topicKey || !coveredTopics.has(article.topicKey)) {
      articleCount += 1;
      const time = articleTime(article);
      if (time >= recentCutoff) recentCount += 1;
      if (time >= previousCutoff && time < recentCutoff) previousCount += 1;

      firstSeenAtMs = Math.min(firstSeenAtMs, articleFirstSeenTime(article));
      lastSeenAtMs = Math.max(lastSeenAtMs, articleLastSeenTime(article));
    }

    const representative = toRepresentativeArticle(article);
    representatives.set(representativeArticleKey(representative), representative);
  }

  if (!Number.isFinite(firstSeenAtMs)) firstSeenAtMs = Math.min(...articles.map(articleFirstSeenTime));
  if (!Number.isFinite(lastSeenAtMs)) lastSeenAtMs = Math.max(...articles.map(articleLastSeenTime));

  return {
    articleCount: Math.max(articleCount, articles.length),
    sources: [...sources].sort(),
    firstSeenAtMs,
    lastSeenAtMs,
    recentCount,
    previousCount,
    representativeArticles: [...representatives.values()],
  };
}

function buildTopicCluster(
  group: TopicGroupInput,
  articles: RssArticle[],
  fallbackClusters: RssTopicCluster[] = [],
): RssTopicCluster {
  const now = Date.now();
  const windowMs = topicWindowHours() * 60 * 60 * 1000;
  const recentCutoff = now - windowMs;
  const previousCutoff = now - windowMs * 2;
  const sorted = [...articles].sort((a, b) => articleTime(b) - articleTime(a));
  const aggregate = observedAggregateFromFallbacks(articles, fallbackClusters, recentCutoff, previousCutoff);
  const sources = aggregate?.sources ?? [...new Set(articles.map((article) => article.source).filter(Boolean))].sort();
  const recentCount = articles.filter((article) => articleTime(article) >= recentCutoff).length;
  const previousCount = articles.filter((article) => {
    const time = articleTime(article);
    return time >= previousCutoff && time < recentCutoff;
  }).length;
  const status = group.status
    ?? strongestTopicStatus(articles)
    ?? (aggregate
      ? classifyTopicFromAggregate(aggregate, sources.length, recentCutoff)
      : classifyTopicFromArticles(articles, recentCount, previousCount, sources.length, recentCutoff));
  const confidenceBoost = Math.round((group.confidence ?? 0) * 10);
  const representativeArticles = aggregate?.representativeArticles ?? sorted.map(toRepresentativeArticle);

  return {
    topic: normalizeTopicId(group.topic, fallbackClusters[0]?.topic ?? sorted[0]?.topicKey ?? sorted[0]?.title ?? 'topic'),
    label: group.label || fallbackClusters[0]?.label || sorted[0]?.titleJa || sorted[0]?.title || group.topic,
    status,
    score: (aggregate?.articleCount ?? articles.length) * 10 + sources.length * 8 + topicStatusBoost(status) + confidenceBoost,
    articleCount: aggregate?.articleCount ?? articles.length,
    sourceCount: sources.length,
    sources,
    firstSeenAt: new Date(aggregate?.firstSeenAtMs ?? Math.min(...articles.map(articleFirstSeenTime))).toISOString(),
    lastSeenAt: new Date(aggregate?.lastSeenAtMs ?? Math.max(...articles.map(articleLastSeenTime))).toISOString(),
    recentCount: aggregate?.recentCount ?? recentCount,
    previousCount: aggregate?.previousCount ?? previousCount,
    representativeArticles: representativeArticles.slice(0, 3),
  };
}

function applyTopicGroups(rssContext: RssContext, groups: TopicGroupInput[]): RssContext {
  const articles = rssContext.relatedArticles;
  if (articles.length === 0 || groups.length === 0) return rssContext;

  const existingByTopic = new Map((rssContext.topicClusters ?? []).map((cluster) => [cluster.topic, cluster]));
  const usedIndexes = new Set<number>();
  const normalizedGroups: TopicGroupInput[] = [];

  for (const group of groups) {
    const indexes = [...new Set(group.articleIndexes)]
      .filter((index) => Number.isInteger(index) && index >= 0 && index < articles.length && !usedIndexes.has(index));
    if (indexes.length === 0) continue;
    indexes.forEach((index) => usedIndexes.add(index));
    normalizedGroups.push({ ...group, articleIndexes: indexes });
  }

  const unassignedByTopic = new Map<string, TopicGroupInput>();
  for (let index = 0; index < articles.length; index += 1) {
    if (usedIndexes.has(index)) continue;
    const article = articles[index];
    const topic = article.topicKey || article.title;
    const existingGroup = unassignedByTopic.get(topic);
    if (existingGroup) {
      existingGroup.articleIndexes.push(index);
      continue;
    }

    const existingCluster = existingByTopic.get(topic);
    unassignedByTopic.set(topic, {
      topic,
      label: existingCluster?.label ?? article.titleJa ?? article.title,
      articleIndexes: [index],
      confidence: 1,
      status: article.topicStatus === 'stale' ? undefined : article.topicStatus,
    });
  }

  normalizedGroups.push(...unassignedByTopic.values());

  const originalTopicUsageCounts = new Map<string, number>();
  for (const group of normalizedGroups) {
    const groupTopics = new Set(
      group.articleIndexes
        .map((index) => articles[index]?.topicKey)
        .filter((topic): topic is string => Boolean(topic)),
    );
    for (const topic of groupTopics) {
      originalTopicUsageCounts.set(topic, (originalTopicUsageCounts.get(topic) ?? 0) + 1);
    }
  }

  const clusterEntries = normalizedGroups
    .map((group) => {
      const groupArticles = group.articleIndexes.map((index) => articles[index]).filter(Boolean);
      const fallbackClusters = new Map<string, RssTopicCluster>();
      for (const article of groupArticles) {
        const topic = article.topicKey;
        if (!topic || originalTopicUsageCounts.get(topic) !== 1) continue;
        const cluster = existingByTopic.get(topic);
        if (cluster) fallbackClusters.set(cluster.topic, cluster);
      }

      const cluster = buildTopicCluster(group, groupArticles, [...fallbackClusters.values()]);
      return { group, cluster };
    })
    .sort((a, b) => b.cluster.score - a.cluster.score || b.cluster.recentCount - a.cluster.recentCount);

  const clusters = clusterEntries.map(({ cluster }) => cluster);

  const clusterByIndex = new Map<number, RssTopicCluster>();
  for (const { group, cluster } of clusterEntries) {
    for (const index of group.articleIndexes) clusterByIndex.set(index, cluster);
  }

  return {
    ...rssContext,
    topicClusters: clusters,
    relatedArticles: articles.map((article, index) => {
      const cluster = clusterByIndex.get(index);
      if (!cluster) return article;
      return {
        ...article,
        topicKey: cluster.topic,
        topicStatus: cluster.status,
        topicArticleCount: cluster.articleCount,
        topicSourceCount: cluster.sourceCount,
      };
    }),
  };
}

function reconcileTopicClustersWithArticles(rssContext: RssContext): RssContext {
  if (!rssContext.topicClusters?.length) return rssContext;
  const groupsByTopic = new Map<string, number[]>();

  rssContext.relatedArticles.forEach((article, index) => {
    if (!article.topicKey) return;
    const indexes = groupsByTopic.get(article.topicKey) ?? [];
    indexes.push(index);
    groupsByTopic.set(article.topicKey, indexes);
  });

  if (groupsByTopic.size === 0) return rssContext;

  const existingByTopic = new Map(rssContext.topicClusters.map((cluster) => [cluster.topic, cluster]));
  const groups: TopicGroupInput[] = [...groupsByTopic.entries()].map(([topic, articleIndexes]) => {
    const existing = existingByTopic.get(topic);
    return {
      topic,
      label: existing?.label ?? rssContext.relatedArticles[articleIndexes[0]]?.title ?? topic,
      articleIndexes,
      confidence: 1,
      status: existing?.status === 'stale' ? undefined : existing?.status,
    };
  });

  return applyTopicGroups(rssContext, groups);
}

function normalizeLlmTopicGroups(raw: unknown, articleCount: number): LlmTopicGroup[] {
  if (!Array.isArray(raw)) return [];
  const used = new Set<number>();
  const groups: LlmTopicGroup[] = [];

  for (const item of raw) {
    if (!isRecord(item) || !Array.isArray(item.articleIndexes)) continue;
    const rawConfidence = item.confidence;
    const parsedConfidence = typeof rawConfidence === 'number'
      ? rawConfidence
      : typeof rawConfidence === 'string'
        ? Number(rawConfidence)
        : Number.NaN;
    const confidence = Number.isFinite(parsedConfidence)
      ? Math.max(0, Math.min(1, parsedConfidence))
      : undefined;
    const indexes = [...new Set(item.articleIndexes)]
      .filter((index): index is number => Number.isInteger(index) && index >= 0 && index < articleCount && !used.has(index));
    if (indexes.length === 0) continue;
    if (indexes.length > 1 && (confidence === undefined || confidence < RSS_TOPIC_CLUSTERING_MIN_CONFIDENCE)) continue;
    indexes.forEach((index) => used.add(index));

    const topic = typeof item.topic === 'string' ? item.topic : '';
    const label = typeof item.label === 'string' ? item.label.trim() : '';
    groups.push({
      topic: normalizeTopicId(topic, `topic-${groups.length + 1}`),
      label: label || normalizeTopicId(topic, `トピック${groups.length + 1}`),
      articleIndexes: indexes,
      confidence: confidence ?? 1,
    });
  }

  return groups;
}

function normalizeCandidates(raw: unknown): IdeaCandidate[] {
  // Already an array
  if (Array.isArray(raw)) return raw as IdeaCandidate[];

  // Single object — might be wrapped or a single candidate
  if (raw && typeof raw === 'object') {
    const obj = raw as Record<string, unknown>;
    console.log(`[IdeaGeneration] Parsed object with keys: ${Object.keys(obj).join(', ')}`);

    // Check if any property is an array of idea-like objects
    for (const [key, value] of Object.entries(obj)) {
      if (Array.isArray(value) && value.length > 0 && value[0] && typeof value[0] === 'object' && 'title' in (value[0] as object)) {
        console.log(`[IdeaGeneration] Found array in "${key}" with ${value.length} items`);
        return value as IdeaCandidate[];
      }
    }

    // Single candidate object with 'title' field
    if ('title' in obj) {
      console.log('[IdeaGeneration] Single candidate object, wrapping in array');
      return [obj as unknown as IdeaCandidate];
    }
  }

  console.warn('[IdeaGeneration] Could not normalize candidates, returning empty array');
  return [];
}

function candidateText(candidate: IdeaCandidate): string {
  return [
    candidate.title,
    candidate.tagline,
    candidate.description,
    candidate.productType,
    candidate.targetUsers,
    candidate.coreProblem,
    candidate.differentiation,
    ...candidate.tags,
  ].join(' ').toLowerCase();
}

function scoreArticleForCandidate(article: RssArticle, text: string): number {
  const articleText = [
    article.title,
    article.titleJa,
    article.summary,
    article.summaryJa,
    ...(article.keywords ?? []),
  ].filter(Boolean).join(' ');
  let score = evidenceOverlapScore(articleText, text);
  for (const keyword of article.keywords ?? []) {
    const normalized = normalizeEvidenceText(keyword);
    if (normalized && !GENERIC_EVIDENCE_TERMS.has(normalized) && text.includes(normalized)) score += 2;
  }
  return score >= MIN_RSS_EVIDENCE_SCORE ? score : 0;
}

type CandidateEvidenceUrl = NonNullable<IdeaCandidate['sources']['evidenceUrls']>[number];
type ScoredEvidenceUrl = CandidateEvidenceUrl & { score: number };

function evidenceTitle(article: RssArticle): string {
  return article.titleJa || article.title;
}

function scoreExistingEvidenceForCandidate(
  source: CandidateEvidenceUrl,
  text: string,
  articleByUrl: Map<string, RssArticle>,
): number {
  if (source.type === 'rss') {
    const article = articleByUrl.get(source.url);
    return article ? scoreArticleForCandidate(article, text) : 0;
  }
  return 0;
}

function normalizeEvidenceText(text: string): string {
  return text
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}#+.\-\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function englishEvidenceTokens(text: string): Set<string> {
  const tokens = new Set<string>();
  for (const raw of normalizeEvidenceText(text).match(/[a-z][a-z0-9#+.-]{2,}/g) ?? []) {
    if (GENERIC_EVIDENCE_TERMS.has(raw) || raw.length > 32) continue;
    tokens.add(raw);
    if (raw.endsWith('ing') && raw.length > 5) tokens.add(raw.slice(0, -3));
    if (raw.endsWith('s') && raw.length > 4) tokens.add(raw.slice(0, -1));
  }
  return tokens;
}

function japaneseEvidenceNgrams(text: string): Set<string> {
  const grams = new Set<string>();
  const normalized = normalizeEvidenceText(text);
  for (const run of normalized.match(/[ぁ-んァ-ヶ一-龯ー]{3,}/g) ?? []) {
    if (GENERIC_EVIDENCE_TERMS.has(run) || run.length > 40) continue;
    if (run.length === 3) {
      if (isSignalJapaneseGram(run)) grams.add(run);
      continue;
    }
    for (let i = 0; i <= run.length - 3; i += 1) {
      const gram = run.slice(i, i + 3);
      if (isSignalJapaneseGram(gram)) grams.add(gram);
    }
  }
  return grams;
}

function isSignalJapaneseGram(gram: string): boolean {
  if (GENERIC_EVIDENCE_TERMS.has(gram)) return false;
  const signalChars = gram.match(/[ァ-ヶ一-龯ー]/g)?.length ?? 0;
  return signalChars >= 2;
}

function evidenceOverlapScore(sourceText: string, candidate: string): number {
  const sourceEnglish = englishEvidenceTokens(sourceText);
  const candidateEnglish = englishEvidenceTokens(candidate);
  const sourceJapanese = japaneseEvidenceNgrams(sourceText);
  const candidateJapanese = japaneseEvidenceNgrams(candidate);
  let score = 0;

  for (const token of sourceEnglish) {
    if (candidateEnglish.has(token)) score += 3;
  }
  for (const gram of sourceJapanese) {
    if (candidateJapanese.has(gram)) score += 1;
  }
  return score;
}

function attachTrustedEvidence(candidates: IdeaCandidate[], rssContext: RssContext): IdeaCandidate[] {
  const articles = rssContext.relatedArticles.filter((article) => article.link || article.url);
  const articleByUrl = new Map<string, RssArticle>();
  for (const article of articles) {
    const url = article.url ?? article.link;
    if (url) articleByUrl.set(url, article);
  }
  const allowedUrls = new Set<string>(articleByUrl.keys());

  if (articles.length === 0) {
    return candidates.map((candidate) => ({
      ...candidate,
      sources: {
        rssKeywords: candidate.sources.rssKeywords,
        evidenceUrls: (candidate.sources.evidenceUrls ?? [])
          .filter((source) => allowedUrls.has(source.url))
          .slice(0, MAX_EVIDENCE_URLS),
      },
    }));
  }

  return candidates.map((candidate) => {
    const text = candidateText(candidate);
    const existing = (candidate.sources.evidenceUrls ?? [])
      .filter((source) => allowedUrls.has(source.url))
      .map((source): ScoredEvidenceUrl => {
        const article = articleByUrl.get(source.url);
        return {
          title: article ? evidenceTitle(article) : source.title,
          url: source.url,
          type: source.type,
          score: scoreExistingEvidenceForCandidate(source, text, articleByUrl),
        };
      })
      .filter((source) => source.score > 0);

    const used = new Set(existing.map((source) => source.url));
    const rssAdditions = articles
      .map((article) => ({ article, score: scoreArticleForCandidate(article, text) }))
      .sort((a, b) => b.score - a.score)
      .filter(({ article }) => !used.has(article.url ?? article.link))
      .map(({ article, score }) => ({
        title: evidenceTitle(article),
        url: article.url ?? article.link,
        type: 'rss' as const,
        score,
      }))
      .filter((source) => source.score > 0);

    const ranked = [...existing, ...rssAdditions]
      .sort((a, b) => b.score - a.score)
      .reduce<CandidateEvidenceUrl[]>((acc, { title, url, type }) => {
        if (acc.some((source) => source.url === url)) return acc;
        if (acc.length >= MAX_EVIDENCE_URLS) return acc;
        acc.push({ title, url, type });
        return acc;
      }, []);

    return {
      ...candidate,
      sources: {
        rssKeywords: candidate.sources.rssKeywords,
        evidenceUrls: ranked,
      },
    };
  });
}

export class EntrepreneurAgent {
  private readonly ideaGeneration: IdeaGenerationAgent;
  private readonly filterAgent: FilterAgent;
  private readonly llm: LLMClient;

  constructor(llm: LLMClient) {
    this.llm = llm;
    this.ideaGeneration = new IdeaGenerationAgent(llm);
    this.filterAgent = new FilterAgent(llm);
  }

  private async refineRssTopicClusters(rssContext: RssContext, focusKeywords: string[]): Promise<RssContext> {
    if (process.env.RSS_TOPIC_LLM_ENABLED === 'false') return rssContext;
    if (!rssContext.topicClusters?.length || rssContext.relatedArticles.length < 2) return rssContext;

    const articles = rssContext.relatedArticles.map((article, index) => ({
      index,
      title: article.titleJa || article.title,
      source: article.source,
      publishedAt: article.publishedAt ?? article.published,
      summary: normalizeArticleSummary(article.summaryJa ?? article.summary).slice(0, 700),
      keywords: article.keywords ?? [],
      heuristicTopic: article.topicKey,
    }));
    const existingTopics = rssContext.topicClusters.slice(0, 20).map((topic) => ({
      topic: topic.topic,
      label: topic.label,
      articleCount: topic.articleCount,
      sourceCount: topic.sourceCount,
      representativeArticles: topic.representativeArticles.map((article) => ({
        title: article.title,
        source: article.source,
      })),
    }));
    const variables = {
      articles,
      existing_topics: existingTopics,
      focus_keywords: focusKeywords.join(', '),
    };

    try {
      const raw = await this.llm.send(
        renderPromptRole('rss_topic_clustering', 'system', variables),
        renderPromptRole('rss_topic_clustering', 'user', variables),
        RSS_TOPIC_CLUSTERING_MAX_TOKENS,
        {
          maxAttempts: 1,
          timeoutMs: parsePositiveInt(
            process.env.RSS_TOPIC_CLUSTERING_TIMEOUT_MS,
            DEFAULT_RSS_TOPIC_CLUSTERING_TIMEOUT_MS,
          ),
        },
      );
      const parsed = ResponseParser.parse<unknown>(raw);
      const groups = normalizeLlmTopicGroups(parsed, rssContext.relatedArticles.length);
      if (groups.length === 0) {
        console.warn('[TrendScan] LLM topic clustering returned no usable groups; using heuristic topics');
        return rssContext;
      }
      console.log(`[TrendScan] LLM topic clustering produced ${groups.length} groups`);
      return applyTopicGroups(rssContext, groups);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[TrendScan] LLM topic clustering failed: ${message}`);
      return rssContext;
    }
  }

  private async summarizeRssArticles(rssContext: RssContext, focusKeywords: string[]): Promise<RssContext> {
    const targets: RssSummaryTarget[] = rssContext.relatedArticles
      .map((article, index) => ({ article, index }))
      .filter(({ article }) => article.title && !article.summaryJa)
      .slice(0, summaryCandidateRssArticleLimit())
      .map(({ article, index }): RssSummaryTarget => ({
        index,
        title: article.title,
        source: article.source,
        language: containsJapanese(article.title) ? 'ja' : 'other',
        summary: normalizeArticleSummary(article.summary).slice(0, 1800),
      }));

    if (targets.length === 0) return rssContext;

    const translationByIndex = new Map<number, RssArticleTranslation>();
    const requestErrors = new Map<number, string>();
    const requestTranslations = async (
      batch: RssSummaryTarget[],
      failurePrefix: string,
      mode: 'initial' | 'repair' = 'initial',
    ): Promise<void> => {
      try {
        const promptKey = mode === 'repair' ? 'rss_article_summary_repair' : 'rss_article_summary';
        const variables = mode === 'repair'
          ? {
              summary_policy: renderRssArticleSummaryRepairPolicy(),
              articles: batch,
              validation_errors: batch.map((target) => ({
                index: target.index,
                error: validateTarget(target),
              })),
            }
          : {
              summary_policy: renderRssArticleSummaryPolicy(),
              articles: batch,
            };
        const raw = await this.llm.send(
          renderPromptRole(promptKey, 'system', variables),
          renderPromptRole(promptKey, 'user', variables),
          RSS_SUMMARY_MAX_TOKENS,
          {
            maxAttempts: 1,
            timeoutMs: parsePositiveInt(
              process.env.RSS_SUMMARY_REQUEST_TIMEOUT_MS,
              DEFAULT_RSS_SUMMARY_REQUEST_TIMEOUT_MS,
            ),
          },
        );
        const parsed = ResponseParser.parse<RssArticleTranslation[]>(raw);
        if (!Array.isArray(parsed)) throw new Error('RSS summary response was not a JSON array');
        for (const translation of parsed) {
          if (Number.isInteger(translation.index)) {
            translationByIndex.set(translation.index as number, translation);
          }
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const indexes = batch.map((target) => target.index).join(',');
        console.warn(`[TrendScan] RSS article summarization failed for indexes ${indexes}: ${message}`);
        for (const target of batch) {
          requestErrors.set(target.index, `${failurePrefix}: ${message}`);
        }
      }
    };

    const validateTarget = (target: RssSummaryTarget): RssArticle | string => {
      const article = rssContext.relatedArticles[target.index];
      const translation = translationByIndex.get(target.index);
      if (!article) return 'article disappeared before summary validation';
      if (!translation) {
        return requestErrors.get(target.index) ?? 'summary response did not include this article index';
      }

      const titleJa = titleJaForArticle(article, translation) || fallbackTitleJaForArticle(article);
      if (!titleJa) return 'titleJa was missing or was not translated into Japanese';

      const summary = validateSummaryJa(translation.summaryJa);
      if (!summary.ok) return summary.message;

      return {
        ...article,
        titleJa,
        summaryJa: summary.summaryJa,
      };
    };

    const summaryConcurrency = parsePositiveInt(
      process.env.RSS_SUMMARY_REQUEST_CONCURRENCY,
      DEFAULT_RSS_SUMMARY_REQUEST_CONCURRENCY,
    );
    await runWithConcurrency(
      chunkArray(targets, RSS_SUMMARY_BATCH_SIZE),
      summaryConcurrency,
      (batch) => requestTranslations(batch, 'summary generation failed'),
    );

    const retryTargets = targets.filter((target) => typeof validateTarget(target) === 'string');
    await runWithConcurrency(
      retryTargets,
      summaryConcurrency,
      (retryTarget) => requestTranslations([retryTarget], 'summary repair failed', 'repair'),
    );

    const summarizedArticles: RssArticle[] = [];
    const summaryErrors = new Map<number, RssSummaryError>();
    for (const target of targets) {
      const validation = validateTarget(target);
      if (typeof validation === 'string') {
        const article = rssContext.relatedArticles[target.index];
        if (article) summaryErrors.set(target.index, summaryError(target.index, article, validation));
        continue;
      }
      summarizedArticles.push(validation);
    }

    const errors = [...summaryErrors.values()];
    if (summarizedArticles.length === 0) {
      throw new RssSourceUnavailableError(
        'RSS記事の要約生成または日本語変換に失敗したため、トレンドスキャンを停止しました。',
        {
          operation: 'trend_summary',
          focusKeywords,
          rssArticleCount: rssContext.relatedArticles.length,
          trendingKeywordCount: rssContext.trendingKeywords.length,
          sourceNames: sourceNames(rssContext),
          sourceErrors: rssContext.sourceErrors,
          summaryErrors: errors,
          summaryFailureCount: errors.length,
        },
      );
    }

    const displayArticles = summarizedArticles.slice(0, displayRssArticleLimit());
    const displayShortfall = displayArticles.length < displayRssArticleLimit();
    const exposedErrors = displayShortfall ? errors : [];
    const replacedErrors = displayShortfall ? [] : errors;

    return reconcileTopicClustersWithArticles({
      ...rssContext,
      trendingKeywords: rebuildTrendingKeywords(displayArticles, rssContext.trendingKeywords),
      relatedArticles: displayArticles,
      ...(exposedErrors.length > 0 ? { summaryErrors: exposedErrors } : {}),
      ...(replacedErrors.length > 0 ? { replacedSummaryErrors: replacedErrors } : {}),
    });
  }

  private async summarizeTrendScanOutput(result: TrendScanOutput): Promise<TrendScanOutput> {
    const rssContext = await this.summarizeRssArticles(result.rssContext, result.focusKeywords);
    const displayLimit = displayRssArticleLimit();
    const displayShortfall = Math.max(0, displayLimit - rssContext.relatedArticles.length);
    const warnings = [
      ...(result.sourceSummary.warnings ?? []),
      ...(displayShortfall > 0
        ? [`品質基準を満たすRSS記事が${rssContext.relatedArticles.length}/${displayLimit}件だったため、表示件数が少なくなっています。`]
        : []),
    ];

    return {
      ...result,
      rssContext,
      sourceSummary: {
        ...result.sourceSummary,
        rssItemCount: rssContext.trendingKeywords.length + rssContext.relatedArticles.length,
        ...(warnings.length > 0 ? { warnings } : {}),
      },
    };
  }

  private async scanTrendContext(
    onProgress?: (text: string) => void,
    focusKeywords: string[] = DEFAULT_KEYWORDS,
  ): Promise<TrendScanOutput> {
    const keywords = [...new Set(focusKeywords.map((keyword) => keyword.trim()).filter(Boolean))];
    const effectiveKeywords = keywords.length > 0 ? keywords : DEFAULT_KEYWORDS;
    onProgress?.('[Enrichment] RSS データ取得中...');
    const rssContext = await this.refineRssTopicClusters(
      await fetchRssContext(effectiveKeywords.slice(0, 3)),
      effectiveKeywords,
    );
    const rssCount = rssContext.trendingKeywords.length + rssContext.relatedArticles.length;
    console.log(`[IdeaGeneration] Enrichment: RSS: ${rssCount} items`);

    if (rssContext.relatedArticles.length === 0) {
      throw new RssSourceUnavailableError(
        'RSS記事を取得できなかったため、トレンドスキャンとアイデア生成を停止しました。',
        {
          operation: 'trend_scan',
          focusKeywords: effectiveKeywords,
          rssArticleCount: rssContext.relatedArticles.length,
          trendingKeywordCount: rssContext.trendingKeywords.length,
          sourceNames: sourceNames(rssContext),
          sourceErrors: rssContext.sourceErrors,
        },
      );
    }

    return {
      rssContext,
      focusKeywords: effectiveKeywords,
      generatedAt: new Date().toISOString(),
      summaryPolicy: RSS_ARTICLE_SUMMARY_POLICY,
      sourceSummary: {
        rssItemCount: rssCount,
        usedLLMFallback: false,
        dataQuality: 'external',
      },
    };
  }

  async scanTrends(onProgress?: (text: string) => void): Promise<TrendScanOutput> {
    console.log('[TrendScan] Starting trend scan pipeline');
    const result = await this.scanTrendContext(onProgress);
    return this.summarizeTrendScanOutput(result);
  }

  async generateIdeasFromTrendScan(
    trendScan: TrendScanOutput,
    onProgress?: (text: string) => void,
    requestedIdeaCount = DEFAULT_IDEA_COUNT,
    batchTime?: string,
  ): Promise<IdeaGenerationOutput> {
    const startTime = Date.now();
    const { rssContext, focusKeywords } = trendScan;
    if (rssContext.relatedArticles.length === 0) {
      throw new RssSourceUnavailableError(
        '利用可能なRSS記事がないため、LLMによるアイデア生成を停止しました。',
        {
          operation: 'idea_generation',
          focusKeywords,
          rssArticleCount: rssContext.relatedArticles.length,
          trendingKeywordCount: rssContext.trendingKeywords.length,
          sourceNames: sourceNames(rssContext),
          sourceErrors: rssContext.sourceErrors,
        },
      );
    }
    const sourceCountText = `RSS: ${trendScan.sourceSummary.rssItemCount}件`;
    onProgress?.(`[Enrichment] ${sourceCountText}\n\n新しいアイデアを生成中...`);

    const input: IdeaGenerationInput = {
      rssContext,
      focusKeywords,
      requestedIdeaCount,
    };

    onProgress?.('アイデア候補を生成中...');
    const rawCandidates = await this.ideaGeneration.executeStaged(input, onProgress);

    // LLM may return various formats — normalize to IdeaCandidate[]
    let candidates = attachTrustedEvidence(normalizeCandidates(rawCandidates), rssContext);

    // Apply batchTime to each candidate
    if (batchTime) {
      candidates = candidates.map((c) => ({ ...c, batchTime }));
    }

    const totalTime = Date.now() - startTime;
    console.log(`[IdeaGeneration] Generated ${candidates.length} ideas in ${totalTime}ms`);

    let featuredIdea: IdeaCandidate | undefined;
    if (candidates.length > 0) {
      featuredIdea = await this.selectFeaturedIdea(candidates);
    }

    return {
      candidates,
      featuredIdea,
      generatedAt: new Date().toISOString(),
      batchTime,
      sourceSummary: trendScan.sourceSummary,
    };
  }

  async generateIdeas(
    onProgress?: (text: string) => void,
    inputFocusKeywords?: string[],
    requestedIdeaCount = DEFAULT_IDEA_COUNT,
    batchTime?: string,
  ): Promise<IdeaGenerationOutput> {
    const { ideas } = await this.generateIdeasWithTrendScan(
      onProgress,
      inputFocusKeywords,
      requestedIdeaCount,
      batchTime,
    );
    return ideas;
  }

  async generateIdeasWithTrendScan(
    onProgress?: (text: string) => void,
    inputFocusKeywords?: string[],
    requestedIdeaCount = DEFAULT_IDEA_COUNT,
    batchTime?: string,
  ): Promise<{ ideas: IdeaGenerationOutput; trendScan: TrendScanOutput }> {
    const startTime = Date.now();
    console.log('[IdeaGeneration] Starting idea generation pipeline');

    const trendScan = await this.summarizeTrendScanOutput(
      await this.scanTrendContext(onProgress, inputFocusKeywords),
    );
    const result = await this.generateIdeasFromTrendScan(
      trendScan,
      onProgress,
      requestedIdeaCount,
      batchTime,
    );
    console.log(`[IdeaGeneration] Pipeline completed in ${Date.now() - startTime}ms`);
    return { ideas: result, trendScan };
  }

  private async selectFeaturedIdea(candidates: IdeaCandidate[]): Promise<IdeaCandidate | undefined> {
    try {
      const summaries = candidates.map((c, i) => ({
        index: i,
        title: c.title,
        tagline: c.tagline,
        productType: c.productType,
        coreProblem: c.coreProblem,
        differentiation: c.differentiation,
      }));

      const systemPrompt = renderPromptRole('featured_idea_selection', 'system');
      const userPrompt = renderPromptRole('featured_idea_selection', 'user', { idea_summaries: summaries });
      const raw = await this.llm.send(systemPrompt, userPrompt, 256, {
        maxAttempts: 1,
        timeoutMs: parsePositiveInt(
          process.env.FEATURED_IDEA_SELECTION_TIMEOUT_MS,
          DEFAULT_FEATURED_IDEA_SELECTION_TIMEOUT_MS,
        ),
      });
      const parsed = JSON.parse(raw.trim());
      const idx = typeof parsed.index === 'number' ? parsed.index : undefined;
      if (idx !== undefined && idx >= 0 && idx < candidates.length) {
        console.log(`[IdeaGeneration] Featured idea selected: index=${idx} "${candidates[idx].title}"`);
        return candidates[idx];
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[IdeaGeneration] Featured idea selection failed: ${message}`);
    }
    return undefined;
  }

  async filterIdeas(input: SemanticFilterInput): Promise<SemanticFilterOutput> {
    if (!input.query.trim()) {
      return {
        filteredCandidates: input.candidates,
        filterReasoning: 'クエリが空のため、絞り込みを行わずそのまま表示しています。',
        matchCriteria: [],
      };
    }

    console.log(`[Filter] Filtering ${input.candidates.length} ideas with query: "${input.query}"`);
    return this.filterAgent.execute(input);
  }
}
