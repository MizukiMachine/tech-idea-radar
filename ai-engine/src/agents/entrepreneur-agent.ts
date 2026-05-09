import { LLMClient } from '../services/llm-client';
import { validateObject } from '../services/output-validator';
import { SelfAnalysisAgent } from './self-analysis-agent';
import { MarketResearchAgent } from './market-research-agent';
import { PersonaAgent } from './persona-agent';
import { ProductConceptAgent } from './product-concept-agent';
import { SelfAnalysisInput, SelfAnalysisOutput } from '../types/self-analysis';
import { MarketResearchInput, MarketResearchOutput } from '../types/market-research';
import { PersonaInput, PersonaOutput } from '../types/persona';
import { ProductConceptInput, ProductConceptOutput } from '../types/product-concept';
import { WorkflowInput, WorkflowResult, PhaseResult } from '../types/entrepreneur';
import { Phase } from '../config/constants';

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

const PERSONA_REQUIRED = [
  'personaSheet.personas',
  'customerJourneyMap.criticalTouchpoints',
  'painPointAnalysis.commonPainPoints',
];

const PRODUCT_CONCEPT_REQUIRED = [
  'productConcept',
  'businessModelCanvas',
  'revenueModel',
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
  private readonly persona: PersonaAgent;
  private readonly productConcept: ProductConceptAgent;

  constructor(llm: LLMClient) {
    this.selfAnalysis = new SelfAnalysisAgent(llm);
    this.marketResearch = new MarketResearchAgent(llm);
    this.persona = new PersonaAgent(llm);
    this.productConcept = new ProductConceptAgent(llm);
  }

  async runPhase(phase: Phase, input: unknown): Promise<unknown> {
    if (!input || typeof input !== 'object') {
      throw new Error(`Invalid input for phase ${phase}: expected object`);
    }
    const phaseName = Phase[phase];
    console.log(`[${phaseName}] Starting phase ${phase} execution`);
    const start = Date.now();
    try {
      let result: unknown;
      switch (phase) {
        case Phase.SelfAnalysis:
          result = await this.selfAnalysis.execute(input as SelfAnalysisInput);
          break;
        case Phase.MarketResearch:
          result = await this.marketResearch.execute(input as MarketResearchInput);
          break;
        case Phase.Persona:
          result = await this.persona.execute(input as PersonaInput);
          break;
        case Phase.ProductConcept:
          result = await this.productConcept.execute(input as ProductConceptInput);
          break;
        default:
          throw new Error(`Unknown phase: ${phase}`);
      }
      console.log(`[${phaseName}] Completed in ${Date.now() - start}ms`);
      return result;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error(`[${phaseName}] Failed after ${Date.now() - start}ms: ${msg}`);
      throw error;
    }
  }

  async runWorkflow(input: WorkflowInput, onPhaseComplete?: (result: PhaseResult) => void): Promise<WorkflowResult> {
    const startTime = Date.now();
    console.log('[Workflow] Starting 4-phase business planning workflow');

    // Phase 1: Self Analysis
    const phase1Raw = await this.selfAnalysis.execute(input.selfAnalysisInput);
    const phase1 = validateObject<SelfAnalysisOutput>(phase1Raw, SELF_ANALYSIS_REQUIRED, 'SelfAnalysis');
    onPhaseComplete?.({ phase: 1, output: phase1 });
    console.log('[Workflow] Phase 1 (SelfAnalysis) complete');

    // Phase 2: Market Research (receives handoff from Phase 1)
    const phase2Input: MarketResearchInput = {
      selfAnalysisHandoff: {
        swot: {
          strengths: safeMap(phase1.swotAnalysis.strengths, s => s.item, 'strengths'),
          weaknesses: safeMap(phase1.swotAnalysis.weaknesses, w => w.item, 'weaknesses'),
          opportunities: safeMap(phase1.swotAnalysis.opportunities, o => o.item, 'opportunities'),
          threats: safeMap(phase1.swotAnalysis.threats, t => t.item, 'threats'),
        },
        recommendedAreas: safeMap(phase1.directionRecommendation.recommendedAreas, a => a.area, 'recommendedAreas'),
        areasToAvoid: safeMap(phase1.directionRecommendation.areasToAvoid, a => a.area, 'areasToAvoid'),
        uniqueStrengths: phase1.skillMap.topStrengths ?? [],
      },
      targetMarkets: input.targetMarkets,
      initialCompetitors: input.initialCompetitors.length > 0
        ? input.initialCompetitors
        : phase1.handoff.competitorCandidates,
    };
    const phase2Raw = await this.marketResearch.execute(phase2Input);
    const phase2 = validateObject<MarketResearchOutput>(phase2Raw, MARKET_RESEARCH_REQUIRED, 'MarketResearch');
    onPhaseComplete?.({ phase: 2, output: phase2 });
    console.log('[Workflow] Phase 2 (MarketResearch) complete');

    // Extracted market research summaries (used by Phase 3 and 4)
    const marketTrends = safeMap(phase2.marketAnalysis.trends, t => t.name, 'trends');
    const competitorNames = safeMap(phase2.competitorAnalysis.directCompetitors, c => c.name, 'directCompetitors');
    const marketOpportunities = safeMap(phase2.opportunityAnalysis.blueOceanAreas, a => a.area, 'blueOceanAreas');

    // Phase 3: Persona (receives Phase 1 + 2 results)
    const phase3Input: PersonaInput = {
      previousPhases: {
        selfAnalysis: {
          strengths: safeMap(phase1.swotAnalysis.strengths, s => s.item, 'strengths'),
          skills: phase1.skillMap.topStrengths ?? [],
          achievements: phase1.achievementSummary.quantifiableStrengths ?? [],
          valuePropositions: phase1.valueAnalysis.corePriorities ?? [],
        },
        marketResearch: {
          marketTrends,
          competitorAnalysis: competitorNames,
          marketOpportunities,
        },
      },
    };
    const phase3Raw = await this.persona.execute(phase3Input);
    const phase3 = validateObject<PersonaOutput>(phase3Raw, PERSONA_REQUIRED, 'Persona');
    onPhaseComplete?.({ phase: 3, output: phase3 });
    console.log('[Workflow] Phase 3 (Persona) complete');

    // Phase 4: Product Concept (receives Phase 2 + 3 results)
    const phase4Input: ProductConceptInput = {
      previousPhases: {
        marketResearch: {
          marketTrends,
          competitorAnalysis: competitorNames,
          marketOpportunities,
        },
        persona: {
          personas: safeMap(phase3.personaSheet.personas, p => p.name, 'personas'),
          customerJourneySummary: phase3.customerJourneyMap.criticalTouchpoints?.join(', ') ?? '',
          painPointSummary: safeMap(phase3.painPointAnalysis.commonPainPoints, p => p.description, 'commonPainPoints').join(', '),
        },
      },
    };
    const phase4Raw = await this.productConcept.execute(phase4Input);
    const phase4 = validateObject<ProductConceptOutput>(phase4Raw, PRODUCT_CONCEPT_REQUIRED, 'ProductConcept');
    onPhaseComplete?.({ phase: 4, output: phase4 });

    const totalTime = Date.now() - startTime;
    console.log(`[Workflow] All 4 phases complete in ${totalTime}ms`);
    return {
      phases: { selfAnalysis: phase1, marketResearch: phase2, persona: phase3, productConcept: phase4 },
      completedAt: new Date().toISOString(),
      totalProcessingTime: totalTime,
    };
  }
}
