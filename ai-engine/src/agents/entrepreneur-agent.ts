import { LLMClient } from '../services/llm-client';
import { ResponseParser } from '../services/response-parser';
import { IdeaGenerationAgent } from './idea-generation-agent';
import { FilterAgent } from './filter-agent';
import { fetchRssContext } from '../services/mcp-client';
import { DEFAULT_IDEA_COUNT } from '../config/constants';
import { RssSourceUnavailableError } from '../errors';
import type { IdeaGenerationInput, IdeaGenerationOutput, TrendScanOutput, UsedRssSource } from '../types/idea-generation';
import type { SemanticFilterInput, SemanticFilterOutput } from '../types/semantic-filter';
import type { IdeaCandidate } from '../types/idea-candidate';
import type { RssArticle, RssContext } from '../services/mcp-client';

const DEFAULT_KEYWORDS = ['AI', 'SaaS', 'developer', 'productivity', 'automation', 'エンジニア', 'プロダクト開発'];
const MAX_EVIDENCE_URLS = 1;
const MAX_TRANSLATED_RSS_ARTICLES = 18;
const MIN_RSS_EVIDENCE_SCORE = 4;
const GENERIC_EVIDENCE_TERMS = new Set([
  'ai', 'api', 'app', 'apps', 'dev', 'developer', 'developers', 'development',
  'cli', 'saas', 'tool', 'tools', 'web', 'service', 'services', 'user', 'users',
  'アプリ', 'エンジニア', 'サービス', 'ツール', 'ユーザー', '開発',
  'スキル', '欲しい', '不便', '困ってる', '改善', '問題', '課題', '自動化',
  '文章を', '章を書', 'を書く',
]);

function normalizeSourceUrl(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.hash = '';
    for (const key of [...parsed.searchParams.keys()]) {
      if (key.toLowerCase().startsWith('utm_') || ['fbclid', 'gclid'].includes(key.toLowerCase())) {
        parsed.searchParams.delete(key);
      }
    }
    return parsed.toString();
  } catch {
    return url.trim();
  }
}

function articleUrl(article: RssArticle): string {
  return article.url ?? article.link;
}

function filterUsedRssArticles(rssContext: RssContext, usedSources: UsedRssSource[]): {
  rssContext: RssContext;
  skippedCount: number;
} {
  if (usedSources.length === 0) {
    return { rssContext, skippedCount: 0 };
  }

  const usedUrls = new Set(
    usedSources
      .map((source) => normalizeSourceUrl(source.url))
      .filter(Boolean),
  );

  const relatedArticles = rssContext.relatedArticles.filter((article) => {
    const url = articleUrl(article);
    return !url || !usedUrls.has(normalizeSourceUrl(url));
  });

  return {
    rssContext: {
      ...rssContext,
      relatedArticles,
    },
    skippedCount: rssContext.relatedArticles.length - relatedArticles.length,
  };
}

function sourceNames(rssContext: RssContext): string[] {
  const articleSources = rssContext.relatedArticles.map((article) => article.source).filter(Boolean);
  const failedSources = rssContext.sourceErrors?.map((error) => error.source).filter(Boolean) ?? [];
  return [...new Set([...articleSources, ...failedSources])];
}

function applySourceUsageHistory(
  trendScan: TrendScanOutput,
  usedSources: UsedRssSource[],
): TrendScanOutput {
  const filtered = filterUsedRssArticles(trendScan.rssContext, usedSources);
  if (filtered.skippedCount === 0 && usedSources.length === 0) return trendScan;

  const warnings = [
    ...(trendScan.sourceSummary.warnings ?? []),
    ...(filtered.skippedCount > 0
      ? [`過去に根拠として使ったRSS記事 ${filtered.skippedCount}件を今回の生成材料から除外しました。`]
      : []),
  ];

  return {
    ...trendScan,
    rssContext: filtered.rssContext,
    sourceSummary: {
      ...trendScan.sourceSummary,
      rssItemCount: filtered.rssContext.trendingKeywords.length + filtered.rssContext.relatedArticles.length,
      warnings,
      usedSourceUrlCount: usedSources.length,
      skippedPreviouslyUsedRssCount: filtered.skippedCount,
    },
  };
}

interface RssArticleTranslation {
  title: string;
  titleJa: string;
  summaryJa?: string;
}

function containsJapanese(text: string): boolean {
  return /[ぁ-んァ-ヶ一-龯]/.test(text);
}

