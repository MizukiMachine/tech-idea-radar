import type { RssContext } from '../services/rss-client';
import type { IdeaCandidate } from './idea-candidate';
import type { RssArticleSummaryPolicy } from '../policies/rss-summary-policy';

export interface IdeaGenerationInput {
  rssContext?: RssContext;
  focusKeywords?: string[];
  requestedIdeaCount?: number;
}

export interface UsedRssSource {
  title: string;
  url: string;
  lastUsedAt?: string;
  count?: number;
  ideaTitles?: string[];
}

export interface BatchInfo {
  batchTime: string;
  generatedAt: string;
  ideaCount: number;
}

export interface IdeaGenerationOutput {
  candidates: IdeaCandidate[];
  featuredIdea?: IdeaCandidate;
  generatedAt: string;
  batchTime?: string;
  sourceSummary: {
    rssItemCount: number;
    usedLLMFallback: boolean;
    dataQuality?: 'external';
    warnings?: string[];
  };
}

export interface TrendScanOutput {
  rssContext: RssContext;
  focusKeywords: string[];
  generatedAt: string;
  sourceSummary: IdeaGenerationOutput['sourceSummary'];
  summaryPolicy: RssArticleSummaryPolicy;
}
