import type { RssTopicStatus } from '../api/ai';

export interface IdeaTrendEvidenceArticle {
  title: string;
  url: string;
  source: string;
  publishedAt?: string;
  firstSeenAt?: string;
  lastSeenAt?: string;
  topicStatus?: RssTopicStatus;
}

export interface IdeaTrendSignal {
  status: RssTopicStatus;
  label: string;
  topic: string;
  sourceCount: number;
  articleCount: number;
  evidenceCount: number;
  firstSeenAt?: string;
  lastSeenAt?: string;
  sources: string[];
  evidenceArticles: IdeaTrendEvidenceArticle[];
  relatedArticles: IdeaTrendEvidenceArticle[];
}
