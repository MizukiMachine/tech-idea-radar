import { BaseAgent } from './base-agent';
import { ClaudeClient } from '../services/claude-client';
import { Phase } from '../config/constants';
import { SelfAnalysisInput, SelfAnalysisOutput } from '../types/self-analysis';
import { SELF_ANALYSIS_SYSTEM_PROMPT, SELF_ANALYSIS_USER_TEMPLATE } from '../prompts/self-analysis';
import { PromptBuilder } from '../services/prompt-builder';

export class SelfAnalysisAgent extends BaseAgent<SelfAnalysisInput, SelfAnalysisOutput> {
  readonly name = 'SelfAnalysisAgent';
  readonly phase = Phase.SelfAnalysis;

  constructor(claude: ClaudeClient) {
    super(claude);
  }

  get systemPrompt(): string {
    return SELF_ANALYSIS_SYSTEM_PROMPT;
  }

  buildUserPrompt(input: SelfAnalysisInput): string {
    return PromptBuilder.build(SELF_ANALYSIS_USER_TEMPLATE, {
      career_history: JSON.stringify(input.careerHistory, null, 2),
      skills: JSON.stringify(input.skills, null, 2),
      achievements: JSON.stringify(input.achievements, null, 2),
      network: JSON.stringify(input.network, null, 2),
      values: JSON.stringify(input.values, null, 2),
    });
  }
}
