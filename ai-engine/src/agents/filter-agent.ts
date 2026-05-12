import { LLMClient } from '../services/llm-client';
import { PromptBuilder } from '../services/prompt-builder';
import { DEFAULT_MAX_TOKENS } from '../config/constants';
import { FILTER_SYSTEM_PROMPT, FILTER_USER_TEMPLATE } from '../prompts/filter';
import type { SemanticFilterInput, SemanticFilterOutput } from '../types/semantic-filter';
import { BaseAgent } from './base-agent';

export class FilterAgent extends BaseAgent<SemanticFilterInput, SemanticFilterOutput> {
  readonly name = 'FilterAgent';
  readonly maxTokens = DEFAULT_MAX_TOKENS;

  constructor(llm: LLMClient) {
    super(llm);
  }

  get systemPrompt(): string {
    return FILTER_SYSTEM_PROMPT;
  }

  buildUserPrompt(input: SemanticFilterInput): string {
    return PromptBuilder.build(FILTER_USER_TEMPLATE, {
      query: input.query,
      candidates: JSON.stringify(input.candidates, null, 2),
    });
  }
}
