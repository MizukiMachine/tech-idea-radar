import { LLMClient } from '../services/llm-client';
import { ResponseParser } from '../services/response-parser';

export abstract class BaseAgent<TInput, TOutput> {
  abstract readonly name: string;
  abstract get systemPrompt(): string;
  abstract buildUserPrompt(input: TInput): string;

  protected readonly maxTokens?: number;

  constructor(protected readonly llm: LLMClient) {}

  async execute(input: TInput, onProgress?: (text: string) => void): Promise<TOutput> {
    const userPrompt = this.buildUserPrompt(input);
    const raw = onProgress
      ? await this.llm.sendStream(this.systemPrompt, userPrompt, this.maxTokens, onProgress)
      : await this.llm.send(this.systemPrompt, userPrompt, this.maxTokens);
    try {
      return ResponseParser.parse<TOutput>(raw);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      throw new Error(`${this.name}: response parsing failed — ${msg}`);
    }
  }
}
