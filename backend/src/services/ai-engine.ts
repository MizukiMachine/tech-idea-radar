import { LLMClient } from 'ai-engine';

let cachedClient: LLMClient | null = null;

export function getClient(): LLMClient {
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
