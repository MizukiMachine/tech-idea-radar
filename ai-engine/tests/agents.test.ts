import { describe, it, expect, vi } from 'vitest';
import { LLMClient } from '../src/services/llm-client';
import { SelfAnalysisAgent } from '../src/agents/self-analysis-agent';
import { MarketResearchAgent } from '../src/agents/market-research-agent';
import { IdeaProposalAgent } from '../src/agents/idea-proposal-agent';
import { EntrepreneurAgent } from '../src/agents/entrepreneur-agent';
import { AgentStep } from '../src/config/constants';

// Mock LLMClient
vi.mock('../src/services/llm-client');

function createMockClient(response: string): LLMClient {
  const client = new LLMClient('test-key');
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

const IDEA_PROPOSAL_RESPONSE = JSON.stringify({
  personas: {
    personas: [{ id: 'p1', name: 'Taro', demographics: { age: 35, gender: 'male', occupation: 'Engineer', annualIncome: 8000000, location: 'Tokyo', familyStructure: 'Single' }, challenges: [{ description: 'No time', severity: 'high', urgency: 'high', currentSolutions: [] }], approachStrategy: { bestChannel: 'Twitter', keyMessage: 'Save time' } }],
    priorityRanking: [{ personaId: 'p1', rank: 1, rationale: '' }],
    commonTraits: [],
  },
  painPoints: { commonPainPoints: [{ description: 'Lack of time', impact: 'high', frequency: 'daily' }], criticalChallenges: [] },
  productIdeas: [{
    rank: 1, productName: 'AI Planner', tagline: 'Plan smarter', fitScore: 85,
    productType: 'B2B SaaS', whyThisFitsYou: 'Backend expertise',
    marketDemand: 'Growing demand', targetUsers: 'Small teams',
    coreProblem: 'Manual planning', howItWorks: 'AI automates planning',
    coreFeatures: [{ name: 'Auto-plan', description: 'Generate plans', priority: 'P0', includeInMvp: true }],
    differentiation: 'AI-first', competitorSituation: 'No strong AI competitor',
    mvpScope: { includeFeatures: ['Auto-plan'], estimatedTime: '2 weeks', techStack: { frontend: ['React'], backend: ['Node.js'], database: ['PostgreSQL'], infrastructure: ['AWS'] } },
    revenueModel: { model: 'subscription', pricing: { price: 2980, currency: 'JPY', model: 'monthly' }, threeYearForecast: { year1: { customers: 100, mrr: 298000 }, year2: { customers: 300, mrr: 894000 }, year3: { customers: 800, mrr: 2384000 } } },
    risks: ['Market may saturate'], nextStep: 'Build MVP',
  }],
  comparisonMatrix: { criteria: ['Fit', 'Demand', 'Competition', 'Revenue', 'Fun'], scores: [{ productName: 'AI Planner', scores: [90, 80, 70, 85, 90] }] },
  overallRecommendation: { topPick: 'AI Planner', topPickRationale: 'Best fit', alternativePath: 'Different niche', partingAdvice: 'Start small' },
  handoff: { priorityPersonas: { main: 'Taro', sub: '', rationale: '' }, recommendedPriceRange: { min: 1000, max: 5000, currency: 'JPY' }, productDirection: 'AI SaaS', nextStep: 'Build MVP' },
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
      personalProjects: [{
        name: 'CLI Tool',
        description: 'A developer CLI tool',
        technologies: ['TypeScript', 'Node.js'],
        stars: 200,
        status: 'active' as const,
        users: 50,
      }],
      techStackDetail: {
        primaryLanguages: ['TypeScript'],
        frameworks: ['React'],
        toolsAndPlatforms: ['VS Code', 'Git'],
        infrastructure: ['AWS'],
        preferredStack: 'TypeScript full-stack',
        yearsBuilding: 5,
      },
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

describe('IdeaProposalAgent', () => {
  it('builds user prompt and parses response', async () => {
    const client = createMockClient(IDEA_PROPOSAL_RESPONSE);
    const agent = new IdeaProposalAgent(client);
    const result = await agent.execute({
      previousSteps: {
        skillAnalysis: { strengths: ['Tech'], skills: ['Coding'], achievements: ['Shipped'], valuePropositions: ['Innovation'] },
        marketResearch: { marketTrends: ['AI'], competitorAnalysis: ['CompA'], marketOpportunities: ['Niche'] },
      },
    });

    expect(result.personas.personas[0].name).toBe('Taro');
    expect(result.productIdeas[0].productName).toBe('AI Planner');
    expect(result.overallRecommendation.topPick).toBe('AI Planner');
  });
});

describe('EntrepreneurAgent', () => {
  it('runStep delegates to correct agent', async () => {
    const client = createMockClient(SELF_ANALYSIS_RESPONSE);
    const agent = new EntrepreneurAgent(client);
    const result = await agent.runStep(AgentStep.SkillAnalysis, {
      careerHistory: [{ year: 2020, role: 'Engineer', company: 'Corp', industry: 'Tech', responsibilities: ['Dev'], achievements: ['Shipped'] }],
      skills: { technical: [], business: [], soft: [] },
      achievements: [],
      network: { industryContacts: 0, influentialConnections: 0, communities: [], socialMedia: [] },
      values: { priorities: ['Growth'], socialCauses: [], threeYearGoal: 'Launch', fiveYearVision: 'Scale', motivations: [] },
      personalProjects: [{
        name: 'CLI Tool',
        description: 'A developer CLI tool',
        technologies: ['TypeScript', 'Node.js'],
        stars: 200,
        status: 'active' as const,
        users: 50,
      }],
      techStackDetail: {
        primaryLanguages: ['TypeScript'],
        frameworks: ['React'],
        toolsAndPlatforms: ['VS Code', 'Git'],
        infrastructure: ['AWS'],
        preferredStack: 'TypeScript full-stack',
        yearsBuilding: 5,
      },
    });
    expect(result).toHaveProperty('metadata');
  });

  it('runStep throws on invalid input', async () => {
    const client = createMockClient('');
    const agent = new EntrepreneurAgent(client);
    await expect(agent.runStep(AgentStep.SkillAnalysis, null)).rejects.toThrow(/expected object/);
  });

  it('runWorkflow executes all 3 steps sequentially', async () => {
    const client = new LLMClient('test-key');
    const sendSpy = vi.spyOn(client, 'send');
    sendSpy
      .mockResolvedValueOnce(SELF_ANALYSIS_RESPONSE)
      .mockResolvedValueOnce(MARKET_RESEARCH_RESPONSE)
      .mockResolvedValueOnce(IDEA_PROPOSAL_RESPONSE);

    const agent = new EntrepreneurAgent(client);
    const completedSteps: number[] = [];
    const result = await agent.runWorkflow({
      selfAnalysisInput: {
        careerHistory: [{ year: 2020, role: 'Engineer', company: 'Corp', industry: 'Tech', responsibilities: ['Dev'], achievements: ['Shipped'] }],
        skills: { technical: [], business: [], soft: [] },
        achievements: [],
        network: { industryContacts: 0, influentialConnections: 0, communities: [], socialMedia: [] },
        values: { priorities: ['Growth'], socialCauses: [], threeYearGoal: 'Launch', fiveYearVision: 'Scale', motivations: [] },
        personalProjects: [{
          name: 'CLI Tool',
          description: 'A developer CLI tool',
          technologies: ['TypeScript', 'Node.js'],
          stars: 200,
          status: 'active' as const,
          users: 50,
        }],
        techStackDetail: {
          primaryLanguages: ['TypeScript'],
          frameworks: ['React'],
          toolsAndPlatforms: ['VS Code', 'Git'],
          infrastructure: ['AWS'],
          preferredStack: 'TypeScript full-stack',
          yearsBuilding: 5,
        },
      },
      targetMarkets: [{ name: 'Japan', description: 'JP market', priority: 1 }],
      initialCompetitors: [],
    }, (stepResult) => {
      completedSteps.push(stepResult.step);
    });

    expect(completedSteps).toEqual([1, 2, 3]);
    expect(result.steps.skillAnalysis.metadata.analysisId).toBe('test-1');
    expect(result.steps.marketResearch.metadata.researchId).toBe('test-2');
    expect(result.steps.ideaProposal.personas.personas[0].name).toBe('Taro');
    expect(result.steps.ideaProposal.productIdeas[0].productName).toBe('AI Planner');
    expect(result.totalProcessingTime).toBeGreaterThanOrEqual(0);
    expect(result.completedAt).toBeTruthy();
    expect(sendSpy).toHaveBeenCalledTimes(3);
  });

  it('runWorkflow uses competitorCandidates when initialCompetitors is empty', async () => {
    const client = new LLMClient('test-key');
    const sendSpy = vi.spyOn(client, 'send');
    sendSpy
      .mockResolvedValueOnce(SELF_ANALYSIS_RESPONSE)
      .mockResolvedValueOnce(MARKET_RESEARCH_RESPONSE)
      .mockResolvedValueOnce(IDEA_PROPOSAL_RESPONSE);

    const agent = new EntrepreneurAgent(client);
    await agent.runWorkflow({
      selfAnalysisInput: {
        careerHistory: [{ year: 2020, role: 'Engineer', company: 'Corp', industry: 'Tech', responsibilities: [], achievements: [] }],
        skills: { technical: [], business: [], soft: [] },
        achievements: [],
        network: { industryContacts: 0, influentialConnections: 0, communities: [], socialMedia: [] },
        values: { priorities: ['Growth'], socialCauses: [], threeYearGoal: 'Launch', fiveYearVision: 'Scale', motivations: [] },
        personalProjects: [{
          name: 'CLI Tool',
          description: 'A developer CLI tool',
          technologies: ['TypeScript', 'Node.js'],
          stars: 200,
          status: 'active' as const,
          users: 50,
        }],
        techStackDetail: {
          primaryLanguages: ['TypeScript'],
          frameworks: ['React'],
          toolsAndPlatforms: ['VS Code', 'Git'],
          infrastructure: ['AWS'],
          preferredStack: 'TypeScript full-stack',
          yearsBuilding: 5,
        },
      },
      targetMarkets: [{ name: 'Japan', description: 'JP market', priority: 1 }],
      initialCompetitors: [],
    });

    const marketResearchCall = sendSpy.mock.calls[1];
    const userPrompt = marketResearchCall?.[1] ?? '';
    expect(userPrompt).toContain('CompetitorA');
  });
});

describe('LLMClient', () => {
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
