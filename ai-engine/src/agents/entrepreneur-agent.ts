import { LLMClient } from '../services/llm-client';
import { validateObject } from '../services/output-validator';
import { SelfAnalysisAgent } from './self-analysis-agent';
import { MarketResearchAgent } from './market-research-agent';
import { IdeaProposalAgent } from './idea-proposal-agent';
import { SelfAnalysisInput, SelfAnalysisOutput } from '../types/self-analysis';
import { MarketResearchInput, MarketResearchOutput } from '../types/market-research';
import { IdeaProposalInput, IdeaProposalOutput } from '../types/idea-proposal';
import { WorkflowInput, WorkflowResult, StepResult } from '../types/entrepreneur';
import { AgentStep } from '../config/constants';
import { fetchRssContext } from '../services/mcp-client';
import { fetchXContext } from '../services/x-client';

const SELF_ANALYSIS_REQUIRED = [
  'swotAnalysis.strengths',
  'swotAnalysis.weaknesses',
  'swotAnalysis.opportunities',
  'swotAnalysis.threats',
  'directionRecommendation.recommendedAreas',
  'directionRecommendation.areasToAvoid',
  'skillMap.topStrengths',
  'achievementSummary.quantifiableStrengths',
  'valueAnalysis.corePriorities',
  'handoff.competitorCandidates',
];

const MARKET_RESEARCH_REQUIRED = [
  'marketAnalysis.trends',
  'competitorAnalysis.directCompetitors',
  'opportunityAnalysis.blueOceanAreas',
];

const IDEA_PROPOSAL_REQUIRED = [
  'personas.personas',
  'painPoints.commonPainPoints',
  'productIdeas',
  'overallRecommendation',
];

function safeMap<T, U>(arr: T[] | undefined, fn: (item: T) => U, label: string): U[] {
  if (!arr || !Array.isArray(arr)) {
    console.warn(`EntrepreneurAgent: missing array "${label}" — using empty fallback`);
    return [];
  }
  return arr.map(fn);
}

export class EntrepreneurAgent {
  private readonly selfAnalysis: SelfAnalysisAgent;
  private readonly marketResearch: MarketResearchAgent;
  private readonly ideaProposal: IdeaProposalAgent;

  constructor(llm: LLMClient) {
    this.selfAnalysis = new SelfAnalysisAgent(llm);
    this.marketResearch = new MarketResearchAgent(llm);
    this.ideaProposal = new IdeaProposalAgent(llm);
  }

  async runStep(step: AgentStep, input: unknown): Promise<unknown> {
    if (!input || typeof input !== 'object') {
      throw new Error(`Invalid input for step ${step}: expected object`);
    }
    const stepName = AgentStep[step];
    console.log(`[${stepName}] Starting step ${step} execution`);
    const start = Date.now();
    try {
      let result: unknown;
      switch (step) {
        case AgentStep.SkillAnalysis:
          result = await this.selfAnalysis.execute(input as SelfAnalysisInput);
          break;
        case AgentStep.MarketResearch:
          result = await this.marketResearch.execute(input as MarketResearchInput);
          break;
        case AgentStep.IdeaProposal:
          result = await this.ideaProposal.execute(input as IdeaProposalInput);
          break;
        default:
          throw new Error(`Unknown step: ${step}`);
      }
      console.log(`[${stepName}] Completed in ${Date.now() - start}ms`);
      return result;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error(`[${stepName}] Failed after ${Date.now() - start}ms: ${msg}`);
      throw error;
    }
  }

