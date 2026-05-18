export interface RssSourceUnavailableDetails {
  operation?: string;
  focusKeywords?: string[];
  rssArticleCount?: number;
  trendingKeywordCount?: number;
  skippedPreviouslyUsedRssCount?: number;
  sourceNames?: string[];
  sourceErrors?: { source: string; message: string }[];
  summaryErrors?: {
    index: number;
    title: string;
    source: string;
    message: string;
    url?: string;
  }[];
  summaryFailureCount?: number;
}

export class RssSourceUnavailableError extends Error {
  readonly details: RssSourceUnavailableDetails;

  constructor(message: string, details: RssSourceUnavailableDetails = {}) {
    super(message);
    this.name = 'RssSourceUnavailableError';
    this.details = details;
  }
}

export function isRssSourceUnavailableError(error: unknown): error is RssSourceUnavailableError {
  if (error instanceof RssSourceUnavailableError) return true;
  return Boolean(
    error
    && typeof error === 'object'
    && (error as { name?: string }).name === 'RssSourceUnavailableError',
  );
}
