export interface PersonaInput {
  previousPhases: {
    selfAnalysis: { strengths: string[]; skills: string[]; achievements: string[]; valuePropositions: string[] };
    marketResearch: { marketTrends: string[]; competitorAnalysis: string[]; marketOpportunities: string[] };
  };
  options?: PersonaOptions;
}

export interface PersonaOptions {
  personaCount?: number;
  focusSegment?: 'B2B' | 'B2C' | 'both';
  detailLevel?: 'basic' | 'detailed' | 'comprehensive';
}

export interface PersonaOutput {
  personaSheet: PersonaSheet;
  customerJourneyMap: CustomerJourneyMap;
  painPointAnalysis: PainPointAnalysis;
  handoff: PersonaHandoff;
}

export interface PersonaSheet {
  personas: Persona[];
  priorityRanking: { personaId: string; rank: number; rationale: string }[];
  commonTraits: string[];
}

export interface Persona {
  id: string;
  name: string;
  demographics: Demographics;
  lifestyle: Lifestyle;
  psychographics: Psychographics;
  challenges: Challenge[];
  informationSources: InformationSource[];
  buyingBehavior: BuyingBehavior;
  approachStrategy: ApproachStrategy;
}

export interface Demographics {
  age: number;
  gender: 'male' | 'female' | 'other';
  occupation: string;
  jobTitle?: string;
  annualIncome: number;
  location: string;
  familyStructure: string;
}

export interface Lifestyle {
  weekdaySchedule: string;
  weekendActivities: string;
  hobbies: string[];
  deviceUsage: { smartphone: number; pc: number };
}

export interface Psychographics {
  workValues: string[];
  spendingHabits: string;
  selfInvestmentAttitude: string;
  fears: string[];
  desiredFuture: string;
}

export interface Challenge {
  description: string;
  severity: 'high' | 'medium' | 'low';
  urgency: 'high' | 'medium' | 'low';
  currentSolutions: string[];
  frustrations: string[];
}

export interface InformationSource {
  channel: string;
  usage: string;
  trustLevel: 'high' | 'medium' | 'low';
}

export interface BuyingBehavior {
  decisionSpeed: 'quick' | 'careful';
  priceSensitivity: 'high' | 'medium' | 'low';
  researchDepth: 'thorough' | 'minimal';
  wordOfMouthImportance: 'high' | 'medium' | 'low';
}

export interface ApproachStrategy {
  bestChannel: string;
  keyMessage: string;
  avoidApproach: string;
}

export interface CustomerJourneyMap {
  journeys: { personaId: string; stages: JourneyStage[] }[];
  criticalTouchpoints: string[];
  improvementOpportunities: string[];
}

export interface JourneyStage {
  stage: 'awareness' | 'interest' | 'consideration' | 'purchase' | 'retention' | 'advocacy';
  actions: string[];
  thoughts: string[];
  emotions: { level: number; description: string };
  touchpoints: string[];
  challenges: string[];
  opportunities: string[];
}

export interface PainPointAnalysis {
  byPersona: { personaId: string; personaName: string; topPainPoints: string[]; idealSolution: string; willingnessToPay: string }[];
  commonPainPoints: { description: string; impact: 'high' | 'medium' | 'low'; frequency: string }[];
}

export interface PersonaHandoff {
  priorityPersonas: { main: string; sub: string; rationale: string };
  criticalChallenges: string[];
  productDirection: string;
  recommendedPriceRange: { min: number; max: number; currency: string };
}
