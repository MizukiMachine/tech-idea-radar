import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

export type RssTopicStatus = 'new' | 'spiking' | 'continuing' | 'stale';

export interface ObservableRssArticle {
  title: string;
  link: string;
  url?: string;
  published?: string;
  publishedAt?: string;
  summary: string;
  description?: string;
  source: string;
  sourceUrl?: string;
}

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

export interface RssObservationMetadata {
  topicKey: string;
  topicStatus: RssTopicStatus;
  firstSeenAt: string;
  lastSeenAt: string;
  topicArticleCount: number;
  topicSourceCount: number;
}

export interface RssObservationResult {
  generatedAt: string;
  topics: RssTopicCluster[];
  metadataByFingerprint: Map<string, RssObservationMetadata>;
  warning?: string;
}

interface ObservedRssItem {
  fingerprint: string;
  title: string;
  link?: string;
  url?: string;
  source: string;
  sourceUrl: string;
  publishedAt?: string;
  firstSeenAt: string;
  lastSeenAt: string;
  summary?: string;
  topicKey: string;
}

interface ObservationState {
  schemaVersion: 1;
  updatedAt: string;
  items: ObservedRssItem[];
}

interface ObservationSettings {
  filePath: string;
  retentionHours: number;
  maxItems: number;
  maxItemsPerSource: number;
  hours: number;
  limit: number;
}

const DEFAULT_RETENTION_HOURS = 24;
const DEFAULT_MAX_ITEMS = 5_000;
const DEFAULT_MAX_ITEMS_PER_SOURCE = 500;
const DEFAULT_TOPIC_HOURS = 24;
const DEFAULT_TOPIC_LIMIT = 20;

const TOPIC_STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'com', 'for', 'from',
  'has', 'have', 'how', 'in', 'into', 'is', 'it', 'new', 'news', 'of',
  'on', 'or', 'release', 'released', 'releases', 'the', 'this', 'to',
  'update', 'updates', 'using', 'version', 'was', 'with',
  'これ', 'それ', 'この', 'その', 'こと', 'ため', 'する', 'した', 'して',
  'いる', 'ある', 'なる', 'から', 'まで', 'など', 'について', 'による',
]);

const IMPORTANT_SHORT_WORDS = new Set([
  'ai', 'ar', 'vr', 'ui', 'ux', 'go', 'js', 'ts', 'c#', 'c++',
]);

