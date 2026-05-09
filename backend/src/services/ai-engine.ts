import {
  LLMClient,
  EntrepreneurAgent,
  Phase,
  WorkflowInput,
  WorkflowResult,
  PhaseResult,
} from 'ai-engine';

let cachedClient: LLMClient | null = null;

function getClient(): LLMClient {
  if (!cachedClient) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY environment variable is required');
    }
    const model = process.env.LLM_MODEL;
    const baseURL = process.env.LLM_BASE_URL;
    cachedClient = new LLMClient(apiKey, model, undefined, baseURL);
  }
  return cachedClient;
}

export async function executePhase(phase: Phase, input: unknown): Promise<unknown> {
  const agent = new EntrepreneurAgent(getClient());
  return agent.runPhase(phase, input);
}

export async function runWorkflow(
  input: WorkflowInput,
  onPhaseComplete?: (result: PhaseResult) => void,
): Promise<WorkflowResult> {
  const agent = new EntrepreneurAgent(getClient());
  return agent.runWorkflow(input, onPhaseComplete);
}
