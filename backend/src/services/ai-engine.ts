import {
  ClaudeClient,
  EntrepreneurAgent,
  Phase,
  WorkflowInput,
  WorkflowResult,
  PhaseResult,
} from 'ai-engine';

let cachedClient: ClaudeClient | null = null;

function getClient(): ClaudeClient {
  if (!cachedClient) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY environment variable is required');
    }
    const model = process.env.CLAUDE_MODEL;
    cachedClient = new ClaudeClient(apiKey, model);
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
