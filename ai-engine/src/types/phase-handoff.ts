export interface PhaseHandoff {
  targetMarkets: string[];
  competitorCandidates: string[];
  keyQuestions: string[];
  nextPhaseReady: boolean;
  handoffNotes: string;
}