function normalizeTitle(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function mergeRssArticleTranslations(rssContext: RssContext, translations: RssArticleTranslation[]): RssContext {
  const titleMap = new Map(
    translations
      .map((translation) => [normalizeTitle(translation.title), normalizeTitle(translation.titleJa)] as const)
      .filter(([, titleJa]) => titleJa),
  );
  const summaryMap = new Map(
    translations
      .map((translation) => [normalizeTitle(translation.title), normalizeTitle(translation.summaryJa ?? '')] as const)
      .filter(([, summaryJa]) => summaryJa),
  );

  return {
    ...rssContext,
    relatedArticles: rssContext.relatedArticles.map((article) => {
      if (article.titleJa || containsJapanese(article.title)) return article;
      const titleJa = titleMap.get(normalizeTitle(article.title));
      const summaryJa = summaryMap.get(normalizeTitle(article.title));
      return titleJa ? { ...article, titleJa, summaryJa } : article;
    }),
  };
}

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
  const articleText = `${article.title} ${article.summary} ${(article.keywords ?? []).join(' ')}`;
  let score = evidenceOverlapScore(articleText, text);
  for (const keyword of article.keywords ?? []) {
    const normalized = normalizeEvidenceText(keyword);
    if (normalized && !GENERIC_EVIDENCE_TERMS.has(normalized) && text.includes(normalized)) score += 2;
  }
  return score >= MIN_RSS_EVIDENCE_SCORE ? score : 0;
}

type CandidateEvidenceUrl = NonNullable<IdeaCandidate['sources']['evidenceUrls']>[number];
type ScoredEvidenceUrl = CandidateEvidenceUrl & { score: number };

function scoreExistingEvidenceForCandidate(
  source: CandidateEvidenceUrl,
  text: string,
  articleByUrl: Map<string, RssArticle>,
): number {
  if (source.type === 'rss') {
    const article = articleByUrl.get(source.url);
    return article ? scoreArticleForCandidate(article, text) : 0;
  }
  return 0;
}

