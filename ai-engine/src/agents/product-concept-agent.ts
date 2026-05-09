import { BaseAgent } from './base-agent';
import { ClaudeClient } from '../services/claude-client';
import { Phase, LARGE_MAX_TOKENS } from '../config/constants';
import { ProductConceptInput, ProductConceptOutput } from '../types/product-concept';
import { PRODUCT_CONCEPT_SYSTEM_PROMPT, PRODUCT_CONCEPT_USER_TEMPLATE } from '../prompts/product-concept';
import { PromptBuilder } from '../services/prompt-builder';

export class ProductConceptAgent extends BaseAgent<ProductConceptInput, ProductConceptOutput> {
  readonly name = 'ProductConceptAgent';
  readonly phase = Phase.ProductConcept;
  protected readonly maxTokens = LARGE_MAX_TOKENS;

  constructor(claude: ClaudeClient) {
    super(claude);
  }

  get systemPrompt(): string {
    return PRODUCT_CONCEPT_SYSTEM_PROMPT;
  }

  buildUserPrompt(input: ProductConceptInput): string {
    return PromptBuilder.build(PRODUCT_CONCEPT_USER_TEMPLATE, {
      market_research: JSON.stringify(input.previousPhases.marketResearch, null, 2),
      persona_data: JSON.stringify(input.previousPhases.persona, null, 2),
    });
  }
}
