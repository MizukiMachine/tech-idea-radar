import type { RssContext } from '../services/mcp-client';
import type { IdeaCandidate } from './idea-candidate';

export interface IdeaGenerationInput {
  rssContext?: RssContext;
  focusKeywords?: string[];
  previousIdeas?: IdeaCandidate[];
  requestedIdeaCount?: number;
  recentlyUsedSources?: UsedRssSource[];
}

export interface UsedRssSource {
  title: string;
  url: string;
  lastUsedAt?: string;
  count?: number;
  ideaTitles?: string[];
}

export interface IdeaGenerationOutput {
  candidates: IdeaCandidate[];
  generatedAt: string;
  sourceSummary: {
    rssItemCount: number;
    usedLLMFallback: boolean;
    dataQuality?: 'external' | 'llm_fallback';
    warnings?: string[];
    generatedIdeaCount?: number;
    newIdeaCount?: number;
    duplicateIdeaCount?: number;
    totalIdeaCount?: number;
    maxStoredIdeaCount?: number;
    usedSourceUrlCount?: number;
    skippedPreviouslyUsedRssCount?: number;
  };
}

export interface TrendScanOutput {
  rssContext: RssContext;
  focusKeywords: string[];
  generatedAt: string;
  sourceSummary: IdeaGenerationOutput['sourceSummary'];
}
