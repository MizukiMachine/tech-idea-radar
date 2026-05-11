import {
  LLMClient,
  EntrepreneurAgent,
  AgentStep,
  WorkflowInput,
  WorkflowResult,
  StepResult,
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

export async function executeStep(step: AgentStep, input: unknown): Promise<unknown> {
  const agent = new EntrepreneurAgent(getClient());
  return agent.runStep(step, input);
}

export async function runWorkflow(
  input: WorkflowInput,
  onStepComplete?: (result: StepResult) => void,
  onStepProgress?: (step: number, text: string) => void,
): Promise<WorkflowResult> {
  const agent = new EntrepreneurAgent(getClient());
  return agent.runWorkflow(input, onStepComplete, onStepProgress);
}