const TOKEN_PATTERN = /[a-z0-9]+(?:[.+#-][a-z0-9]+)*|[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}ー]+/giu;
const CJK_PATTERN = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u;

let inMemoryState: ObservationState | null = null;

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function observationRetentionHours(): number {
  const hours = parsePositiveInt(process.env.RSS_OBSERVATION_RETENTION_HOURS, 0);
  if (hours > 0) return hours;

  const days = parsePositiveInt(process.env.RSS_OBSERVATION_RETENTION_DAYS, 0);
  return days > 0 ? days * 24 : DEFAULT_RETENTION_HOURS;
}

function observationSettings(): ObservationSettings {
  return {
    filePath: process.env.RSS_OBSERVATIONS_FILE?.trim() ?? '',
    retentionHours: observationRetentionHours(),
    maxItems: parsePositiveInt(process.env.RSS_OBSERVATION_MAX_ITEMS, DEFAULT_MAX_ITEMS),
    maxItemsPerSource: parsePositiveInt(
      process.env.RSS_OBSERVATION_MAX_ITEMS_PER_SOURCE,
      DEFAULT_MAX_ITEMS_PER_SOURCE,
    ),
    hours: parsePositiveInt(process.env.RSS_TOPIC_WINDOW_HOURS, DEFAULT_TOPIC_HOURS),
    limit: parsePositiveInt(process.env.RSS_TOPIC_LIMIT, DEFAULT_TOPIC_LIMIT),
  };
}

function emptyState(now: Date): ObservationState {
  return {
    schemaVersion: 1,
    updatedAt: now.toISOString(),
    items: [],
  };
}

function isObservationState(value: unknown): value is ObservationState {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as ObservationState;
  return candidate.schemaVersion === 1 && Array.isArray(candidate.items);
}

function normalizeUrl(value: string): string {
  try {
    const url = new URL(value);
    url.hash = '';
    for (const key of [...url.searchParams.keys()]) {
      if (key.toLowerCase().startsWith('utm_')) url.searchParams.delete(key);
    }
    return url.toString();
  } catch {
    return value.trim();
  }
}

function normalizeDate(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const time = Date.parse(value);
  return Number.isNaN(time) ? undefined : new Date(time).toISOString();
}

function normalizeText(value: string): string {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[^\p{L}\p{N}\s.+#-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanToken(value: string): string {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/^[^\p{L}\p{N}+#]+|[^\p{L}\p{N}+#]+$/gu, '')
    .trim();
}

function isKeywordToken(token: string): boolean {
  if (!token || TOPIC_STOP_WORDS.has(token)) return false;
  if (IMPORTANT_SHORT_WORDS.has(token)) return true;
  const compact = token.replace(/[.+#-]/g, '');
  if (CJK_PATTERN.test(token)) return [...compact].length >= 2;
  return compact.length > 2;
}

function extractTopicKeywords(text: string): string[] {
  const tokens = [...text.normalize('NFKC').matchAll(TOKEN_PATTERN)]
    .map((match) => cleanToken(match[0]))
    .filter(isKeywordToken);
  const ngrams = [...tokens];

  for (let index = 0; index < tokens.length - 1; index += 1) {
    ngrams.push(`${tokens[index]} ${tokens[index + 1]}`);
  }

  return [...new Set(ngrams)];
}

export function createRssTopicKey(title: string, summary = ''): string {
  const text = normalizeText(`${title} ${summary}`);
  const candidates = extractTopicKeywords(text).filter((word) => {
    const parts = word.split(/\s+/).filter(Boolean);
    return word.length > 2 && parts.every((part) => !TOPIC_STOP_WORDS.has(part));
  });
  const bigram = candidates.find((word) => word.includes(' ') && word.length <= 60);
  const keywordTopic = candidates.slice(0, 3).join(' ');
  return bigram ?? (keywordTopic || text.slice(0, 80) || 'untitled');
}

export function rssArticleFingerprint(article: ObservableRssArticle): string {
  const basis = article.url || article.link
    ? normalizeUrl(article.url || article.link)
    : `${article.sourceUrl ?? article.source}:${article.title}:${article.publishedAt ?? article.published ?? ''}`;
  return createHash('sha1').update(basis).digest('hex');
}

function toObservedItem(
  article: ObservableRssArticle,
  now: Date,
  existing?: ObservedRssItem,
): ObservedRssItem | null {
  const title = article.title.trim();
  if (!title) return null;

  const summary = (article.summary || article.description || '').trim().slice(0, 500);
  const link = article.link ? normalizeUrl(article.link) : existing?.link;
  const url = article.url ? normalizeUrl(article.url) : existing?.url;

  return {
    fingerprint: rssArticleFingerprint(article),
    title,
    link,
    url,
    source: article.source,
    sourceUrl: article.sourceUrl || article.source,
    publishedAt: normalizeDate(article.publishedAt ?? article.published) ?? existing?.publishedAt,
    firstSeenAt: existing?.firstSeenAt ?? now.toISOString(),
    lastSeenAt: now.toISOString(),
    summary: summary || existing?.summary,
    topicKey: createRssTopicKey(title, summary),
  };
}

function itemTime(item: ObservedRssItem): number {
  const published = item.publishedAt ? Date.parse(item.publishedAt) : Number.NaN;
  const firstSeen = Date.parse(item.firstSeenAt);
  if (Number.isFinite(published)) return Math.max(published, firstSeen);
  return firstSeen;
}

function firstSeenTime(item: ObservedRssItem): number {
  return Date.parse(item.firstSeenAt);
}

function lastSeenTime(item: ObservedRssItem): number {
  return Date.parse(item.lastSeenAt);
}

function classifyTopic(
  firstSeenAt: number,
  recentCount: number,
  previousCount: number,
  sourceCount: number,
  recentCutoff: number,
): RssTopicStatus {
  if (recentCount === 0) return 'stale';
  if (firstSeenAt >= recentCutoff) return 'new';
  if (sourceCount >= 2 && recentCount >= 2 && (previousCount === 0 || recentCount >= previousCount * 2)) {
    return 'spiking';
  }
  return 'continuing';
}

function formatTopicLabel(topicKey: string, items: ObservedRssItem[]): string {
  const shortestTitle = items.map((item) => item.title).sort((a, b) => a.length - b.length)[0];
  if (!shortestTitle) return topicKey;
  return normalizeText(shortestTitle).includes(normalizeText(topicKey)) ? shortestTitle : topicKey;
}

function toTopicArticle(item: ObservedRssItem): RssTopicArticle {
  return {
    title: item.title,
    link: item.link,
    url: item.url,
    source: item.source,
    publishedAt: item.publishedAt,
    firstSeenAt: item.firstSeenAt,
    summary: item.summary,
  };
}

function buildCluster(topic: string, items: ObservedRssItem[], now: Date, hours: number): RssTopicCluster {
  const windowMs = hours * 60 * 60 * 1000;
  const recentCutoff = now.getTime() - windowMs;
  const previousCutoff = now.getTime() - windowMs * 2;
  const sorted = [...items].sort((a, b) => itemTime(b) - itemTime(a));
  const firstSeenAtMs = Math.min(...items.map(firstSeenTime));
  const lastSeenAtMs = Math.max(...items.map(lastSeenTime));
  const sources = [...new Set(items.map((item) => item.source))].sort();
  const recentCount = items.filter((item) => itemTime(item) >= recentCutoff).length;
  const previousCount = items.filter((item) => {
    const time = itemTime(item);
    return time >= previousCutoff && time < recentCutoff;
  }).length;
  const status = classifyTopic(firstSeenAtMs, recentCount, previousCount, sources.length, recentCutoff);
  const statusBoost = status === 'spiking' ? 30 : status === 'new' ? 20 : status === 'continuing' ? 8 : 0;
  const recencyBoost = Math.max(0, Math.round((lastSeenAtMs - recentCutoff) / (60 * 60 * 1000)));
  const score = recentCount * 10 + sources.length * 8 + statusBoost + recencyBoost;

  return {
    topic,
    label: formatTopicLabel(topic, sorted),
    status,
    score,
    articleCount: items.length,
    sourceCount: sources.length,
    sources,
    firstSeenAt: new Date(firstSeenAtMs).toISOString(),
    lastSeenAt: new Date(lastSeenAtMs).toISOString(),
    recentCount,
    previousCount,
    representativeArticles: sorted.slice(0, 3).map(toTopicArticle),
  };
}

function buildTopicClusters(items: ObservedRssItem[], now: Date, hours: number, limit: number): RssTopicCluster[] {
  const grouped = new Map<string, ObservedRssItem[]>();
  for (const item of items) {
    const group = grouped.get(item.topicKey) ?? [];
    group.push(item);
    grouped.set(item.topicKey, group);
  }

  return [...grouped.entries()]
    .map(([topic, group]) => buildCluster(topic, group, now, hours))
    .filter((cluster) => cluster.recentCount > 0)
    .sort((a, b) => b.score - a.score || b.recentCount - a.recentCount)
    .slice(0, limit);
}

function pruneState(state: ObservationState, now: Date, settings: ObservationSettings): ObservationState {
  const cutoff = now.getTime() - settings.retentionHours * 60 * 60 * 1000;
  const perSource = new Map<string, number>();
  const items = [...state.items]
    .filter((item) => {
      const lastSeen = Date.parse(item.lastSeenAt);
      return Number.isFinite(lastSeen) && lastSeen >= cutoff;
    })
    .sort((a, b) => lastSeenTime(b) - lastSeenTime(a))
    .filter((item) => {
      const count = perSource.get(item.sourceUrl) ?? 0;
      if (count >= settings.maxItemsPerSource) return false;
      perSource.set(item.sourceUrl, count + 1);
      return true;
    })
    .slice(0, settings.maxItems);

  return {
    schemaVersion: 1,
    updatedAt: now.toISOString(),
    items,
  };
}

function loadState(now: Date, settings: ObservationSettings): ObservationState {
  if (!settings.filePath) {
    inMemoryState ??= emptyState(now);
    return pruneState(inMemoryState, now, settings);
  }

  try {
    if (!existsSync(settings.filePath)) {
      return inMemoryState ? pruneState(inMemoryState, now, settings) : emptyState(now);
    }
    const parsed = JSON.parse(readFileSync(settings.filePath, 'utf8')) as unknown;
    return isObservationState(parsed) ? pruneState(parsed, now, settings) : emptyState(now);
  } catch {
    return inMemoryState ? pruneState(inMemoryState, now, settings) : emptyState(now);
  }
}

function saveState(state: ObservationState, settings: ObservationSettings): string | undefined {
  if (!settings.filePath) {
    inMemoryState = state;
    return undefined;
  }

  try {
    mkdirSync(dirname(settings.filePath), { recursive: true });
    const tmp = `${settings.filePath}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify(state, null, 2));
    renameSync(tmp, settings.filePath);
    return undefined;
  } catch (error) {
    inMemoryState = state;
    const message = error instanceof Error ? error.message : String(error);
    return `RSS observation history was not persisted: ${message}`;
  }
}

export function observeRssArticles(articles: ObservableRssArticle[]): RssObservationResult {
  const settings = observationSettings();
  const now = new Date();
  const current = loadState(now, settings);
  const byFingerprint = new Map(current.items.map((item) => [item.fingerprint, item]));

  for (const article of articles) {
    const observed = toObservedItem(article, now, byFingerprint.get(rssArticleFingerprint(article)));
    if (observed) byFingerprint.set(observed.fingerprint, observed);
  }

  const next = pruneState({
    schemaVersion: 1,
    updatedAt: now.toISOString(),
    items: [...byFingerprint.values()],
  }, now, settings);
  const warning = saveState(next, settings);
  const topics = buildTopicClusters(next.items, now, settings.hours, settings.limit);
  const nextByFingerprint = new Map(next.items.map((item) => [item.fingerprint, item]));
  const topicByKey = new Map(topics.map((topic) => [topic.topic, topic]));
  const metadataByFingerprint = new Map<string, RssObservationMetadata>();

  for (const article of articles) {
    const fingerprint = rssArticleFingerprint(article);
    const observed = nextByFingerprint.get(fingerprint);
    if (!observed) continue;
    const topic = topicByKey.get(observed.topicKey);
    metadataByFingerprint.set(fingerprint, {
      topicKey: observed.topicKey,
      topicStatus: topic?.status ?? 'stale',
      firstSeenAt: observed.firstSeenAt,
      lastSeenAt: observed.lastSeenAt,
      topicArticleCount: topic?.articleCount ?? 1,
      topicSourceCount: topic?.sourceCount ?? 1,
    });
  }

  return {
    generatedAt: next.updatedAt,
    topics,
    metadataByFingerprint,
    warning,
  };
}
