import type { RssContext } from '../services/mcp-client';
import type { IdeaCandidate } from './idea-candidate';

export interface IdeaGenerationInput {
  rssContext?: RssContext;
  focusKeywords?: string[];
}

export interface IdeaGenerationOutput {
  candidates: IdeaCandidate[];
  generatedAt: string;
  sourceSummary: {
    rssItemCount: number;
    usedLLMFallback: boolean;
    dataQuality?: 'external' | 'llm_fallback';
    warnings?: string[];
  };
}

export interface TrendScanOutput {
  rssContext: RssContext;
  focusKeywords: string[];
  generatedAt: string;
  sourceSummary: IdeaGenerationOutput['sourceSummary'];
}
