import { LLMClient } from '../services/llm-client';
import { renderPromptRole } from '../services/prompt-catalog';
import { DEFAULT_MAX_TOKENS } from '../config/constants';
import type { SemanticFilterInput, SemanticFilterOutput } from '../types/semantic-filter';
import { BaseAgent } from './base-agent';

export class FilterAgent extends BaseAgent<SemanticFilterInput, SemanticFilterOutput> {
  readonly name = 'FilterAgent';
  readonly maxTokens = DEFAULT_MAX_TOKENS;

  constructor(llm: LLMClient) {
    super(llm);
  }

  get systemPrompt(): string {
    return renderPromptRole('semantic_filter', 'system');
  }

  buildUserPrompt(input: SemanticFilterInput): string {
    return renderPromptRole('semantic_filter', 'user', {
      query: input.query,
      candidates: input.candidates,
    });
  }
}
