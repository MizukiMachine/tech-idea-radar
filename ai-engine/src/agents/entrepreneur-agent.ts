import { ClaudeClient } from '../services/claude-client';
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

export class EntrepreneurAgent {
  private readonly selfAnalysis: SelfAnalysisAgent;
  private readonly marketResearch: MarketResearchAgent;
  private readonly persona: PersonaAgent;
  private readonly productConcept: ProductConceptAgent;

  constructor(claude: ClaudeClient) {
    this.selfAnalysis = new SelfAnalysisAgent(claude);
    this.marketResearch = new MarketResearchAgent(claude);
    this.persona = new PersonaAgent(claude);
    this.productConcept = new ProductConceptAgent(claude);
  }

  async runPhase(phase: Phase, input: unknown): Promise<unknown> {
    if (!input || typeof input !== 'object') {
      throw new Error(`Invalid input for phase ${phase}: expected object`);
    }
    switch (phase) {
      case Phase.SelfAnalysis:
        return this.selfAnalysis.execute(input as SelfAnalysisInput);
      case Phase.MarketResearch:
        return this.marketResearch.execute(input as MarketResearchInput);
      case Phase.Persona:
        return this.persona.execute(input as PersonaInput);
      case Phase.ProductConcept:
        return this.productConcept.execute(input as ProductConceptInput);
      default:
        throw new Error(`Unknown phase: ${phase}`);
    }
  }

  async runWorkflow(input: WorkflowInput, onPhaseComplete?: (result: PhaseResult) => void): Promise<WorkflowResult> {
    const startTime = Date.now();

    // Phase 1: Self Analysis
    const phase1Raw = await this.selfAnalysis.execute(input.selfAnalysisInput);
    const phase1 = validateObject<SelfAnalysisOutput>(phase1Raw, SELF_ANALYSIS_REQUIRED, 'SelfAnalysis');
    onPhaseComplete?.({ phase: 1, output: phase1 });

    // Phase 2: Market Research (receives handoff from Phase 1)
    const phase2Input: MarketResearchInput = {
      selfAnalysisHandoff: {
        swot: {
          strengths: phase1.swotAnalysis.strengths.map(s => s.item),
          weaknesses: phase1.swotAnalysis.weaknesses.map(w => w.item),
          opportunities: phase1.swotAnalysis.opportunities.map(o => o.item),
          threats: phase1.swotAnalysis.threats.map(t => t.item),
        },
        recommendedAreas: phase1.directionRecommendation.recommendedAreas.map(a => a.area),
        areasToAvoid: phase1.directionRecommendation.areasToAvoid.map(a => a.area),
        uniqueStrengths: phase1.skillMap.topStrengths,
      },
      targetMarkets: input.targetMarkets,
      initialCompetitors: input.initialCompetitors.length > 0
        ? input.initialCompetitors
        : phase1.handoff.competitorCandidates,
    };
    const phase2Raw = await this.marketResearch.execute(phase2Input);
    const phase2 = validateObject<MarketResearchOutput>(phase2Raw, MARKET_RESEARCH_REQUIRED, 'MarketResearch');
    onPhaseComplete?.({ phase: 2, output: phase2 });

    // Phase 3: Persona (receives Phase 1 + 2 results)
    const phase3Input: PersonaInput = {
      previousPhases: {
        selfAnalysis: {
          strengths: phase1.swotAnalysis.strengths.map(s => s.item),
          skills: phase1.skillMap.topStrengths,
          achievements: phase1.achievementSummary.quantifiableStrengths,
          valuePropositions: phase1.valueAnalysis.corePriorities,
        },
        marketResearch: {
          marketTrends: phase2.marketAnalysis.trends.map(t => t.name),
          competitorAnalysis: phase2.competitorAnalysis.directCompetitors.map(c => c.name),
          marketOpportunities: phase2.opportunityAnalysis.blueOceanAreas.map(a => a.area),
        },
      },
    };
    const phase3Raw = await this.persona.execute(phase3Input);
    const phase3 = validateObject<PersonaOutput>(phase3Raw, PERSONA_REQUIRED, 'Persona');
    onPhaseComplete?.({ phase: 3, output: phase3 });

    // Phase 4: Product Concept (receives Phase 2 + 3 results)
    const phase4Input: ProductConceptInput = {
      previousPhases: {
        marketResearch: {
          marketTrends: phase2.marketAnalysis.trends.map(t => t.name),
          competitorAnalysis: phase2.competitorAnalysis.directCompetitors.map(c => c.name),
          marketOpportunities: phase2.opportunityAnalysis.blueOceanAreas.map(a => a.area),
        },
        persona: {
          personas: phase3.personaSheet.personas.map(p => p.name),
          customerJourneySummary: phase3.customerJourneyMap.criticalTouchpoints.join(', '),
          painPointSummary: phase3.painPointAnalysis.commonPainPoints.map(p => p.description).join(', '),
        },
      },
    };
    const phase4Raw = await this.productConcept.execute(phase4Input);
    const phase4 = validateObject<ProductConceptOutput>(phase4Raw, PRODUCT_CONCEPT_REQUIRED, 'ProductConcept');
    onPhaseComplete?.({ phase: 4, output: phase4 });

    return {
      phases: { selfAnalysis: phase1, marketResearch: phase2, persona: phase3, productConcept: phase4 },
      completedAt: new Date().toISOString(),
      totalProcessingTime: Date.now() - startTime,
    };
  }
}
