import type { RssTopicStatus } from '../api/ai';

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
