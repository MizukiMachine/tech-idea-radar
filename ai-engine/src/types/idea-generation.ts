import type { RssContext } from '../services/rss-client';
import type { IdeaCandidate } from './idea-candidate';

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

export interface FeaturedTrend {
  title: string;
  titleJa?: string;
  url: string;
  source: string;
  published?: string;
  summary: string;
}

export interface TrendScanOutput {
  rssContext: RssContext;
  focusKeywords: string[];
  featuredTrend?: FeaturedTrend;
  generatedAt: string;
  sourceSummary: IdeaGenerationOutput['sourceSummary'];
}
