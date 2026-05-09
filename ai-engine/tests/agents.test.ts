import { describe, it, expect, vi } from 'vitest';
import { ClaudeClient } from '../src/services/claude-client';
import { SelfAnalysisAgent } from '../src/agents/self-analysis-agent';
import { MarketResearchAgent } from '../src/agents/market-research-agent';
import { PersonaAgent } from '../src/agents/persona-agent';
import { ProductConceptAgent } from '../src/agents/product-concept-agent';
import { EntrepreneurAgent } from '../src/agents/entrepreneur-agent';
import { Phase } from '../src/config/constants';

// Mock ClaudeClient
vi.mock('../src/services/claude-client');

function createMockClient(response: string): ClaudeClient {
  const client = new ClaudeClient('test-key');
  vi.spyOn(client, 'send').mockResolvedValue(response);
  return client;
}

const SELF_ANALYSIS_RESPONSE = JSON.stringify({
  metadata: { analysisId: 'test-1', analyzedAt: '2025-01-01', analysisVersion: '1', processingTime: 100, dataQualityScore: 0.9 },
  careerAnalysis: { timeline: [], highlights: [], trajectory: 'stable', totalExperienceYears: 5, industryExposure: [] },
  skillMap: { technicalSkills: [], businessSkills: [], softSkills: [], topStrengths: ['Leadership'], developmentAreas: [], uniqueCombination: '' },
  achievementSummary: { totalRevenueImpact: 0, largestProjectScale: 0, maxTeamManaged: 0, topAchievements: [], quantifiableStrengths: ['Revenue growth'] },
  networkAnalysis: { networkSize: 10, networkStrength: 'moderate', industryReach: [], onlinePresenceScore: 5, keyAssets: [], growthOpportunities: [] },
  valueAnalysis: { corePriorities: ['Innovation'], missionAlignment: '', goalClarity: 'clear', motivationProfile: { intrinsic: [], extrinsic: [], primary: '' } },
  swotAnalysis: {
    strengths: [{ item: 'Technical expertise', importance: 'high', actionability: 'high', relatedFactors: [] }],
    weaknesses: [{ item: 'Limited sales experience', importance: 'medium', actionability: 'medium', relatedFactors: [] }],
    opportunities: [{ item: 'AI market growth', importance: 'high', actionability: 'high', relatedFactors: [] }],
    threats: [{ item: 'Market competition', importance: 'medium', actionability: 'low', relatedFactors: [] }],
    keyInsights: [], strategicImplications: [],
  },
  directionRecommendation: {
    recommendedAreas: [{ area: 'AI SaaS', fitScore: 0.9, rationale: 'Strong technical fit', leveragedStrengths: [] }],
    areasToAvoid: [{ area: 'Hardware', riskLevel: 'high', reason: 'No experience', missingCapabilities: [] }],
    optimalBusinessModel: ['SaaS'], targetMarketHints: [],
  },
  completenessScore: { overall: 0.8, breakdown: { career: 0.8, skills: 0.8, achievements: 0.7, network: 0.6, values: 0.9, swot: 0.8 }, missingElements: [], recommendations: [] },
  handoff: { targetMarkets: ['Japan'], competitorCandidates: ['CompetitorA'], keyQuestions: [], nextPhaseReady: true, handoffNotes: '' },
});

