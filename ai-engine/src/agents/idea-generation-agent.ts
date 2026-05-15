import { LLMClient } from '../services/llm-client';
import { PromptBuilder } from '../services/prompt-builder';
import { DEFAULT_IDEA_COUNT, LARGE_MAX_TOKENS } from '../config/constants';
import { IDEA_GENERATION_SYSTEM_PROMPT, IDEA_GENERATION_USER_TEMPLATE } from '../prompts/idea-generation';
import type { IdeaGenerationInput, UsedRssSource } from '../types/idea-generation';
import type { IdeaCandidate } from '../types/idea-candidate';
import { BaseAgent } from './base-agent';

const MAX_PREVIOUS_IDEAS_IN_PROMPT = 40;
const MAX_USED_SOURCES_IN_PROMPT = 60;

function summarizePreviousIdeas(ideas: IdeaCandidate[] | undefined): string {
  const summaries = (ideas ?? [])
    .slice(0, MAX_PREVIOUS_IDEAS_IN_PROMPT)
    .map((idea) => ({
      title: idea.title,
      productType: idea.productType,
      targetUsers: idea.targetUsers,
      coreProblem: idea.coreProblem,
      tags: idea.tags,
    }));

  return summaries.length > 0
    ? JSON.stringify(summaries, null, 2)
    : '（既存アイデアなし）';
}

function summarizeRecentlyUsedSources(sources: UsedRssSource[] | undefined): string {
  const summaries = (sources ?? [])
    .slice(0, MAX_USED_SOURCES_IN_PROMPT)
    .map((source) => ({
      title: source.title,
      url: source.url,
      lastUsedAt: source.lastUsedAt,
      count: source.count,
      ideaTitles: source.ideaTitles?.slice(0, 3),
    }));

  return summaries.length > 0
    ? JSON.stringify(summaries, null, 2)
    : '（使用済みRSS記事なし）';
}

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

    const focusKeywords = input.focusKeywords?.length
      ? input.focusKeywords.join(', ')
      : '（特になし — 幅広く提案してください）';

    const requestedIdeaCount = input.requestedIdeaCount ?? DEFAULT_IDEA_COUNT;

    return PromptBuilder.build(IDEA_GENERATION_USER_TEMPLATE, {
      rss_context: rssContext,
      focus_keywords: focusKeywords,
      previous_ideas: summarizePreviousIdeas(input.previousIdeas),
      recently_used_sources: summarizeRecentlyUsedSources(input.recentlyUsedSources),
      requested_idea_count: String(requestedIdeaCount),
    });
  }
}
