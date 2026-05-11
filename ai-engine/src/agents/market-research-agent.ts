import { BaseAgent } from './base-agent';
import { LLMClient } from '../services/llm-client';
import { AgentStep, LARGE_MAX_TOKENS } from '../config/constants';
import { MarketResearchInput, MarketResearchOutput } from '../types/market-research';
import { MARKET_RESEARCH_SYSTEM_PROMPT, MARKET_RESEARCH_USER_TEMPLATE } from '../prompts/market-research';
import { PromptBuilder } from '../services/prompt-builder';

export class MarketResearchAgent extends BaseAgent<MarketResearchInput, MarketResearchOutput> {
  readonly name = 'MarketResearchAgent';
  readonly step = AgentStep.MarketResearch;
  protected readonly maxTokens = LARGE_MAX_TOKENS;

  constructor(llm: LLMClient) {
    super(llm);
  }

  get systemPrompt(): string {
    return MARKET_RESEARCH_SYSTEM_PROMPT;
  }

  buildUserPrompt(input: MarketResearchInput): string {
    const rssSection = input.rssContext
      ? JSON.stringify({
          trendingKeywords: input.rssContext.trendingKeywords,
          relatedArticles: input.rssContext.relatedArticles,
        }, null, 2)
      : '（RSSデータ取得なし — LLMの知識に基づいて分析してください）';

    return PromptBuilder.build(MARKET_RESEARCH_USER_TEMPLATE, {
      self_analysis: JSON.stringify(input.selfAnalysisHandoff, null, 2),
      target_markets: JSON.stringify(input.targetMarkets, null, 2),
      initial_competitors: JSON.stringify(input.initialCompetitors, null, 2),
      rss_context: rssSection,
    });
  }
}