const MARKET_RESEARCH_RESPONSE = JSON.stringify({
  metadata: { researchId: 'test-2', researchedAt: '2025-01-01', researchVersion: '1', processingTime: 100, dataQualityScore: 0.9 },
  marketAnalysis: {
    marketSize: { tam: { value: 100, unit: 'billion', year: 2025 }, sam: { value: 10, unit: 'billion', year: 2025 }, som: { value: 1, unit: 'billion', year: 2025 }, growthRate: { historical: 10, projected: 15 }, currency: 'JPY' },
    trends: [{ rank: 1, name: 'AI Adoption', description: 'Growing', impactLevel: 'high', timeframe: 'short-term', relevanceScore: 0.9, opportunities: [], threats: [] }],
    technologicalChanges: [], regulatoryLandscape: { currentRegulations: [], upcomingRegulations: [], complianceRequirements: [], riskLevel: 'low' },
    marketMaturity: 'growth',
  },
  competitorAnalysis: {
    totalCompetitors: 1,
    directCompetitors: [{ rank: 1, name: 'CompetitorA', businessModel: 'SaaS', targetCustomer: 'SMB', priceRange: { min: 1000, max: 5000, currency: 'JPY', model: 'monthly' }, strengths: [], weaknesses: [], differentiators: [], threatLevel: 'medium', overallScore: 7 }],
    indirectCompetitors: [], pricingAnalysis: { priceSegments: [], averagePrice: 3000, priceLeader: 'CompetitorA', pricingTrend: 'stable' },
    competitiveLandscape: { concentrationLevel: 'fragmented', marketLeader: 'CompetitorA', marketLeaderShare: 20, top3Share: 50, entryBarriers: [] },
  },
  opportunityAnalysis: {
    gapAnalysis: [], blueOceanAreas: [{ rank: 1, area: 'AI-powered niche', description: 'Untapped', marketSize: 'Large', entryBarrier: 'low', successProbability: 'high', timeToMarket: '6 months', requiredInvestment: '5M JPY', keySuccessFactors: [], risks: [], leveragedStrengths: [] }],
    differentiationPoints: [], recommendedStrategy: 'Focus on niche', confidenceLevel: 0.8,
  },
  customerNeeds: { primaryNeeds: [], latentNeeds: [], painPoints: [], customerSegments: [] },
  handoff: { recommendedSegments: [], primaryChallenge: '', idealCustomerProfile: '', avoidSegments: [], keyQuestions: [], nextPhaseReady: true, handoffNotes: '' },
});

const PERSONA_RESPONSE = JSON.stringify({
  personaSheet: {
    personas: [{ id: 'p1', name: 'Taro', demographics: { age: 35, gender: 'male', occupation: 'Engineer', annualIncome: 8000000, location: 'Tokyo', familyStructure: 'Single' }, lifestyle: { weekdaySchedule: '', weekendActivities: '', hobbies: [], deviceUsage: { smartphone: 4, pc: 8 } }, psychographics: { workValues: [], spendingHabits: '', selfInvestmentAttitude: '', fears: [], desiredFuture: '' }, challenges: [], informationSources: [], buyingBehavior: { decisionSpeed: 'careful', priceSensitivity: 'medium', researchDepth: 'thorough', wordOfMouthImportance: 'high' }, approachStrategy: { bestChannel: '', keyMessage: '', avoidApproach: '' } }],
    priorityRanking: [{ personaId: 'p1', rank: 1, rationale: '' }],
    commonTraits: [],
  },
  customerJourneyMap: { journeys: [], criticalTouchpoints: ['Website visit'], improvementOpportunities: [] },
  painPointAnalysis: { byPersona: [], commonPainPoints: [{ description: 'Lack of time', impact: 'high', frequency: 'daily' }] },
  handoff: { priorityPersonas: { main: 'Taro', sub: '', rationale: '' }, criticalChallenges: [], productDirection: '', recommendedPriceRange: { min: 1000, max: 5000, currency: 'JPY' } },
});

const PRODUCT_CONCEPT_RESPONSE = JSON.stringify({
  productConcept: { productName: 'AI Planner', tagline: 'Plan smarter', coreValuePropositions: [], targetCustomers: [], coreFeatures: [], differentiatingFeatures: [], usp: { mainUsp: 'AI-powered', supportingUsps: [], competitiveAdvantage: '' }, elevatorPitch: '' },
  businessModelCanvas: { customerSegments: [], valuePropositions: [], channels: [], customerRelationships: [], revenueStreams: [], keyResources: [], keyActivities: [], keyPartnerships: [], costStructure: { type: 'value-driven', fixedCosts: [], variableCosts: [], totalMonthlyCost: 500000 } },
  revenueModel: { modelType: 'subscription', pricingStrategy: { method: '', rationale: '' }, revenueStreams: [], threeYearForecast: { year1: { year: 1, customers: 100, mrr: 1000000, arr: 12000000, churnRate: 0.05 }, year2: { year: 2, customers: 300, mrr: 3000000, arr: 36000000, churnRate: 0.04 }, year3: { year: 3, customers: 800, mrr: 8000000, arr: 96000000, churnRate: 0.03 } }, unitEconomics: { arpu: 10000, ltv: 300000, cac: 50000, ltvCacRatio: 6, paybackPeriodMonths: 5 } },
  handoff: { coreFeatures: [], mvpScope: { includeFeatures: [], excludeFeatures: [], releaseTarget: '' }, techStackCandidates: { frontend: [], backend: [], database: [], infrastructure: [] } },
});

