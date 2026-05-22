import { LLMClient } from '../services/llm-client';
import { renderPromptRole } from '../services/prompt-catalog';
import { DEFAULT_IDEA_COUNT, LARGE_MAX_TOKENS } from '../config/constants';
import type { IdeaGenerationInput } from '../types/idea-generation';
import type { IdeaCandidate } from '../types/idea-candidate';
import { BaseAgent } from './base-agent';
import { RssSourceUnavailableError } from '../errors';

const DEFAULT_PROMPT_ARTICLE_LIMIT = 8;
const DEFAULT_PROMPT_KEYWORD_LIMIT = 12;
const ARTICLE_SUMMARY_CHAR_LIMIT = 420;
const ARTICLE_DESCRIPTION_CHAR_LIMIT = 240;
const TOPIC_LIMIT = 8;

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function compactText(value: string | undefined, maxChars: number): string | undefined {
  if (!value) return undefined;
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxChars) return normalized;
  return `${normalized.slice(0, maxChars - 1).trim()}…`;
}

function compactRssContextForPrompt(rssContext: IdeaGenerationInput['rssContext']): IdeaGenerationInput['rssContext'] {
  if (!rssContext) return rssContext;

  const articleLimit = parsePositiveInt(process.env.IDEA_GENERATION_RSS_ARTICLE_LIMIT, DEFAULT_PROMPT_ARTICLE_LIMIT);
  const keywordLimit = parsePositiveInt(process.env.IDEA_GENERATION_KEYWORD_LIMIT, DEFAULT_PROMPT_KEYWORD_LIMIT);
  const relatedArticles = rssContext.relatedArticles.slice(0, articleLimit).map((article) => ({
    ...article,
    summary: compactText(article.summary, ARTICLE_SUMMARY_CHAR_LIMIT) ?? '',
    summaryJa: compactText(article.summaryJa, ARTICLE_SUMMARY_CHAR_LIMIT),
    description: compactText(article.description, ARTICLE_DESCRIPTION_CHAR_LIMIT),
    keywords: article.keywords?.slice(0, 6),
  }));
  const selectedTopicKeys = new Set(relatedArticles.map((article) => article.topicKey).filter(Boolean));
  const topicClusters = rssContext.topicClusters
    ?.filter((topic) => !selectedTopicKeys.size || selectedTopicKeys.has(topic.topic))
    .slice(0, TOPIC_LIMIT)
    .map((topic) => ({
      ...topic,
      representativeArticles: topic.representativeArticles.slice(0, 2).map((article) => ({
        ...article,
        summary: compactText(article.summary, ARTICLE_DESCRIPTION_CHAR_LIMIT),
      })),
    }));

  return {
    ...rssContext,
    trendingKeywords: rssContext.trendingKeywords.slice(0, keywordLimit),
    relatedArticles,
    topicClusters,
  };
}

export class IdeaGenerationAgent extends BaseAgent<IdeaGenerationInput, IdeaCandidate[]> {
  readonly name = 'IdeaGenerationAgent';
  readonly maxTokens = LARGE_MAX_TOKENS;

  constructor(llm: LLMClient) {
    super(llm);
  }

  get systemPrompt(): string {
    return renderPromptRole('idea_generation', 'system');
  }

  buildUserPrompt(input: IdeaGenerationInput): string {
    const focusKeywords = input.focusKeywords?.length
      ? input.focusKeywords.join(', ')
      : '（特になし — 幅広く提案してください）';

    const requestedIdeaCount = input.requestedIdeaCount ?? DEFAULT_IDEA_COUNT;

    return renderPromptRole('idea_generation', 'user', {
      rss_context: compactRssContextForPrompt(input.rssContext),
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
