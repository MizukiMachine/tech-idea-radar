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

    let xSection: string;
    if (input.xContext && (
      input.xContext.trendingTopics.length > 0 ||
      input.xContext.demandSignals.length > 0 ||
      input.xContext.competitorSentiments.length > 0
    )) {
      const { trendingTopics, demandSignals, competitorSentiments } = input.xContext;

      const demandSummary = demandSignals.map((s) => ({
        text: s.tweet.text.slice(0, 200),
        author: `@${s.tweet.authorHandle}`,
        category: s.needCategory,
        relevanceScore: s.relevanceScore,
      }));

      const competitorSummary = competitorSentiments.map((cs) => ({
        competitor: cs.competitorName,
        sentimentSummary: cs.sentimentSummary,
        keyComplaints: cs.keyComplaints,
        keyPraises: cs.keyPraises,
        sampleTweets: cs.tweets.slice(0, 3).map((t) => ({
          text: t.text.slice(0, 150),
          author: `@${t.authorHandle}`,
          likes: t.likeCount,
        })),
      }));

      xSection = JSON.stringify({
        trendingTopics,
        demandSignals: demandSummary,
        competitorSentiments: competitorSummary,
      }, null, 2);
    } else {
      xSection = '（X (Twitter) データ取得なし — LLMの知識に基づいてトレンドや需要を推定してください）';
    }

    return PromptBuilder.build(MARKET_RESEARCH_USER_TEMPLATE, {
      self_analysis: JSON.stringify(input.selfAnalysisHandoff, null, 2),
      target_markets: JSON.stringify(input.targetMarkets, null, 2),
      initial_competitors: JSON.stringify(input.initialCompetitors, null, 2),
      rss_context: rssSection,
      x_context: xSection,
    });
  }
}
