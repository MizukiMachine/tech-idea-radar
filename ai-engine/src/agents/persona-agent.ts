import { BaseAgent } from './base-agent';
import { ClaudeClient } from '../services/claude-client';
import { Phase, LARGE_MAX_TOKENS } from '../config/constants';
import { PersonaInput, PersonaOutput } from '../types/persona';
import { PERSONA_SYSTEM_PROMPT, PERSONA_USER_TEMPLATE } from '../prompts/persona';
import { PromptBuilder } from '../services/prompt-builder';

export class PersonaAgent extends BaseAgent<PersonaInput, PersonaOutput> {
  readonly name = 'PersonaAgent';
  readonly phase = Phase.Persona;
  protected readonly maxTokens = LARGE_MAX_TOKENS;

  constructor(claude: ClaudeClient) {
    super(claude);
  }

  get systemPrompt(): string {
    return PERSONA_SYSTEM_PROMPT;
  }

  buildUserPrompt(input: PersonaInput): string {
    return PromptBuilder.build(PERSONA_USER_TEMPLATE, {
      self_analysis: JSON.stringify(input.previousPhases.selfAnalysis, null, 2),
      market_research: JSON.stringify(input.previousPhases.marketResearch, null, 2),
    });
  }
}
