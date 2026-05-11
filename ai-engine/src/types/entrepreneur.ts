import { SelfAnalysisOutput } from './self-analysis';
import { MarketResearchOutput } from './market-research';
import { IdeaProposalOutput } from './idea-proposal';

export interface WorkflowInput {
  selfAnalysisInput: import('./self-analysis').SelfAnalysisInput;
  targetMarkets: import('./market-research').TargetMarket[];
  initialCompetitors: string[];
}

export interface WorkflowResult {
  steps: {
    skillAnalysis: SelfAnalysisOutput;
    marketResearch: MarketResearchOutput;
    ideaProposal: IdeaProposalOutput;
  };
  completedAt: string;
  totalProcessingTime: number;
}

export type StepResult =
  | { step: 1; output: SelfAnalysisOutput }
  | { step: 2; output: MarketResearchOutput }
  | { step: 3; output: IdeaProposalOutput };
