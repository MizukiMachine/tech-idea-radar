import { SelfAnalysisOutput } from './self-analysis';
import { MarketResearchOutput } from './market-research';
import { PersonaOutput } from './persona';
import { ProductConceptOutput } from './product-concept';

export interface WorkflowInput {
  selfAnalysisInput: import('./self-analysis').SelfAnalysisInput;
  targetMarkets: import('./market-research').TargetMarket[];
  initialCompetitors: string[];
}

export interface WorkflowResult {
  phases: {
    selfAnalysis: SelfAnalysisOutput;
    marketResearch: MarketResearchOutput;
    persona: PersonaOutput;
    productConcept: ProductConceptOutput;
  };
  completedAt: string;
  totalProcessingTime: number;
}

export type PhaseResult =
  | { phase: 1; output: SelfAnalysisOutput }
  | { phase: 2; output: MarketResearchOutput }
  | { phase: 3; output: PersonaOutput }
  | { phase: 4; output: ProductConceptOutput };
