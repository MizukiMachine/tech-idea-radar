import type { RssContext } from '../services/mcp-client';
import type { XContext } from './x-context';
import type { IdeaCandidate } from './idea-candidate';

export interface IdeaGenerationInput {
  rssContext?: RssContext;
  xContext?: XContext;
  focusKeywords?: string[];
}

export interface IdeaGenerationOutput {
  candidates: IdeaCandidate[];
  generatedAt: string;
  sourceSummary: {
    rssItemCount: number;
    xSignalCount: number;
    usedLLMFallback: boolean;
    dataQuality?: 'external' | 'llm_fallback';
    warnings?: string[];
  };
}
