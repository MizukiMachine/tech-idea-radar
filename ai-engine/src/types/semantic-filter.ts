import type { IdeaCandidate } from './idea-candidate';

export interface SemanticFilterInput {
  query: string;
  candidates: IdeaCandidate[];
  topK?: number;
}

export interface SemanticFilterOutput {
  filteredCandidates: IdeaCandidate[];
  filterReasoning: string;
  matchCriteria: string[];
}
