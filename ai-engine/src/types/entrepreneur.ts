import { MarketResearchOutput } from './market-research';
import { IdeaProposalOutput } from './idea-proposal';

// Legacy types — kept for backward compatibility with remaining agents
export interface WorkflowResult {
  steps: {
    skillAnalysis: unknown;
    marketResearch: MarketResearchOutput;
    ideaProposal: IdeaProposalOutput;
  };
  completedAt: string;
  totalProcessingTime: number;
}

export type StepResult =
  | { step: 1; output: unknown }
  | { step: 2; output: MarketResearchOutput }
  | { step: 3; output: IdeaProposalOutput };
