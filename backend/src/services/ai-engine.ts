import {
  ClaudeClient,
  EntrepreneurAgent,
  Phase,
  SelfAnalysisInput,
  MarketResearchInput,
  PersonaInput,
  ProductConceptInput,
  WorkflowInput,
  WorkflowResult,
} from 'ai-engine';

let entrepreneurAgent: EntrepreneurAgent | null = null;

function getAgent(): EntrepreneurAgent {
  if (!entrepreneurAgent) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY environment variable is required');
    }
    const model = process.env.CLAUDE_MODEL;
    const client = new ClaudeClient(apiKey, model);
    entrepreneurAgent = new EntrepreneurAgent(client);
  }
  return entrepreneurAgent;
}

export async function executePhase(phaseNumber: number, input: unknown): Promise<unknown> {
  const agent = getAgent();
  return agent.runPhase(phaseNumber as Phase, input);
}

export async function runWorkflow(input: WorkflowInput): Promise<WorkflowResult> {
  const agent = getAgent();
  return agent.runWorkflow(input);
}
