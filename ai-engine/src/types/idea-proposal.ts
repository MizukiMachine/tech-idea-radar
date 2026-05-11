export interface IdeaProposalInput {
  previousSteps: {
    skillAnalysis: {
      strengths: string[];
      skills: string[];
      achievements: string[];
      valuePropositions: string[];
    };
    marketResearch: {
      marketTrends: string[];
      competitorAnalysis: string[];
      marketOpportunities: string[];
    };
  };
  options?: IdeaProposalOptions;
}

export interface IdeaProposalOptions {
  personaCount?: number;
  focusSegment?: 'B2B' | 'B2C' | 'both';
  detailLevel?: 'basic' | 'detailed' | 'comprehensive';
}

export interface IdeaProposalOutput {
  personas: {
    personas: PersonaProfile[];
    priorityRanking: { personaId: string; rank: number; rationale: string }[];
    commonTraits: string[];
  };
  painPoints: {
    commonPainPoints: { description: string; impact: 'high' | 'medium' | 'low'; frequency: string }[];
    criticalChallenges: string[];
  };
  productIdeas: ProductIdea[];
  comparisonMatrix: {
    criteria: string[];
    scores: { productName: string; scores: number[] }[];
  };
  overallRecommendation: {
    topPick: string;
    topPickRationale: string;
    alternativePath: string;
    partingAdvice: string;
  };
  handoff: {
    priorityPersonas: { main: string; sub: string; rationale: string };
    recommendedPriceRange: { min: number; max: number; currency: string };
    productDirection: string;
    nextStep: string;
  };
}

export interface PersonaProfile {
  id: string;
  name: string;
  demographics: { age: number; gender: string; occupation: string; annualIncome: number; location: string; familyStructure: string };
  challenges: { description: string; severity: 'high' | 'medium' | 'low'; urgency: 'high' | 'medium' | 'low'; currentSolutions: string[] }[];
  approachStrategy: { bestChannel: string; keyMessage: string };
}

export interface ProductIdea {
  rank: number;
  productName: string;
  tagline: string;
  fitScore: number;
  productType: string;
  whyThisFitsYou: string;
  marketDemand: string;
  targetUsers: string;
  coreProblem: string;
  howItWorks: string;
  coreFeatures: { name: string; description: string; priority: string; includeInMvp: boolean }[];
  differentiation: string;
  competitorSituation: string;
  mvpScope: { includeFeatures: string[]; estimatedTime: string; techStack: { frontend: string[]; backend: string[]; database: string[]; infrastructure: string[] } };
  revenueModel: { model: string; pricing: { price: number; currency: string; model: string }; threeYearForecast: { year1: { customers: number; mrr: number }; year2: { customers: number; mrr: number }; year3: { customers: number; mrr: number } } };
  risks: string[];
  nextStep: string;
}
