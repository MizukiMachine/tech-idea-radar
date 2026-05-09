export interface ProductConceptInput {
  previousPhases: {
    marketResearch: { marketTrends: string[]; competitorAnalysis: string[]; marketOpportunities: string[] };
    persona: { personas: string[]; customerJourneySummary: string; painPointSummary: string };
  };
  options?: ConceptOptions;
}

export interface ConceptOptions {
  productNameCandidates?: string[];
  businessModelType?: 'subscription' | 'usage-based' | 'freemium' | 'transaction-fee' | 'hybrid';
  detailLevel?: 'basic' | 'detailed' | 'comprehensive';
}

export interface ProductConceptOutput {
  productConcept: ProductConcept;
  businessModelCanvas: BusinessModelCanvas;
  revenueModel: RevenueModel;
  handoff: ProductDesignHandoff;
}

export interface ProductConcept {
  productName: string;
  tagline: string;
  coreValuePropositions: string[];
  targetCustomers: string[];
  coreFeatures: CoreFeature[];
  differentiatingFeatures: string[];
  usp: { mainUsp: string; supportingUsps: string[]; competitiveAdvantage: string };
  elevatorPitch: string;
}

export interface CoreFeature {
  name: string;
  description: string;
  priority: 'P0' | 'P1' | 'P2';
  complexity: 'High' | 'Medium' | 'Low';
  includeInMvp: boolean;
}

export interface BusinessModelCanvas {
  customerSegments: { name: string; description: string; marketSize: string; priority: number }[];
  valuePropositions: { type: 'functional' | 'emotional' | 'social'; proposition: string; customerBenefit: string }[];
  channels: { name: string; stage: string; effectiveness: 'high' | 'medium' | 'low' }[];
  customerRelationships: { type: string; description: string }[];
  revenueStreams: { name: string; type: string; pricing: { model: string; price: number; currency: string }; contributionPercentage: number }[];
  keyResources: { type: string; description: string; necessity: 'critical' | 'important' | 'nice-to-have' }[];
  keyActivities: { category: string; description: string }[];
  keyPartnerships: { name: string; type: string; benefit: string }[];
  costStructure: { type: 'cost-driven' | 'value-driven'; fixedCosts: { item: string; amount: number }[]; variableCosts: { item: string; unitCost: number }[]; totalMonthlyCost: number };
}

export interface RevenueModel {
  modelType: string;
  pricingStrategy: { method: string; rationale: string };
  revenueStreams: { name: string; type: string; pricing: { model: string; price: number; currency: string }; contributionPercentage: number }[];
  threeYearForecast: {
    year1: YearForecast;
    year2: YearForecast;
    year3: YearForecast;
  };
  unitEconomics: {
    arpu: number;
    ltv: number;
    cac: number;
    ltvCacRatio: number;
    paybackPeriodMonths: number;
  };
}

export interface YearForecast {
  year: number;
  customers: number;
  mrr: number;
  arr: number;
  churnRate: number;
}

export interface ProductDesignHandoff {
  coreFeatures: CoreFeature[];
  mvpScope: { includeFeatures: string[]; excludeFeatures: string[]; releaseTarget: string };
  techStackCandidates: { frontend: string[]; backend: string[]; database: string[]; infrastructure: string[] };
}
