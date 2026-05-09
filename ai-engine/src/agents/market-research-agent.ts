import { BaseAgent } from './base-agent';
import { ClaudeClient } from '../services/claude-client';
import { Phase, LARGE_MAX_TOKENS } from '../config/constants';
import { MarketResearchInput, MarketResearchOutput } from '../types/market-research';
import { MARKET_RESEARCH_SYSTEM_PROMPT, MARKET_RESEARCH_USER_TEMPLATE } from '../prompts/market-research';
import { PromptBuilder } from '../services/prompt-builder';

export class MarketResearchAgent extends BaseAgent<MarketResearchInput, MarketResearchOutput> {
  readonly name = 'MarketResearchAgent';
  readonly phase = Phase.MarketResearch;
  protected readonly maxTokens = LARGE_MAX_TOKENS;

  constructor(claude: ClaudeClient) {
    super(claude);
  }

  get systemPrompt(): string {
    return MARKET_RESEARCH_SYSTEM_PROMPT;
  }

  buildUserPrompt(input: MarketResearchInput): string {
    return PromptBuilder.build(MARKET_RESEARCH_USER_TEMPLATE, {
      self_analysis: JSON.stringify(input.selfAnalysisHandoff, null, 2),
      target_markets: JSON.stringify(input.targetMarkets, null, 2),
      initial_competitors: JSON.stringify(input.initialCompetitors, null, 2),
    });
  }
}
