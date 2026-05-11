import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { AgentStep } from 'ai-engine';
import { executeStep, runWorkflow } from '../services/ai-engine';

const VALID_STEPS = new Set<number>([AgentStep.SkillAnalysis, AgentStep.MarketResearch, AgentStep.IdeaProposal]);

const STEP_NAMES: Record<number, string> = {
  [AgentStep.SkillAnalysis]: 'SkillAnalysis',
  [AgentStep.MarketResearch]: 'MarketResearch',
  [AgentStep.IdeaProposal]: 'IdeaProposal',
};

// --- Request schemas ---

const PersonalProjectSchema = z.object({
  name: z.string(),
  description: z.string(),
  technologies: z.array(z.string()),
  githubUrl: z.string().optional(),
  stars: z.number().optional(),
  status: z.enum(['active', 'completed', 'archived']),
  users: z.number().optional(),
  lessonsLearned: z.array(z.string()).optional(),
});

const TechStackDetailSchema = z.object({
  primaryLanguages: z.array(z.string()),
  frameworks: z.array(z.string()),
  toolsAndPlatforms: z.array(z.string()),
  infrastructure: z.array(z.string()),
  preferredStack: z.string(),
  yearsBuilding: z.number().min(0),
});

const OpenSourceActivitySchema = z.object({
  contributions: z.array(z.string()),
  maintainedProjects: z.array(z.string()),
  communitiesActiveIn: z.array(z.string()),
  totalContributions: z.number().optional(),
});

const ProductBuilderProfileSchema = z.object({
  productsBuilt: z.array(z.string()),
  ideasExplored: z.array(z.string()),
  preferredDomain: z.array(z.string()),
  buildVsBuyPreference: z.enum(['build', 'buy', 'hybrid']),
  soloVsTeam: z.enum(['solo', 'small-team', 'large-team']),
});

const SelfAnalysisInputSchema = z.object({
  careerHistory: z.array(z.object({
    year: z.number(),
    role: z.string().min(1),
    company: z.string().min(1),
    industry: z.string().min(1),
    responsibilities: z.array(z.string()),
    achievements: z.array(z.string()),
    teamSize: z.number().optional(),
    budget: z.number().optional(),
  })).min(1),
  skills: z.object({
    technical: z.array(z.object({
      name: z.string(),
      category: z.enum(['language', 'framework', 'tool', 'infrastructure', 'other']),
      level: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
      yearsOfExperience: z.number().min(0),
      certifications: z.array(z.string()).optional(),
    })),
    business: z.array(z.object({
      name: z.string(),
      category: z.enum(['marketing', 'sales', 'finance', 'management', 'other']),
      level: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
      achievements: z.array(z.string()).optional(),
    })),
    soft: z.array(z.object({
      name: z.string(),
      category: z.enum(['leadership', 'communication', 'problem_solving', 'negotiation', 'other']),
      level: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
      examples: z.array(z.string()).optional(),
    })),
  }),
  achievements: z.array(z.object({
    type: z.enum(['revenue', 'cost_reduction', 'project', 'team', 'improvement', 'other']),
    description: z.string(),
    metric: z.string(),
    value: z.number(),
    unit: z.string(),
    period: z.string(),
    context: z.string().optional(),
  })),
  network: z.object({
    industryContacts: z.number().min(0),
    influentialConnections: z.number().min(0),
    communities: z.array(z.object({
      name: z.string(),
      role: z.enum(['member', 'organizer', 'speaker', 'founder']),
      memberCount: z.number().optional(),
    })),
    socialMedia: z.array(z.object({
      platform: z.enum(['twitter', 'linkedin', 'note', 'youtube', 'github', 'other']),
      handle: z.string(),
      followers: z.number().min(0),
      posts: z.number().optional(),
      engagement: z.number().optional(),
    })),
  }),
  values: z.object({
    priorities: z.array(z.string()).min(1),
    socialCauses: z.array(z.string()),
    threeYearGoal: z.string(),
    fiveYearVision: z.string(),
    motivations: z.array(z.string()),
  }),
  options: z.object({
    includeSwot: z.boolean(),
    includeDirection: z.boolean(),
    detailLevel: z.enum(['summary', 'standard', 'detailed']),
    focusAreas: z.array(z.enum(['career', 'skills', 'achievements', 'network', 'values'])).optional(),
  }).optional(),
  personalProjects: z.array(PersonalProjectSchema).optional(),
  techStackDetail: TechStackDetailSchema.optional(),
  openSourceActivity: OpenSourceActivitySchema.optional(),
  productBuilderProfile: ProductBuilderProfileSchema.optional(),
});

