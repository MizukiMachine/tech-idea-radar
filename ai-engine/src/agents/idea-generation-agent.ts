import { LLMClient } from '../services/llm-client';
import { PromptBuilder } from '../services/prompt-builder';
import { LARGE_MAX_TOKENS } from '../config/constants';
import { IDEA_GENERATION_SYSTEM_PROMPT, IDEA_GENERATION_USER_TEMPLATE } from '../prompts/idea-generation';
import type { IdeaGenerationInput } from '../types/idea-generation';
import type { IdeaCandidate } from '../types/idea-candidate';
import { BaseAgent } from './base-agent';

export class IdeaGenerationAgent extends BaseAgent<IdeaGenerationInput, IdeaCandidate[]> {
  readonly name = 'IdeaGenerationAgent';
  readonly maxTokens = LARGE_MAX_TOKENS;

  constructor(llm: LLMClient) {
    super(llm);
  }

  get systemPrompt(): string {
    return IDEA_GENERATION_SYSTEM_PROMPT;
  }

  buildUserPrompt(input: IdeaGenerationInput): string {
    const rssContext = input.rssContext
      ? JSON.stringify(input.rssContext, null, 2)
      : '（RSSデータなし — 一般知識から生成してください）';

    const xContext = input.xContext
      ? JSON.stringify(input.xContext, null, 2)
      : '（Xデータなし — 一般知識から生成してください）';

    const focusKeywords = input.focusKeywords?.length
      ? input.focusKeywords.join(', ')
      : '（特になし — 幅広く提案してください）';

    return PromptBuilder.build(IDEA_GENERATION_USER_TEMPLATE, {
      rss_context: rssContext,
      x_context: xContext,
      focus_keywords: focusKeywords,
    });
  }
}