function normalizeEvidenceText(text: string): string {
  return text
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}#+.\-\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function englishEvidenceTokens(text: string): Set<string> {
  const tokens = new Set<string>();
  for (const raw of normalizeEvidenceText(text).match(/[a-z][a-z0-9#+.-]{2,}/g) ?? []) {
    if (GENERIC_EVIDENCE_TERMS.has(raw) || raw.length > 32) continue;
    tokens.add(raw);
    if (raw.endsWith('ing') && raw.length > 5) tokens.add(raw.slice(0, -3));
    if (raw.endsWith('s') && raw.length > 4) tokens.add(raw.slice(0, -1));
  }
  return tokens;
}

function japaneseEvidenceNgrams(text: string): Set<string> {
  const grams = new Set<string>();
  const normalized = normalizeEvidenceText(text);
  for (const run of normalized.match(/[ぁ-んァ-ヶ一-龯ー]{3,}/g) ?? []) {
    if (GENERIC_EVIDENCE_TERMS.has(run) || run.length > 40) continue;
    if (run.length === 3) {
      if (isSignalJapaneseGram(run)) grams.add(run);
      continue;
    }
    for (let i = 0; i <= run.length - 3; i += 1) {
      const gram = run.slice(i, i + 3);
      if (isSignalJapaneseGram(gram)) grams.add(gram);
    }
  }
  return grams;
}

function isSignalJapaneseGram(gram: string): boolean {
  if (GENERIC_EVIDENCE_TERMS.has(gram)) return false;
  const signalChars = gram.match(/[ァ-ヶ一-龯ー]/g)?.length ?? 0;
  return signalChars >= 2;
}

function evidenceOverlapScore(sourceText: string, candidate: string): number {
  const sourceEnglish = englishEvidenceTokens(sourceText);
  const candidateEnglish = englishEvidenceTokens(candidate);
  const sourceJapanese = japaneseEvidenceNgrams(sourceText);
  const candidateJapanese = japaneseEvidenceNgrams(candidate);
  let score = 0;

  for (const token of sourceEnglish) {
    if (candidateEnglish.has(token)) score += 3;
  }
  for (const gram of sourceJapanese) {
    if (candidateJapanese.has(gram)) score += 1;
  }
  return score;
}

function attachTrustedEvidence(candidates: IdeaCandidate[], rssContext: RssContext): IdeaCandidate[] {
  const articles = rssContext.relatedArticles.filter((article) => article.link || article.url);
  const articleByUrl = new Map<string, RssArticle>();
  for (const article of articles) {
    const url = article.url ?? article.link;
    if (url) articleByUrl.set(url, article);
  }
  const allowedUrls = new Set<string>(articleByUrl.keys());

  if (articles.length === 0) {
    return candidates.map((candidate) => ({
      ...candidate,
      sources: {
        rssKeywords: candidate.sources.rssKeywords,
        evidenceUrls: (candidate.sources.evidenceUrls ?? [])
          .filter((source) => allowedUrls.has(source.url))
          .slice(0, MAX_EVIDENCE_URLS),
      },
    }));
  }

  return candidates.map((candidate) => {
    const text = candidateText(candidate);
    const existing = (candidate.sources.evidenceUrls ?? [])
      .filter((source) => allowedUrls.has(source.url))
      .map((source): ScoredEvidenceUrl => ({
        ...source,
        score: scoreExistingEvidenceForCandidate(source, text, articleByUrl),
      }))
      .filter((source) => source.score > 0);

    const used = new Set(existing.map((source) => source.url));
    const rssAdditions = articles
      .map((article) => ({ article, score: scoreArticleForCandidate(article, text) }))
      .sort((a, b) => b.score - a.score)
      .filter(({ article }) => !used.has(article.url ?? article.link))
      .map(({ article, score }) => ({
        title: article.title,
        url: article.url ?? article.link,
        type: 'rss' as const,
        score,
      }))
      .filter((source) => source.score > 0);

    const ranked = [...existing, ...rssAdditions]
      .sort((a, b) => b.score - a.score)
      .reduce<CandidateEvidenceUrl[]>((acc, { title, url, type }) => {
        if (acc.some((source) => source.url === url)) return acc;
        if (acc.length >= MAX_EVIDENCE_URLS) return acc;
        acc.push({ title, url, type });
        return acc;
      }, []);

    return {
      ...candidate,
      sources: {
        rssKeywords: candidate.sources.rssKeywords,
        evidenceUrls: ranked,
      },
    };
  });
}

export class EntrepreneurAgent {
  private readonly ideaGeneration: IdeaGenerationAgent;
  private readonly filterAgent: FilterAgent;
  private readonly llm: LLMClient;

  constructor(llm: LLMClient) {
    this.llm = llm;
    this.ideaGeneration = new IdeaGenerationAgent(llm);
    this.filterAgent = new FilterAgent(llm);
  }

  private async translateRssArticles(rssContext: RssContext): Promise<RssContext> {
    const targets = rssContext.relatedArticles
      .filter((article) => article.title && !article.titleJa && !containsJapanese(article.title))
      .slice(0, MAX_TRANSLATED_RSS_ARTICLES)
      .map((article) => ({
        title: article.title,
        summary: article.summary.slice(0, 700),
      }));

    if (targets.length === 0) return rssContext;

    try {
      const raw = await this.llm.send(
        'あなたは技術ニュースの編集者です。英語RSS記事のタイトルを自然な日本語見出しに翻訳し、本文要約を日本語で2文以内にまとめます。固有名詞、製品名、技術名は無理に訳さず残します。JSON以外は出力しません。',
        `次の英語RSS記事を日本語化してください。\n出力は [{"title":"原文タイトル","titleJa":"日本語タイトル","summaryJa":"日本語の要約"}] のJSON配列のみ。\n\n${JSON.stringify(targets, null, 2)}`,
        5000,
      );
      const translations = ResponseParser.parse<RssArticleTranslation[]>(raw);
      return mergeRssArticleTranslations(rssContext, translations);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[TrendScan] RSS article translation failed: ${message}`);
      return rssContext;
    }
  }

  private async scanTrendContext(
    onProgress?: (text: string) => void,
    focusKeywords: string[] = DEFAULT_KEYWORDS,
  ): Promise<TrendScanOutput> {
    const keywords = [...new Set(focusKeywords.map((keyword) => keyword.trim()).filter(Boolean))];
    const effectiveKeywords = keywords.length > 0 ? keywords : DEFAULT_KEYWORDS;
    onProgress?.('[Enrichment] RSS データ取得中...');
    const rssContext = await fetchRssContext(effectiveKeywords.slice(0, 3));
    const rssCount = rssContext.trendingKeywords.length + rssContext.relatedArticles.length;
    console.log(`[IdeaGeneration] Enrichment: RSS: ${rssCount} items`);

    if (rssContext.relatedArticles.length === 0) {
      throw new RssSourceUnavailableError(
        'RSS記事を取得できなかったため、トレンドスキャンとアイデア生成を停止しました。',
        {
          operation: 'trend_scan',
          focusKeywords: effectiveKeywords,
          rssArticleCount: rssContext.relatedArticles.length,
          trendingKeywordCount: rssContext.trendingKeywords.length,
          sourceNames: sourceNames(rssContext),
          sourceErrors: rssContext.sourceErrors,
        },
      );
    }

    return {
      rssContext,
      focusKeywords: effectiveKeywords,
      generatedAt: new Date().toISOString(),
      sourceSummary: {
        rssItemCount: rssCount,
        usedLLMFallback: false,
        dataQuality: 'external',
      },
    };
  }

  async scanTrends(onProgress?: (text: string) => void): Promise<TrendScanOutput> {
    console.log('[TrendScan] Starting trend scan pipeline');
    const result = await this.scanTrendContext(onProgress);
    return {
      ...result,
      rssContext: await this.translateRssArticles(result.rssContext),
    };
  }

  async generateIdeasFromTrendScan(
    trendScan: TrendScanOutput,
    onProgress?: (text: string) => void,
    previousIdeas: IdeaCandidate[] = [],
    requestedIdeaCount = DEFAULT_IDEA_COUNT,
    recentlyUsedSources: UsedRssSource[] = [],
  ): Promise<IdeaGenerationOutput> {
    const startTime = Date.now();
    const effectiveTrendScan = applySourceUsageHistory(trendScan, recentlyUsedSources);
    const { rssContext, focusKeywords } = effectiveTrendScan;
    if (rssContext.relatedArticles.length === 0) {
      throw new RssSourceUnavailableError(
        '利用可能なRSS記事がないため、LLMによるアイデア生成を停止しました。',
        {
          operation: 'idea_generation',
          focusKeywords,
          rssArticleCount: rssContext.relatedArticles.length,
          trendingKeywordCount: rssContext.trendingKeywords.length,
          skippedPreviouslyUsedRssCount: effectiveTrendScan.sourceSummary.skippedPreviouslyUsedRssCount,
          sourceNames: sourceNames(rssContext),
          sourceErrors: rssContext.sourceErrors,
        },
      );
    }
    const sourceCountText = `RSS: ${effectiveTrendScan.sourceSummary.rssItemCount}件`;
    const previousCountText = previousIdeas.length > 0 ? `既存: ${previousIdeas.length}件` : '既存: 0件';
    const usedSourceText = recentlyUsedSources.length > 0 ? `使用済みRSS: ${recentlyUsedSources.length}件` : '使用済みRSS: 0件';
    onProgress?.(`[Enrichment] ${sourceCountText} / ${previousCountText} / ${usedSourceText}\n\n新しいアイデアを生成中...`);

    const input: IdeaGenerationInput = {
      rssContext,
      focusKeywords,
      previousIdeas,
      requestedIdeaCount,
      recentlyUsedSources,
    };

    onProgress?.('アイデア候補を生成中...');
    const rawCandidates = await this.ideaGeneration.execute(input);

    // LLM may return various formats — normalize to IdeaCandidate[]
    const candidates = attachTrustedEvidence(normalizeCandidates(rawCandidates), rssContext);

    const totalTime = Date.now() - startTime;
    console.log(`[IdeaGeneration] Generated ${candidates.length} ideas in ${totalTime}ms`);

    return {
      candidates,
      generatedAt: new Date().toISOString(),
      sourceSummary: effectiveTrendScan.sourceSummary,
    };
  }

  async generateIdeas(
    onProgress?: (text: string) => void,
    inputFocusKeywords?: string[],
    previousIdeas: IdeaCandidate[] = [],
    requestedIdeaCount = DEFAULT_IDEA_COUNT,
    recentlyUsedSources: UsedRssSource[] = [],
  ): Promise<IdeaGenerationOutput> {
    const startTime = Date.now();
    console.log('[IdeaGeneration] Starting idea generation pipeline');

    const trendScan = await this.scanTrendContext(onProgress, inputFocusKeywords);
    const result = await this.generateIdeasFromTrendScan(
      trendScan,
      onProgress,
      previousIdeas,
      requestedIdeaCount,
      recentlyUsedSources,
    );
    console.log(`[IdeaGeneration] Pipeline completed in ${Date.now() - startTime}ms`);
    return result;
  }

  async filterIdeas(input: SemanticFilterInput): Promise<SemanticFilterOutput> {
    if (!input.query.trim()) {
      return {
        filteredCandidates: input.candidates,
        filterReasoning: 'クエリが空のため、絞り込みを行わずそのまま表示しています。',
        matchCriteria: [],
      };
    }

    console.log(`[Filter] Filtering ${input.candidates.length} ideas with query: "${input.query}"`);
    return this.filterAgent.execute(input);
  }
}