describe('SelfAnalysisAgent', () => {
  it('builds user prompt and parses response', async () => {
    const client = createMockClient(SELF_ANALYSIS_RESPONSE);
    const agent = new SelfAnalysisAgent(client);
    const result = await agent.execute({
      careerHistory: [{ year: 2020, role: 'Engineer', company: 'Corp', industry: 'Tech', responsibilities: ['Dev'], achievements: ['Shipped'] }],
      skills: { technical: [{ name: 'TypeScript', category: 'language', level: 4, yearsOfExperience: 5 }], business: [], soft: [] },
      achievements: [{ type: 'project', description: 'Built system', metric: 'users', value: 1000, unit: 'users', period: '2024' }],
      network: { industryContacts: 10, influentialConnections: 2, communities: [], socialMedia: [] },
      values: { priorities: ['Growth'], socialCauses: [], threeYearGoal: 'Launch startup', fiveYearVision: 'Scale', motivations: [] },
    });

    expect(result.metadata.analysisId).toBe('test-1');
    expect(result.swotAnalysis.strengths[0].item).toBe('Technical expertise');
    expect(client.send).toHaveBeenCalledOnce();
  });
});

describe('MarketResearchAgent', () => {
  it('builds user prompt and parses response', async () => {
    const client = createMockClient(MARKET_RESEARCH_RESPONSE);
    const agent = new MarketResearchAgent(client);
    const result = await agent.execute({
      selfAnalysisHandoff: { swot: { strengths: ['Tech'], weaknesses: [], opportunities: [], threats: [] }, recommendedAreas: ['AI'], areasToAvoid: [], uniqueStrengths: [] },
      targetMarkets: [{ name: 'Japan', description: 'Japanese market', priority: 1 }],
      initialCompetitors: ['CompetitorA'],
    });

    expect(result.metadata.researchId).toBe('test-2');
    expect(result.marketAnalysis.trends[0].name).toBe('AI Adoption');
  });
});

describe('PersonaAgent', () => {
  it('builds user prompt and parses response', async () => {
    const client = createMockClient(PERSONA_RESPONSE);
    const agent = new PersonaAgent(client);
    const result = await agent.execute({
      previousPhases: {
        selfAnalysis: { strengths: ['Tech'], skills: ['Coding'], achievements: ['Shipped'], valuePropositions: ['Innovation'] },
        marketResearch: { marketTrends: ['AI'], competitorAnalysis: ['CompA'], marketOpportunities: ['Niche'] },
      },
    });

    expect(result.personaSheet.personas[0].name).toBe('Taro');
    expect(result.painPointAnalysis.commonPainPoints[0].description).toBe('Lack of time');
  });
});

describe('ProductConceptAgent', () => {
  it('builds user prompt and parses response', async () => {
    const client = createMockClient(PRODUCT_CONCEPT_RESPONSE);
    const agent = new ProductConceptAgent(client);
    const result = await agent.execute({
      previousPhases: {
        marketResearch: { marketTrends: ['AI'], competitorAnalysis: ['CompA'], marketOpportunities: ['Niche'] },
        persona: { personas: ['Taro'], customerJourneySummary: 'Website', painPointSummary: 'Time' },
      },
    });

    expect(result.productConcept.productName).toBe('AI Planner');
    expect(result.revenueModel.unitEconomics.ltvCacRatio).toBe(6);
  });
});

