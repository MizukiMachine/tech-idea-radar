import { LLMClient } from '../services/llm-client';
import { PromptBuilder } from '../services/prompt-builder';
import { DEFAULT_IDEA_COUNT, LARGE_MAX_TOKENS } from '../config/constants';
import { IDEA_GENERATION_SYSTEM_PROMPT, IDEA_GENERATION_USER_TEMPLATE } from '../prompts/idea-generation';
import type { IdeaGenerationInput } from '../types/idea-generation';
import type { IdeaCandidate } from '../types/idea-candidate';
import { BaseAgent } from './base-agent';
import { RssSourceUnavailableError } from '../errors';

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
      : '（RSSデータなし — 生成禁止）';

    const focusKeywords = input.focusKeywords?.length
      ? input.focusKeywords.join(', ')
      : '（特になし — 幅広く提案してください）';

    const requestedIdeaCount = input.requestedIdeaCount ?? DEFAULT_IDEA_COUNT;

    return PromptBuilder.build(IDEA_GENERATION_USER_TEMPLATE, {
      rss_context: rssContext,
      focus_keywords: focusKeywords,
      requested_idea_count: String(requestedIdeaCount),
    });
  }

  async execute(input: IdeaGenerationInput, onProgress?: (text: string) => void): Promise<IdeaCandidate[]> {
    const articleCount = input.rssContext?.relatedArticles.length ?? 0;
    if (articleCount === 0) {
      throw new RssSourceUnavailableError(
        'RSS記事が取得できないため、LLMによるアイデア生成を停止しました。',
        {
          operation: 'idea_generation',
          focusKeywords: input.focusKeywords,
          rssArticleCount: articleCount,
          trendingKeywordCount: input.rssContext?.trendingKeywords.length ?? 0,
        },
      );
    }

    return super.execute(input, onProgress);
  }
}
