import { LLMClient } from '../services/llm-client';
import { ResponseParser } from '../services/response-parser';
import { Phase } from '../config/constants';

export abstract class BaseAgent<TInput, TOutput> {
  abstract readonly name: string;
  abstract readonly phase: Phase;
  abstract get systemPrompt(): string;
  abstract buildUserPrompt(input: TInput): string;

  protected readonly maxTokens?: number;

  constructor(protected readonly llm: LLMClient) {}

  async execute(input: TInput): Promise<TOutput> {
    const userPrompt = this.buildUserPrompt(input);
    const raw = await this.llm.send(this.systemPrompt, userPrompt, this.maxTokens);
    try {
      return ResponseParser.parse<TOutput>(raw);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      throw new Error(`${this.name}: response parsing failed — ${msg}`);
    }
  }
}
