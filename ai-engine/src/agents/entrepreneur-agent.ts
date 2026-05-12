import { LLMClient } from '../services/llm-client';
import { IdeaGenerationAgent } from './idea-generation-agent';
import { FilterAgent } from './filter-agent';
import { fetchRssContext } from '../services/mcp-client';
import { fetchXContext } from '../services/x-client';
import type { IdeaGenerationInput, IdeaGenerationOutput } from '../types/idea-generation';
import type { SemanticFilterInput, SemanticFilterOutput } from '../types/semantic-filter';
import type { IdeaCandidate } from '../types/idea-candidate';

const DEFAULT_KEYWORDS = ['AI', 'SaaS', 'developer', 'productivity', 'automation', 'エンジニア', '個人開発'];

export class EntrepreneurAgent {
  private readonly ideaGeneration: IdeaGenerationAgent;
  private readonly filterAgent: FilterAgent;

  constructor(llm: LLMClient) {
    this.ideaGeneration = new IdeaGenerationAgent(llm);
    this.filterAgent = new FilterAgent(llm);
  }

  async generateIdeas(onProgress?: (text: string) => void): Promise<IdeaGenerationOutput> {
    const startTime = Date.now();
    console.log('[IdeaGeneration] Starting idea generation pipeline');

    // Fetch RSS + X enrichment data in parallel
    const keywords = DEFAULT_KEYWORDS;
    onProgress?.('[Enrichment] RSS + X データ取得中...');
    const [rssContext, xContext] = await Promise.all([
      fetchRssContext(keywords.slice(0, 3)),
      fetchXContext(keywords, []),
    ]);
    const rssCount = rssContext.trendingKeywords.length + rssContext.relatedArticles.length;
    const xCount = xContext.trendingTopics.length + xContext.demandSignals.length + xContext.competitorSentiments.length;
    console.log(`[IdeaGeneration] Enrichment: RSS: ${rssCount} items, X: ${xCount} signals`);
    onProgress?.(`[Enrichment] RSS: ${rssCount}件, X: ${xCount}件\n\nアイデア生成中...`);

    const input: IdeaGenerationInput = {
      rssContext,
      xContext,
      focusKeywords: keywords,
    };

    const candidates = await this.ideaGeneration.execute(input, onProgress);

    const usedLLMFallback = rssCount === 0 && xCount === 0;
    const totalTime = Date.now() - startTime;
    console.log(`[IdeaGeneration] Generated ${candidates.length} ideas in ${totalTime}ms (fallback: ${usedLLMFallback})`);

    return {
      candidates,
      generatedAt: new Date().toISOString(),
      sourceSummary: {
        rssItemCount: rssCount,
        xSignalCount: xCount,
        usedLLMFallback,
      },
    };
  }

  async filterIdeas(input: SemanticFilterInput): Promise<SemanticFilterOutput> {
    if (!input.query.trim()) {
      return {
        filteredCandidates: [...input.candidates].sort((a, b) => b.trendScore - a.trendScore),
        filterReasoning: 'クエリが空のため、トレンドスコア順で表示しています。',
        matchCriteria: [],
      };
    }

    console.log(`[Filter] Filtering ${input.candidates.length} ideas with query: "${input.query}"`);
    return this.filterAgent.execute(input);
  }
}
