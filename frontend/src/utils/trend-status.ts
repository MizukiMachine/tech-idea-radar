import type { RssArticle, RssTopicStatus } from '../api/ai';

export const TOPIC_STATUS_LABEL: Record<RssTopicStatus, string> = {
  spiking: '急増',
  new: '新着',
  continuing: '継続',
  stale: '観測済み',
};

export function topicStatusLabel(status: RssTopicStatus | undefined): string {
  return status ? TOPIC_STATUS_LABEL[status] : '未分類';
}

export function topicStatusRank(status: RssTopicStatus | undefined): number {
  if (status === 'spiking') return 3;
  if (status === 'new') return 2;
  if (status === 'continuing') return 1;
  return 0;
}

const INFERRED_NEW_WINDOW_MS = 72 * 60 * 60 * 1000;

function parseTime(value: string | undefined): number | null {
  if (!value) return null;
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : null;
}

export function displayTopicStatus(
  article: Pick<RssArticle, 'topicStatus' | 'firstSeenAt' | 'publishedAt' | 'published' | 'lastSeenAt'>,
  referenceDate?: string,
): RssTopicStatus | null {
  if (article.topicStatus) {
    return article.topicStatus === 'stale' ? null : article.topicStatus;
  }

  const articleTime = parseTime(article.firstSeenAt)
    ?? parseTime(article.publishedAt)
    ?? parseTime(article.published)
    ?? parseTime(article.lastSeenAt);
  if (!articleTime) return null;

  const referenceTime = parseTime(referenceDate) ?? Date.now();
  return referenceTime - articleTime <= INFERRED_NEW_WINDOW_MS ? 'new' : null;
}
