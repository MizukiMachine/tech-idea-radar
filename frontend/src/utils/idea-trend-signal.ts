import type { TrendScan, RssArticle, RssTopicCluster, RssTopicStatus } from '../api/ai';
import type { IdeaCandidate } from '../types/idea-candidate';
import type { IdeaTrendEvidenceArticle, IdeaTrendSignal } from '../types/idea-trend-signal';
import { displayTopicStatus, topicStatusRank } from './trend-status';

function normalizeUrl(value: string | undefined): string {
  if (!value) return '';
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

function articleUrl(article: RssArticle): string {
  return article.url || article.link;
}

function signalText(value: string): string {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}#+.\-\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function clusterMatchesIdea(cluster: RssTopicCluster, idea: IdeaCandidate): boolean {
  const keywords = idea.sources.rssKeywords.map(signalText).filter((keyword) => keyword.length >= 2);
  if (keywords.length === 0) return false;

  const clusterText = signalText(`${cluster.topic} ${cluster.label} ${cluster.sources.join(' ')}`);
  const ideaText = signalText([
    idea.title,
    idea.tagline,
    idea.productType,
    idea.coreProblem,
    idea.differentiation,
    ...idea.tags,
  ].join(' '));

  return keywords.some((keyword) => {
    if (keyword.length <= 2) return clusterText.split(/\s+/).includes(keyword) && ideaText.includes(keyword);
    return clusterText.includes(keyword) || ideaText.includes(keyword);
  });
}

function toEvidenceArticle(article: RssArticle): IdeaTrendEvidenceArticle | null {
  const url = articleUrl(article);
  if (!url) return null;
  return {
    title: article.titleJa || article.title,
    url,
    source: article.source || 'RSS',
    publishedAt: article.publishedAt ?? article.published,
    firstSeenAt: article.firstSeenAt,
    lastSeenAt: article.lastSeenAt,
    topicStatus: article.topicStatus,
  };
}

function bestCluster(clusters: RssTopicCluster[]): RssTopicCluster | null {
  return [...clusters].sort((a, b) => (
    topicStatusRank(b.status) - topicStatusRank(a.status)
    || b.score - a.score
    || b.articleCount - a.articleCount
  ))[0] ?? null;
}

export function ideaTrendSignalKey(idea: IdeaCandidate): string {
  return `${idea.id}:${idea.batchTime ?? idea.generatedAt}`;
}

export function buildIdeaTrendSignal(
  idea: IdeaCandidate,
  trends: TrendScan | null,
): IdeaTrendSignal | null {
  const articles = trends?.rssContext.relatedArticles ?? [];
  const clusters = trends?.rssContext.topicClusters ?? [];
  if (articles.length === 0 && clusters.length === 0) return null;

  const articleByUrl = new Map<string, RssArticle>();
  for (const article of articles) {
    const primaryUrl = normalizeUrl(articleUrl(article));
    const linkUrl = normalizeUrl(article.link);
    const canonicalUrl = normalizeUrl(article.url);
    if (primaryUrl) articleByUrl.set(primaryUrl, article);
    if (linkUrl) articleByUrl.set(linkUrl, article);
    if (canonicalUrl) articleByUrl.set(canonicalUrl, article);
  }

  const matchedArticles = (idea.sources.evidenceUrls ?? [])
    .map((source) => articleByUrl.get(normalizeUrl(source.url)))
    .filter((article): article is RssArticle => Boolean(article));

  const clusterByTopic = new Map(clusters.map((cluster) => [cluster.topic, cluster]));
  const articleClusters = matchedArticles
    .map((article) => (article.topicKey ? clusterByTopic.get(article.topicKey) : undefined))
    .filter((cluster): cluster is RssTopicCluster => Boolean(cluster));
  const keywordClusters = matchedArticles.length > 0
    ? []
    : clusters.filter((cluster) => cluster.status !== 'stale' && clusterMatchesIdea(cluster, idea)).slice(0, 3);
  const matchedClusters = [...articleClusters, ...keywordClusters]
    .filter((cluster, index, list) => list.findIndex((item) => item.topic === cluster.topic) === index);
  const cluster = bestCluster(matchedClusters);
  const articleStatus = matchedArticles
    .map((article) => displayTopicStatus(article, trends?.generatedAt))
    .filter((status): status is RssTopicStatus => Boolean(status))
    .sort((a, b) => topicStatusRank(b) - topicStatusRank(a))[0];

  if (!cluster && !articleStatus) return null;

  const evidenceArticles = matchedArticles
    .map(toEvidenceArticle)
    .filter((article): article is IdeaTrendEvidenceArticle => Boolean(article))
    .filter((article, index, list) => list.findIndex((item) => item.url === article.url) === index);
  const status = cluster?.status ?? articleStatus ?? 'continuing';
  const topic = cluster?.topic ?? matchedArticles[0]?.topicKey ?? idea.sources.rssKeywords[0] ?? idea.title;
  const label = cluster?.label ?? idea.sources.rssKeywords[0] ?? matchedArticles[0]?.titleJa ?? matchedArticles[0]?.title ?? idea.title;
  const articleCount = cluster?.articleCount
    ?? Math.max(...matchedArticles.map((article) => article.topicArticleCount ?? 1), 1);
  const sourceCount = cluster?.sourceCount
    ?? Math.max(...matchedArticles.map((article) => article.topicSourceCount ?? 1), 1);
  const sources = [
    ...(cluster?.sources ?? []),
    ...matchedArticles.map((article) => article.source).filter(Boolean),
  ].filter((source, index, list) => list.indexOf(source) === index);

  return {
    status,
    label,
    topic,
    sourceCount,
    articleCount,
    evidenceCount: evidenceArticles.length || (idea.sources.evidenceUrls ?? []).length,
    firstSeenAt: cluster?.firstSeenAt ?? matchedArticles.find((article) => article.firstSeenAt)?.firstSeenAt,
    lastSeenAt: cluster?.lastSeenAt ?? matchedArticles.find((article) => article.lastSeenAt)?.lastSeenAt,
    sources,
    evidenceArticles,
  };
}