  async runWorkflow(
    input: WorkflowInput,
    onStepComplete?: (result: StepResult) => void,
    onStepProgress?: (step: number, text: string) => void,
  ): Promise<WorkflowResult> {
    const startTime = Date.now();
    console.log('[Workflow] Starting 3-step business planning workflow');

    // Step 1: Skill Analysis
    const step1Raw = await this.selfAnalysis.execute(input.selfAnalysisInput,
      onStepProgress ? (text) => onStepProgress(1, text) : undefined);
    const step1 = validateObject<SelfAnalysisOutput>(step1Raw, SELF_ANALYSIS_REQUIRED, 'SkillAnalysis');
    onStepComplete?.({ step: 1, output: step1 });
    console.log('[Workflow] Step 1 (SkillAnalysis) complete');

    // Fetch RSS + X enrichment data in parallel between Step 1 and Step 2
    const searchKeywords = [
      ...safeMap(step1.directionRecommendation.recommendedAreas, a => a.area, 'recommendedAreas').slice(0, 3),
      ...step1.skillMap.topStrengths.slice(0, 2),
    ];
    const competitorCandidates = step1.handoff.competitorCandidates ?? [];
    onStepProgress?.(2, '[Enrichment] RSS + X enrichment: fetching...');
    const [rssContext, xContext] = await Promise.all([
      fetchRssContext(searchKeywords),
      fetchXContext(searchKeywords, competitorCandidates),
    ]);
    const rssCount = rssContext.trendingKeywords.length + rssContext.relatedArticles.length;
    const xCount = xContext.trendingTopics.length + xContext.demandSignals.length + xContext.competitorSentiments.length;
    console.log(`[Workflow] Enrichment: RSS: ${rssCount} items, X: ${xCount} signals`);
    onStepProgress?.(2, `[Enrichment] RSS: ${rssCount} items, X: ${xCount} signals\n\nAnalyzing market...`);

    // Step 2: Market Research (receives handoff from Step 1)
    const step2Input: MarketResearchInput = {
      selfAnalysisHandoff: {
        swot: {
          strengths: safeMap(step1.swotAnalysis.strengths, s => s.item, 'strengths'),
          weaknesses: safeMap(step1.swotAnalysis.weaknesses, w => w.item, 'weaknesses'),
          opportunities: safeMap(step1.swotAnalysis.opportunities, o => o.item, 'opportunities'),
          threats: safeMap(step1.swotAnalysis.threats, t => t.item, 'threats'),
        },
        recommendedAreas: safeMap(step1.directionRecommendation.recommendedAreas, a => a.area, 'recommendedAreas'),
        areasToAvoid: safeMap(step1.directionRecommendation.areasToAvoid, a => a.area, 'areasToAvoid'),
        uniqueStrengths: step1.skillMap.topStrengths ?? [],
      },
      targetMarkets: input.targetMarkets,
      initialCompetitors: input.initialCompetitors.length > 0
        ? input.initialCompetitors
        : step1.handoff.competitorCandidates,
      rssContext,
      xContext,
    };
    const step2Raw = await this.marketResearch.execute(step2Input,
      onStepProgress ? (text) => onStepProgress(2, text) : undefined);
    const step2 = validateObject<MarketResearchOutput>(step2Raw, MARKET_RESEARCH_REQUIRED, 'MarketResearch');
    onStepComplete?.({ step: 2, output: step2 });
    console.log('[Workflow] Step 2 (MarketResearch) complete');

    // Extracted market research summaries (used by Step 3)
    const marketTrends = safeMap(step2.marketAnalysis.trends, t => t.name, 'trends');
    const competitorNames = safeMap(step2.competitorAnalysis.directCompetitors, c => c.name, 'directCompetitors');
    const marketOpportunities = safeMap(step2.opportunityAnalysis.blueOceanAreas, a => a.area, 'blueOceanAreas');

    // Step 3: Idea Proposal (receives Step 1 + 2 results)
    const step3Input: IdeaProposalInput = {
      previousSteps: {
        skillAnalysis: {
          strengths: safeMap(step1.swotAnalysis.strengths, s => s.item, 'strengths'),
          skills: step1.skillMap.topStrengths ?? [],
          achievements: step1.achievementSummary.quantifiableStrengths ?? [],
          valuePropositions: step1.valueAnalysis.corePriorities ?? [],
        },
        marketResearch: {
          marketTrends,
          competitorAnalysis: competitorNames,
          marketOpportunities,
        },
      },
    };
    const step3Raw = await this.ideaProposal.execute(step3Input,
      onStepProgress ? (text) => onStepProgress(3, text) : undefined);
    const step3 = validateObject<IdeaProposalOutput>(step3Raw, IDEA_PROPOSAL_REQUIRED, 'IdeaProposal');
    onStepComplete?.({ step: 3, output: step3 });
    console.log('[Workflow] Step 3 (IdeaProposal) complete');

    const totalTime = Date.now() - startTime;
    console.log(`[Workflow] All 3 steps complete in ${totalTime}ms`);
    return {
      steps: { skillAnalysis: step1, marketResearch: step2, ideaProposal: step3 },
      completedAt: new Date().toISOString(),
      totalProcessingTime: totalTime,
    };
  }
}