const MarketResearchInputSchema = z.object({
  selfAnalysisHandoff: z.object({
    swot: z.object({
      strengths: z.array(z.string()),
      weaknesses: z.array(z.string()),
      opportunities: z.array(z.string()),
      threats: z.array(z.string()),
    }),
    recommendedAreas: z.array(z.string()),
    areasToAvoid: z.array(z.string()),
    uniqueStrengths: z.array(z.string()),
  }),
  targetMarkets: z.array(z.object({
    name: z.string(),
    description: z.string(),
    estimatedSize: z.string().optional(),
    priority: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  })).min(1),
  initialCompetitors: z.array(z.string()),
  options: z.object({
    minimumCompetitors: z.number().optional(),
    includeIndirectCompetitors: z.boolean().optional(),
    includePotentialEntrants: z.boolean().optional(),
    detailLevel: z.enum(['summary', 'standard', 'detailed']).optional(),
  }).optional(),
});

const IdeaProposalInputSchema = z.object({
  previousSteps: z.object({
    skillAnalysis: z.object({
      strengths: z.array(z.string()),
      skills: z.array(z.string()),
      achievements: z.array(z.string()),
      valuePropositions: z.array(z.string()),
    }),
    marketResearch: z.object({
      marketTrends: z.array(z.string()),
      competitorAnalysis: z.array(z.string()),
      marketOpportunities: z.array(z.string()),
    }),
  }),
  options: z.object({
    personaCount: z.number().optional(),
    focusSegment: z.enum(['B2B', 'B2C', 'both']).optional(),
    detailLevel: z.enum(['basic', 'detailed', 'comprehensive']).optional(),
  }).optional(),
});

const STEP_SCHEMAS: Record<number, z.ZodType> = {
  [AgentStep.SkillAnalysis]: SelfAnalysisInputSchema,
  [AgentStep.MarketResearch]: MarketResearchInputSchema,
  [AgentStep.IdeaProposal]: IdeaProposalInputSchema,
};

const WorkflowInputSchema = z.object({
  selfAnalysisInput: SelfAnalysisInputSchema,
  targetMarkets: z.array(z.object({
    name: z.string(),
    description: z.string(),
    estimatedSize: z.string().optional(),
    priority: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  })).min(1),
  initialCompetitors: z.array(z.string()),
});

function formatZodError(error: z.ZodError): string {
  return error.issues.map((e: z.ZodIssue) => `${e.path.join('.')}: ${e.message}`).join('; ');
}

// --- SSE helper ---

function sseSend(res: Response, event: string, data: unknown, disconnected: boolean): boolean {
  if (disconnected) return false;
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  const ok = res.write(payload);
  res.socket?.setNoDelay(true);
  return ok;
}

// --- Routes ---

const router = Router();

router.post('/steps/:step', async (req: Request, res: Response) => {
  const stepNumber = parseInt(req.params.step, 10);
  if (!VALID_STEPS.has(stepNumber)) {
    res.status(400).json({ error: 'Step must be one of: 1 (SkillAnalysis), 2 (MarketResearch), 3 (IdeaProposal)' });
    return;
  }

  const schema = STEP_SCHEMAS[stepNumber];
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: `Validation failed: ${formatZodError(parsed.error)}` });
    return;
  }

  console.log(`[API] POST /steps/${stepNumber} (${STEP_NAMES[stepNumber]})`);
  try {
    const result = await executeStep(stepNumber as AgentStep, parsed.data);
    res.json({ step: stepNumber, status: 'completed', output: result });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[API] Step ${stepNumber} error: ${message}`);
    res.status(500).json({ step: stepNumber, status: 'error', error: message });
  }
});

router.post('/workflow', async (req: Request, res: Response) => {
  const parsed = WorkflowInputSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: `Validation failed: ${formatZodError(parsed.error)}` });
    return;
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  let disconnected = false;
  req.on('close', () => { disconnected = true; });

  console.log('[API] POST /workflow — starting full workflow');
  try {
    const result = await runWorkflow(parsed.data, (stepResult) => {
      sseSend(res, 'step_complete', {
        step: stepResult.step,
        name: STEP_NAMES[stepResult.step],
        output: stepResult.output,
      }, disconnected);
    }, (step, text) => {
      console.log(`[SSE] step_progress step=${step} len=${text.length}`);
      sseSend(res, 'step_progress', {
        step,
        text,
        charCount: text.length,
      }, disconnected);
    });

    sseSend(res, 'workflow_complete', result, disconnected);
    console.log('[API] Workflow completed successfully');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[API] Workflow error: ${message}`);
    sseSend(res, 'error', { error: message }, disconnected);
  }

  if (!disconnected) res.end();
});

export default router;
