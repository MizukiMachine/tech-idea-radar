import Anthropic from '@anthropic-ai/sdk';
import { DEFAULT_MODEL, DEFAULT_MAX_TOKENS } from '../config/constants';

const MAX_RETRIES = 3;
const INITIAL_BACKOFF_MS = 1000;
const TIMEOUT_MS = 120_000;

function isRetryable(error: unknown): boolean {
  if (error instanceof Anthropic.APIError) {
    const status = error.status ?? 0;
    return status === 429 || status >= 500;
  }
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    return msg.includes('timeout') || msg.includes('econnreset') || msg.includes('rate limit');
  }
  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export class ClaudeClient {
  private readonly client: Anthropic;
  private readonly model: string;
  private readonly maxTokens: number;

  constructor(apiKey: string, model?: string, maxTokens?: number, timeout?: number) {
    this.client = new Anthropic({ apiKey, timeout: timeout ?? TIMEOUT_MS });
    this.model = model ?? DEFAULT_MODEL;
    this.maxTokens = maxTokens ?? DEFAULT_MAX_TOKENS;
  }

  async send(systemPrompt: string, userPrompt: string, maxTokens?: number): Promise<string> {
    const tokens = maxTokens ?? this.maxTokens;
    const promptPreview = userPrompt.slice(0, 80).replace(/\n/g, ' ');
    console.log(`[ClaudeClient] Sending request (model=${this.model}, max_tokens=${tokens}, prompt="${promptPreview}...")`);

    let lastError: unknown;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      const start = Date.now();
      try {
        const response = await this.client.messages.create({
          model: this.model,
          max_tokens: tokens,
          system: systemPrompt,
          messages: [{ role: 'user', content: userPrompt }],
        });

        const text = response.content
          .filter((block): block is Anthropic.TextBlock => block.type === 'text')
          .map((block) => block.text)
          .join('\n');

        console.log(`[ClaudeClient] Response received in ${Date.now() - start}ms (${text.length} chars)`);
        return text;
      } catch (error) {
        lastError = error;
        const elapsed = Date.now() - start;
        const msg = error instanceof Error ? error.message : String(error);

        if (!isRetryable(error) || attempt === MAX_RETRIES) {
          console.error(`[ClaudeClient] Request failed (attempt ${attempt}/${MAX_RETRIES}, ${elapsed}ms): ${msg}`);
          throw error;
        }

        const backoff = INITIAL_BACKOFF_MS * Math.pow(2, attempt - 1);
        console.warn(`[ClaudeClient] Retryable error on attempt ${attempt}/${MAX_RETRIES} (${elapsed}ms), retrying in ${backoff}ms: ${msg}`);
        await sleep(backoff);
      }
    }

    throw lastError;
  }
}
