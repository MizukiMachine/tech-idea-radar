export interface MarketResearchInput {
  selfAnalysisHandoff: {
    swot: {
      strengths: string[];
      weaknesses: string[];
      opportunities: string[];
      threats: string[];
    };
    recommendedAreas: string[];
    areasToAvoid: string[];
    uniqueStrengths: string[];
  };
  targetMarkets: TargetMarket[];
  initialCompetitors: string[];
  options?: ResearchOptions;
}

export interface TargetMarket {
  name: string;
  description: string;
  estimatedSize?: string;
  priority: 1 | 2 | 3;
}

export interface ResearchOptions {
  minimumCompetitors?: number;
  includeIndirectCompetitors?: boolean;
  includePotentialEntrants?: boolean;
  detailLevel?: 'summary' | 'standard' | 'detailed';
}

export interface MarketResearchOutput {
  metadata: ResearchMetadata;
  marketAnalysis: MarketAnalysisResult;
  competitorAnalysis: CompetitorAnalysisResult;
  opportunityAnalysis: OpportunityAnalysisResult;
  customerNeeds: CustomerNeedsResult;
  handoff: Phase3Handoff;
}

export interface ResearchMetadata {
  researchId: string;
  researchedAt: string;
  researchVersion: string;
  processingTime: number;
  dataQualityScore: number;
}

export interface MarketAnalysisResult {
  marketSize: MarketSizeAnalysis;
  trends: TrendAnalysis[];
  technologicalChanges: TechnologicalChange[];
  regulatoryLandscape: RegulatoryAnalysis;
  marketMaturity: 'emerging' | 'growth' | 'mature' | 'declining';
}

export interface MarketSizeAnalysis {
  tam: MarketSizeData;
  sam: MarketSizeData;
  som: MarketSizeData;
  growthRate: { historical: number; projected: number };
  currency: string;
}

export interface MarketSizeData {
  value: number;
  unit: 'billion' | 'million' | 'thousand';
  year: number;
  source?: string;
}

export interface TrendAnalysis {
  rank: number;
  name: string;
  description: string;
  impactLevel: 'high' | 'medium' | 'low';
  timeframe: 'short-term' | 'medium-term' | 'long-term';
  relevanceScore: number;
  opportunities: string[];
  threats: string[];
}

export interface TechnologicalChange {
  technology: string;
  adoptionRate: number;
  maturityLevel: 'emerging' | 'growing' | 'mainstream' | 'declining';
  impact: string;
  ourReadiness: 'ready' | 'partial' | 'not-ready';
}

export interface RegulatoryAnalysis {
  currentRegulations: Regulation[];
  upcomingRegulations: Regulation[];
  complianceRequirements: string[];
  riskLevel: 'high' | 'medium' | 'low';
}

export interface Regulation {
  name: string;
  jurisdiction: string;
  effectiveDate?: string;
  impact: string;
  complianceCost: 'high' | 'medium' | 'low';
}

export interface CompetitorAnalysisResult {
  totalCompetitors: number;
  directCompetitors: CompetitorProfile[];
  indirectCompetitors: CompetitorProfile[];
  potentialEntrants?: CompetitorProfile[];
  pricingAnalysis: PricingAnalysis;
  competitiveLandscape: CompetitiveLandscape;
}

export interface CompetitorProfile {
  rank: number;
  name: string;
  website?: string;
  businessModel: string;
  targetCustomer: string;
  priceRange: { min: number; max: number; currency: string; model: string };
  strengths: string[];
  weaknesses: string[];
  differentiators: string[];
  threatLevel: 'high' | 'medium' | 'low';
  overallScore: number;
}

export interface PricingAnalysis {
  priceSegments: PriceSegment[];
  averagePrice: number;
  priceLeader: string;
  pricingTrend: 'increasing' | 'stable' | 'decreasing';
}

export interface PriceSegment {
  segment: 'low' | 'mid' | 'high' | 'premium';
  priceRange: string;
  competitorCount: number;
  representatives: string[];
}

export interface CompetitiveLandscape {
  concentrationLevel: 'fragmented' | 'moderate' | 'concentrated' | 'monopolistic';
  marketLeader: string;
  marketLeaderShare: number;
  top3Share: number;
  entryBarriers: EntryBarrier[];
}

export interface EntryBarrier {
  type: string;
  level: 'high' | 'medium' | 'low';
  description: string;
  ourPosition: string;
}

export interface OpportunityAnalysisResult {
  gapAnalysis: GapAnalysisItem[];
  blueOceanAreas: BlueOceanArea[];
  differentiationPoints: DifferentiationPoint[];
  recommendedStrategy: string;
  confidenceLevel: number;
}

export interface GapAnalysisItem {
  customerNeed: string;
  currentSolutions: string[];
  unmetAspects: string[];
  opportunitySize: 'high' | 'medium' | 'low';
  ourFitScore: number;
}

export interface BlueOceanArea {
  rank: number;
  area: string;
  description: string;
  marketSize: string;
  entryBarrier: 'high' | 'medium' | 'low';
  successProbability: 'high' | 'medium' | 'low';
  timeToMarket: string;
  requiredInvestment: string;
  keySuccessFactors: string[];
  risks: string[];
  leveragedStrengths: string[];
}

export interface DifferentiationPoint {
  point: string;
  basedOnStrength: string;
  competitorWeakness: string;
  customerValue: string;
  sustainability: 'high' | 'medium' | 'low';
}

export interface CustomerNeedsResult {
  primaryNeeds: CustomerNeed[];
  latentNeeds: string[];
  painPoints: PainPoint[];
  customerSegments: CustomerSegment[];
}

export interface CustomerNeed {
  rank: number;
  need: string;
  affectedPopulation: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  currentSolution: string;
  dissatisfactionAreas: string[];
  willingnessToPay: 'high' | 'medium' | 'low';
}

export interface PainPoint {
  description: string;
  frequency: 'daily' | 'weekly' | 'monthly' | 'occasionally';
  impact: 'high' | 'medium' | 'low';
  existingSolutions: string[];
  solutionGaps: string[];
}

export interface CustomerSegment {
  name: string;
  size: string;
  characteristics: string[];
  needs: string[];
  currentSpending: string;
  acquisitionDifficulty: 'easy' | 'moderate' | 'difficult';
  recommendedPriority: number;
}

export interface Phase3Handoff {
  recommendedSegments: RecommendedSegment[];
  primaryChallenge: string;
  idealCustomerProfile: string;
  avoidSegments: string[];
  keyQuestions: string[];
  nextPhaseReady: boolean;
  handoffNotes: string;
}

export interface RecommendedSegment {
  segment: string;
  priority: number;
  rationale: string;
  marketSize: string;
  competitionLevel: 'low' | 'medium' | 'high';
}
