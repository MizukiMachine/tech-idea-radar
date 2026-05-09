import { ClaudeClient } from '../services/claude-client';
import { ResponseParser } from '../services/response-parser';
import { Phase } from '../config/constants';

export abstract class BaseAgent<TInput, TOutput> {
  abstract readonly name: string;
  abstract readonly phase: Phase;
  abstract get systemPrompt(): string;
  abstract buildUserPrompt(input: TInput): string;

  protected readonly maxTokens?: number;

  constructor(protected readonly claude: ClaudeClient) {}

  async execute(input: TInput): Promise<TOutput> {
    const userPrompt = this.buildUserPrompt(input);
    const raw = await this.claude.send(this.systemPrompt, userPrompt, this.maxTokens);
    return ResponseParser.parse<TOutput>(raw);
  }
}
