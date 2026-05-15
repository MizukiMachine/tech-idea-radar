import { LLMClient } from '../services/llm-client';
import { PromptBuilder } from '../services/prompt-builder';
import { LARGE_MAX_TOKENS } from '../config/constants';
import { IDEA_GENERATION_SYSTEM_PROMPT, IDEA_GENERATION_USER_TEMPLATE } from '../prompts/idea-generation';
import type { IdeaGenerationInput } from '../types/idea-generation';
import type { IdeaCandidate } from '../types/idea-candidate';
import type { XContext } from '../types/x-context';
import { BaseAgent } from './base-agent';

function buildXDemandSeeds(xContext?: XContext): string {
  const signals = (xContext?.demandSignals ?? [])
    .filter((signal) => signal.tweet.url && signal.tweet.text.trim())
    .slice(0, 10)
    .map((signal, index) => ({
      seedId: `x-demand-${index + 1}`,
      sourceUrl: signal.tweet.url,
      postText: signal.tweet.text,
      needCategory: signal.needCategory,
      matchedKeywords: signal.matchedKeywords,
      engagement: {
        likes: signal.tweet.likeCount,
        reposts: signal.tweet.retweetCount,
        replies: signal.tweet.replyCount,
      },
      instruction: 'この投稿の悩み・要望を直接解決するアイデアにする場合だけ、このsourceUrlを根拠URLとして使う',
    }));

  if (signals.length === 0) {
    return '（X需要シードなし — X由来アイデアは無理に生成しない）';
  }

  return JSON.stringify(signals, null, 2);
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

    const xContext = input.xContext
      ? JSON.stringify(input.xContext, null, 2)
      : '（Xデータなし — 一般知識から生成してください）';
    const xDemandSeeds = buildXDemandSeeds(input.xContext);

    const focusKeywords = input.focusKeywords?.length
      ? input.focusKeywords.join(', ')
      : '（特になし — 幅広く提案してください）';

    return PromptBuilder.build(IDEA_GENERATION_USER_TEMPLATE, {
      rss_context: rssContext,
      x_context: xContext,
      x_demand_seeds: xDemandSeeds,
      focus_keywords: focusKeywords,
    });
  }
}
