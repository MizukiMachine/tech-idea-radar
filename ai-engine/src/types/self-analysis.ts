export interface PersonalProject {
  name: string;
  description: string;
  technologies: string[];
  githubUrl?: string;
  stars?: number;
  status: 'active' | 'completed' | 'archived';
  users?: number;
  lessonsLearned?: string[];
}

export interface TechStackDetail {
  primaryLanguages: string[];
  frameworks: string[];
  toolsAndPlatforms: string[];
  infrastructure: string[];
  preferredStack: string;
  yearsBuilding: number;
}

export interface OpenSourceActivity {
  contributions: string[];
  maintainedProjects: string[];
  communitiesActiveIn: string[];
  totalContributions?: number;
}

export interface ProductBuilderProfile {
  productsBuilt: string[];
  ideasExplored: string[];
  preferredDomain: string[];
  buildVsBuyPreference: 'build' | 'buy' | 'hybrid';
  soloVsTeam: 'solo' | 'small-team' | 'large-team';
}

export interface SelfAnalysisInput {
  careerHistory: CareerEntry[];
  skills: SkillInfo;
  achievements: Achievement[];
  network: NetworkInfo;
  values: ValueInfo;
  options?: AnalysisOptions;
  personalProjects?: PersonalProject[];
  techStackDetail?: TechStackDetail;
  openSourceActivity?: OpenSourceActivity;
  productBuilderProfile?: ProductBuilderProfile;
}

export interface CareerEntry {
  year: number;
  role: string;
  company: string;
  industry: string;
  responsibilities: string[];
  achievements: string[];
  teamSize?: number;
  budget?: number;
}

export interface SkillInfo {
  technical: TechnicalSkill[];
  business: BusinessSkill[];
  soft: SoftSkill[];
}

export interface TechnicalSkill {
  name: string;
  category: 'language' | 'framework' | 'tool' | 'infrastructure' | 'other';
  level: 1 | 2 | 3 | 4 | 5;
  yearsOfExperience: number;
  certifications?: string[];
}

export interface BusinessSkill {
  name: string;
  category: 'marketing' | 'sales' | 'finance' | 'management' | 'other';
  level: 1 | 2 | 3 | 4 | 5;
  achievements?: string[];
}

export interface SoftSkill {
  name: string;
  category: 'leadership' | 'communication' | 'problem_solving' | 'negotiation' | 'other';
  level: 1 | 2 | 3 | 4 | 5;
  examples?: string[];
}

export interface Achievement {
  type: 'revenue' | 'cost_reduction' | 'project' | 'team' | 'improvement' | 'other';
  description: string;
  metric: string;
  value: number;
  unit: string;
  period: string;
  context?: string;
}

export interface NetworkInfo {
  industryContacts: number;
  influentialConnections: number;
  communities: CommunityMembership[];
  socialMedia: SocialMediaPresence[];
}

export interface CommunityMembership {
  name: string;
  role: 'member' | 'organizer' | 'speaker' | 'founder';
  memberCount?: number;
}

export interface SocialMediaPresence {
  platform: 'twitter' | 'linkedin' | 'note' | 'youtube' | 'github' | 'other';
  handle: string;
  followers: number;
  posts?: number;
  engagement?: number;
}

export interface ValueInfo {
  priorities: string[];
  socialCauses: string[];
  threeYearGoal: string;
  fiveYearVision: string;
  motivations: string[];
}

export interface AnalysisOptions {
  includeSwot: boolean;
  includeDirection: boolean;
  detailLevel: 'summary' | 'standard' | 'detailed';
  focusAreas?: ('career' | 'skills' | 'achievements' | 'network' | 'values')[];
}

export interface SelfAnalysisOutput {
  metadata: AnalysisMetadata;
  careerAnalysis: CareerAnalysisResult;
  skillMap: SkillMapResult;
  achievementSummary: AchievementSummaryResult;
  networkAnalysis: NetworkAnalysisResult;
  valueAnalysis: ValueAnalysisResult;
  swotAnalysis: SWOTResult;
  directionRecommendation: DirectionResult;
  completenessScore: CompletenessScore;
  handoff: PhaseHandoff;
}

export interface AnalysisMetadata {
  analysisId: string;
  analyzedAt: string;
  analysisVersion: string;
  processingTime: number;
  dataQualityScore: number;
}

export interface CareerAnalysisResult {
  timeline: CareerTimelineEntry[];
  highlights: string[];
  trajectory: 'ascending' | 'stable' | 'transitioning' | 'mixed';
  totalExperienceYears: number;
  industryExposure: string[];
}

export interface CareerTimelineEntry {
  year: number;
  role: string;
  keyAchievements: string[];
  skillsGained: string[];
  growthIndicator: 'high' | 'medium' | 'low';
}

export interface SkillMapResult {
  technicalSkills: EvaluatedSkill[];
  businessSkills: EvaluatedSkill[];
  softSkills: EvaluatedSkill[];
  topStrengths: string[];
  developmentAreas: string[];
  uniqueCombination: string;
}

export interface EvaluatedSkill {
  name: string;
  level: number;
  marketValue: 'high' | 'medium' | 'low';
  growthPotential: 'high' | 'medium' | 'low';
  relevanceScore: number;
}

export interface AchievementSummaryResult {
  totalRevenueImpact: number;
  largestProjectScale: number;
  maxTeamManaged: number;
  topAchievements: RankedAchievement[];
  quantifiableStrengths: string[];
}

export interface RankedAchievement {
  rank: number;
  description: string;
  impactScore: number;
  category: string;
}

export interface NetworkAnalysisResult {
  networkSize: number;
  networkStrength: 'strong' | 'moderate' | 'developing';
  industryReach: string[];
  onlinePresenceScore: number;
  keyAssets: string[];
  growthOpportunities: string[];
}

export interface ValueAnalysisResult {
  corePriorities: string[];
  missionAlignment: string;
  motivationProfile: MotivationProfile;
  goalClarity: 'clear' | 'moderate' | 'unclear';
}

export interface MotivationProfile {
  intrinsic: string[];
  extrinsic: string[];
  primary: string;
}

export interface SWOTResult {
  strengths: SWOTItem[];
  weaknesses: SWOTItem[];
  opportunities: SWOTItem[];
  threats: SWOTItem[];
  keyInsights: string[];
  strategicImplications: string[];
}

export interface SWOTItem {
  item: string;
  importance: 'high' | 'medium' | 'low';
  actionability: 'high' | 'medium' | 'low';
  relatedFactors: string[];
}

export interface DirectionResult {
  recommendedAreas: RecommendedArea[];
  areasToAvoid: AreaToAvoid[];
  optimalBusinessModel: string[];
  targetMarketHints: string[];
}

export interface RecommendedArea {
  area: string;
  fitScore: number;
  rationale: string;
  leveragedStrengths: string[];
}

export interface AreaToAvoid {
  area: string;
  riskLevel: 'high' | 'medium' | 'low';
  reason: string;
  missingCapabilities: string[];
}

export interface CompletenessScore {
  overall: number;
  breakdown: {
    career: number;
    skills: number;
    achievements: number;
    network: number;
    values: number;
    swot: number;
  };
  missingElements: string[];
  recommendations: string[];
}

export interface PhaseHandoff {
  targetMarkets: string[];
  competitorCandidates: string[];
  keyQuestions: string[];
  nextPhaseReady: boolean;
  handoffNotes: string;
}
