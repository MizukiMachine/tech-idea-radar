import Anthropic from '@anthropic-ai/sdk';
import { DEFAULT_MODEL, DEFAULT_MAX_TOKENS, DEFAULT_BASE_URL } from '../config/constants';

const MAX_RETRIES = 3;
const INITIAL_BACKOFF_MS = 1000;
const TIMEOUT_MS = 600_000;

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

export class LLMClient {
  private readonly client: Anthropic;
  private readonly model: string;
  private readonly maxTokens: number;

  constructor(apiKey: string, model?: string, maxTokens?: number, baseURL?: string) {
    this.client = new Anthropic({
      apiKey,
      baseURL: baseURL ?? DEFAULT_BASE_URL,
      timeout: TIMEOUT_MS,
    });
    this.model = model ?? DEFAULT_MODEL;
    this.maxTokens = maxTokens ?? DEFAULT_MAX_TOKENS;
  }

  async sendStream(
    systemPrompt: string,
    userPrompt: string,
    maxTokens: number | undefined,
    onChunk: (accumulated: string) => void,
  ): Promise<string> {
    const tokens = maxTokens ?? this.maxTokens;
    let accumulated = '';
    let chunkCount = 0;
    const EMIT_EVERY_N = 5;

    const stream = this.client.messages.stream({
      model: this.model,
      max_tokens: tokens,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
      stream: true,
    });

    stream.on('text', (text) => {
      accumulated += text;
      chunkCount++;
      if (chunkCount % EMIT_EVERY_N === 0) {
        onChunk(accumulated);
      }
    });

    const finalMessage = await stream.finalMessage();
    const textBlock = finalMessage.content.find(b => b.type === 'text');
    const fullText = textBlock && textBlock.type === 'text' ? textBlock.text : '';

    // Always emit final state
    onChunk(fullText);

    return fullText;
  }

  async send(systemPrompt: string, userPrompt: string, maxTokens?: number): Promise<string> {
    const tokens = maxTokens ?? this.maxTokens;
    const isProd = process.env.NODE_ENV === 'production';
    const promptInfo = isProd
      ? `${userPrompt.length} chars`
      : `"${userPrompt.slice(0, 80).replace(/\n/g, ' ')}..."`;
    console.log(`[LLMClient] Sending request (model=${this.model}, max_tokens=${tokens}, prompt=${promptInfo})`);

    let lastError: unknown;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      const start = Date.now();
      try {
        const response = await this.client.messages.create({
          model: this.model,
          max_tokens: tokens,
          system: systemPrompt,
          messages: [
            { role: 'user', content: userPrompt },
          ],
        });

        const textBlock = response.content.find(b => b.type === 'text');
        const text = textBlock && textBlock.type === 'text' ? textBlock.text : '';
        console.log(`[LLMClient] Response received in ${Date.now() - start}ms (${text.length} chars)`);
        return text;
      } catch (error) {
        lastError = error;
        const elapsed = Date.now() - start;
        const msg = error instanceof Error ? error.message : String(error);

        if (!isRetryable(error) || attempt === MAX_RETRIES) {
          console.error(`[LLMClient] Request failed (attempt ${attempt}/${MAX_RETRIES}, ${elapsed}ms): ${msg}`);
          throw error;
        }

        const backoff = INITIAL_BACKOFF_MS * Math.pow(2, attempt - 1);
        console.warn(`[LLMClient] Retryable error on attempt ${attempt}/${MAX_RETRIES} (${elapsed}ms), retrying in ${backoff}ms: ${msg}`);
        await sleep(backoff);
      }
    }

    throw lastError;
  }
}
