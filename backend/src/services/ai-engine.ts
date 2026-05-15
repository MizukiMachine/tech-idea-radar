import { LLMClient } from 'ai-engine';

let cachedClient: LLMClient | null = null;

export function getClient(): LLMClient {
  if (!cachedClient) {
    const apiKey = process.env.ZAI_API_KEY;
    if (!apiKey) {
      throw new Error('ZAI_API_KEY environment variable is required');
    }
    const model = process.env.LLM_MODEL;
    const baseURL = process.env.LLM_BASE_URL;
    const maxTokens = process.env.LLM_MAX_TOKENS ? Number(process.env.LLM_MAX_TOKENS) : undefined;
    if (maxTokens !== undefined && !Number.isFinite(maxTokens)) {
      throw new Error('LLM_MAX_TOKENS environment variable must be numeric');
    }
    cachedClient = new LLMClient(apiKey, model, maxTokens, baseURL);
  }
  return cachedClient;
}
