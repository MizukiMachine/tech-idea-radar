import { LLMClient } from '../services/llm-client';
import { IdeaGenerationAgent } from './idea-generation-agent';
import { FilterAgent } from './filter-agent';
import { fetchRssContext } from '../services/mcp-client';
import { fetchXContext } from '../services/x-client';
import type { IdeaGenerationInput, IdeaGenerationOutput } from '../types/idea-generation';
import type { SemanticFilterInput, SemanticFilterOutput } from '../types/semantic-filter';
import type { IdeaCandidate } from '../types/idea-candidate';
import type { RssArticle, RssContext } from '../services/mcp-client';

const DEFAULT_KEYWORDS = ['AI', 'SaaS', 'developer', 'productivity', 'automation', 'エンジニア', '個人開発'];

function normalizeCandidates(raw: unknown): IdeaCandidate[] {
  // Already an array
  if (Array.isArray(raw)) return raw as IdeaCandidate[];

  // Single object — might be wrapped or a single candidate
  if (raw && typeof raw === 'object') {
    const obj = raw as Record<string, unknown>;
    console.log(`[IdeaGeneration] Parsed object with keys: ${Object.keys(obj).join(', ')}`);

    // Check if any property is an array of idea-like objects
    for (const [key, value] of Object.entries(obj)) {
      if (Array.isArray(value) && value.length > 0 && value[0] && typeof value[0] === 'object' && 'title' in (value[0] as object)) {
        console.log(`[IdeaGeneration] Found array in "${key}" with ${value.length} items`);
        return value as IdeaCandidate[];
      }
    }

    // Single candidate object with 'title' field
    if ('title' in obj) {
      console.log('[IdeaGeneration] Single candidate object, wrapping in array');
      return [obj as unknown as IdeaCandidate];
    }
  }

  console.warn('[IdeaGeneration] Could not normalize candidates, returning empty array');
  return [];
}

function candidateText(candidate: IdeaCandidate): string {
  return [
    candidate.title,
    candidate.tagline,
    candidate.description,
    candidate.productType,
    candidate.targetUsers,
    candidate.coreProblem,
    candidate.differentiation,
    ...candidate.tags,
  ].join(' ').toLowerCase();
}

function scoreArticleForCandidate(article: RssArticle, text: string): number {
  const articleText = `${article.title} ${article.summary} ${(article.keywords ?? []).join(' ')}`.toLowerCase();
  let score = 0;
  for (const keyword of article.keywords ?? []) {
    if (text.includes(keyword.toLowerCase())) score += 3;
  }
  for (const token of text.match(/[A-Za-z][A-Za-z0-9+#.-]{2,}|[ぁ-んァ-ヶ一-龯ー]{2,}/g) ?? []) {
    if (articleText.includes(token.toLowerCase())) score += 1;
  }
  return score;
}

function attachTrustedEvidence(candidates: IdeaCandidate[], rssContext: RssContext): IdeaCandidate[] {
  const articles = rssContext.relatedArticles.filter((article) => article.link || article.url);
  const allowedUrls = new Set(articles.map((article) => article.url ?? article.link));
  if (articles.length === 0) {
    return candidates.map((candidate) => ({
      ...candidate,
      sources: {
        ...candidate.sources,
        evidenceUrls: (candidate.sources.evidenceUrls ?? []).filter((source) => allowedUrls.has(source.url)).slice(0, 3),
      },
    }));
  }

  return candidates.map((candidate) => {
    const existing = (candidate.sources.evidenceUrls ?? [])
      .filter((source) => allowedUrls.has(source.url))
      .slice(0, 3);

    if (existing.length >= 3) {
      return { ...candidate, sources: { ...candidate.sources, evidenceUrls: existing } };
    }

    const used = new Set(existing.map((source) => source.url));
    const text = candidateText(candidate);
    const additions = articles
      .map((article) => ({ article, score: scoreArticleForCandidate(article, text) }))
      .sort((a, b) => b.score - a.score)
      .filter(({ article }) => !used.has(article.url ?? article.link))
      .slice(0, 3 - existing.length)
      .map(({ article }) => ({
        title: article.title,
        url: article.url ?? article.link,
        type: 'rss' as const,
      }));

    return {
      ...candidate,
      sources: {
        ...candidate.sources,
        evidenceUrls: [...existing, ...additions],
      },
    };
  });
}

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

    const rawCandidates = await this.ideaGeneration.execute(input, onProgress);

    // LLM may return various formats — normalize to IdeaCandidate[]
    const candidates = attachTrustedEvidence(normalizeCandidates(rawCandidates), rssContext);

    const usedLLMFallback = rssContext.relatedArticles.length === 0 && xCount === 0;
    const warnings = usedLLMFallback
      ? ['外部RSS/Xデータを取得できなかったため、LLMの一般知識フォールバックで生成しました。']
      : [];
    const totalTime = Date.now() - startTime;
    console.log(`[IdeaGeneration] Generated ${candidates.length} ideas in ${totalTime}ms (fallback: ${usedLLMFallback})`);

    return {
      candidates,
      generatedAt: new Date().toISOString(),
      sourceSummary: {
        rssItemCount: rssCount,
        xSignalCount: xCount,
        usedLLMFallback,
        dataQuality: usedLLMFallback ? 'llm_fallback' : 'external',
        warnings,
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