describe('EntrepreneurAgent', () => {
  it('runPhase delegates to correct agent', async () => {
    const client = createMockClient(SELF_ANALYSIS_RESPONSE);
    const agent = new EntrepreneurAgent(client);
    const result = await agent.runPhase(Phase.SelfAnalysis, {
      careerHistory: [{ year: 2020, role: 'Engineer', company: 'Corp', industry: 'Tech', responsibilities: ['Dev'], achievements: ['Shipped'] }],
      skills: { technical: [], business: [], soft: [] },
      achievements: [],
      network: { industryContacts: 0, influentialConnections: 0, communities: [], socialMedia: [] },
      values: { priorities: ['Growth'], socialCauses: [], threeYearGoal: 'Launch', fiveYearVision: 'Scale', motivations: [] },
    });
    expect(result).toHaveProperty('metadata');
  });

  it('runPhase throws on invalid input', async () => {
    const client = createMockClient('');
    const agent = new EntrepreneurAgent(client);
    await expect(agent.runPhase(Phase.SelfAnalysis, null)).rejects.toThrow(/expected object/);
  });

  it('runWorkflow executes all 4 phases sequentially', async () => {
    const client = new ClaudeClient('test-key');
    const sendSpy = vi.spyOn(client, 'send');
    sendSpy
      .mockResolvedValueOnce(SELF_ANALYSIS_RESPONSE)
      .mockResolvedValueOnce(MARKET_RESEARCH_RESPONSE)
      .mockResolvedValueOnce(PERSONA_RESPONSE)
      .mockResolvedValueOnce(PRODUCT_CONCEPT_RESPONSE);

    const agent = new EntrepreneurAgent(client);
    const completedPhases: number[] = [];
    const result = await agent.runWorkflow({
      selfAnalysisInput: {
        careerHistory: [{ year: 2020, role: 'Engineer', company: 'Corp', industry: 'Tech', responsibilities: ['Dev'], achievements: ['Shipped'] }],
        skills: { technical: [], business: [], soft: [] },
        achievements: [],
        network: { industryContacts: 0, influentialConnections: 0, communities: [], socialMedia: [] },
        values: { priorities: ['Growth'], socialCauses: [], threeYearGoal: 'Launch', fiveYearVision: 'Scale', motivations: [] },
      },
      targetMarkets: [{ name: 'Japan', description: 'JP market', priority: 1 }],
      initialCompetitors: [],
    }, (phaseResult) => {
      completedPhases.push(phaseResult.phase);
    });

    expect(completedPhases).toEqual([1, 2, 3, 4]);
    expect(result.phases.selfAnalysis.metadata.analysisId).toBe('test-1');
    expect(result.phases.marketResearch.metadata.researchId).toBe('test-2');
    expect(result.phases.persona.personaSheet.personas[0].name).toBe('Taro');
    expect(result.phases.productConcept.productConcept.productName).toBe('AI Planner');
    expect(result.totalProcessingTime).toBeGreaterThanOrEqual(0);
    expect(result.completedAt).toBeTruthy();
    expect(sendSpy).toHaveBeenCalledTimes(4);
  });

  it('runWorkflow uses competitorCandidates when initialCompetitors is empty', async () => {
    const client = new ClaudeClient('test-key');
    const sendSpy = vi.spyOn(client, 'send');
    sendSpy
      .mockResolvedValueOnce(SELF_ANALYSIS_RESPONSE)
      .mockResolvedValueOnce(MARKET_RESEARCH_RESPONSE)
      .mockResolvedValueOnce(PERSONA_RESPONSE)
      .mockResolvedValueOnce(PRODUCT_CONCEPT_RESPONSE);

    const agent = new EntrepreneurAgent(client);
    await agent.runWorkflow({
      selfAnalysisInput: {
        careerHistory: [{ year: 2020, role: 'Engineer', company: 'Corp', industry: 'Tech', responsibilities: [], achievements: [] }],
        skills: { technical: [], business: [], soft: [] },
        achievements: [],
        network: { industryContacts: 0, influentialConnections: 0, communities: [], socialMedia: [] },
        values: { priorities: ['Growth'], socialCauses: [], threeYearGoal: 'Launch', fiveYearVision: 'Scale', motivations: [] },
      },
      targetMarkets: [{ name: 'Japan', description: 'JP market', priority: 1 }],
      initialCompetitors: [],
    });

    // Second call is MarketResearch — check the prompt contains competitorCandidates
    const marketResearchCall = sendSpy.mock.calls[1];
    const userPrompt = marketResearchCall?.[1] ?? '';
    expect(userPrompt).toContain('CompetitorA');
  });
});

describe('ClaudeClient', () => {
  it('send method returns response text from mocked client', async () => {
    const client = createMockClient('{"result": true}');
    const result = await client.send('system', 'user');
    expect(result).toBe('{"result": true}');
    expect(client.send).toHaveBeenCalledOnce();
  });

  it('send propagates API errors with timing info', async () => {
    const client = createMockClient('');
    vi.spyOn(client, 'send').mockRejectedValueOnce(new Error('API connection failed'));
    await expect(client.send('sys', 'usr')).rejects.toThrow('API connection failed');
  });
});
