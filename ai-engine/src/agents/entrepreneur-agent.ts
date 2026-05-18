import { LLMClient } from '../services/llm-client';
import { renderPromptRole } from '../services/prompt-catalog';
import { ResponseParser } from '../services/response-parser';
import { IdeaGenerationAgent } from './idea-generation-agent';
import { FilterAgent } from './filter-agent';
import { fetchRssContext } from '../services/rss-client';
import { DEFAULT_IDEA_COUNT } from '../config/constants';
import { RssSourceUnavailableError } from '../errors';
import type {
  FeaturedTrend,
  IdeaGenerationInput,
  IdeaGenerationOutput,
  TrendScanOutput,
} from '../types/idea-generation';
import type { SemanticFilterInput, SemanticFilterOutput } from '../types/semantic-filter';
import type { IdeaCandidate } from '../types/idea-candidate';
import type { RssArticle, RssContext, RssSummaryError, RssTrendItem } from '../services/rss-client';

const DEFAULT_KEYWORDS = ['AI', 'SaaS', 'developer', 'productivity', 'automation', 'エンジニア', 'プロダクト開発'];
const MAX_EVIDENCE_URLS = 1;
const MAX_SUMMARIZED_RSS_ARTICLES = 18;
const RSS_SUMMARY_BATCH_SIZE = 4;
const RSS_SUMMARY_MAX_TOKENS = 7000;
const MIN_RSS_EVIDENCE_SCORE = 4;
const MIN_RSS_SUMMARY_ITEMS = 5;
const MAX_RSS_SUMMARY_ITEMS = 7;
const MIN_RSS_SUMMARY_CHARS = 700;
const MAX_RSS_SUMMARY_CHARS = 1200;
const MIN_RSS_SUMMARY_ITEM_CHARS = 90;
const MAX_RSS_SUMMARY_ITEM_CHARS = 180;
const FEED_METADATA_PATTERN = /\bArticle URL:|\bComments URL:|\bPoints:|#\s*Comments:/i;
const URL_TEXT_PATTERN = /\bhttps?:\/\/\S+|\bwww\.\S+/i;
const GENERIC_EVIDENCE_TERMS = new Set([
  'ai', 'api', 'app', 'apps', 'dev', 'developer', 'developers', 'development',
  'cli', 'saas', 'tool', 'tools', 'web', 'service', 'services', 'user', 'users',
  'アプリ', 'エンジニア', 'サービス', 'ツール', 'ユーザー', '開発',
  'スキル', '欲しい', '不便', '困ってる', '改善', '問題', '課題', '自動化',
  '文章を', '章を書', 'を書く',
]);

function sourceNames(rssContext: RssContext): string[] {
  const articleSources = rssContext.relatedArticles.map((article) => article.source).filter(Boolean);
  const failedSources = rssContext.sourceErrors?.map((error) => error.source).filter(Boolean) ?? [];
  return [...new Set([...articleSources, ...failedSources])];
}

interface RssArticleTranslation {
  index?: number;
  title: string;
  titleJa?: string;
  summaryJa?: string;
}

function containsJapanese(text: string): boolean {
  return /[ぁ-んァ-ヶ一-龯]/.test(text);
}

function normalizeTitle(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function normalizeArticleSummary(text: string): string {
  return normalizeTitle(text)
    .replace(/\bArticle URL:\s*\S+/gi, '')
    .replace(/\bComments URL:\s*\S+/gi, '')
    .replace(/\bPoints:\s*\d+/gi, '')
    .replace(/#\s*Comments:\s*\d+/gi, '')
    .replace(/\bhttps?:\/\/\S+|\bwww\.\S+/gi, '')
    .replace(/^(?:はじめに|概要|要約|導入|introduction)\s*[：:]\s*/i, '')
    .replace(/\s*(?:\.{3,}|…|続きを読む|read more)\s*$/i, '')
    .trim();
}

function countMatches(text: string, pattern: RegExp): number {
  return text.match(pattern)?.length ?? 0;
}

function hasFeedMetadataOrUrl(text: string): boolean {
  return FEED_METADATA_PATTERN.test(text) || URL_TEXT_PATTERN.test(text);
}

function looksLikeJapaneseTitle(text: string): boolean {
  return countMatches(text, /[ぁ-んァ-ヶ一-龯]/g) >= 2;
}

function looksLikeJapaneseSummary(text: string): boolean {
  const japaneseChars = countMatches(text, /[ぁ-んァ-ヶ一-龯]/g);
  const latinChars = countMatches(text, /[A-Za-z]/g);
  return japaneseChars >= 120 && japaneseChars >= latinChars * 0.35;
}

type SummaryValidationResult =
  | { ok: true; summaryJa: string }
  | { ok: false; message: string };

function validateSummaryJa(value: string | undefined): SummaryValidationResult {
  const original = normalizeTitle(value ?? '');
  if (hasFeedMetadataOrUrl(original)) {
    return { ok: false, message: 'summaryJa contains RSS metadata or URL text' };
  }

  const raw = normalizeArticleSummary(value ?? '');
  if (!raw) return { ok: false, message: 'summaryJa is empty' };

  const lines = raw
    .replace(/\r\n/g, '\n')
    .replace(/\s+・/g, '\n・')
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length < MIN_RSS_SUMMARY_ITEMS || lines.length > MAX_RSS_SUMMARY_ITEMS) {
    return {
      ok: false,
      message: `summaryJa must contain ${MIN_RSS_SUMMARY_ITEMS}-${MAX_RSS_SUMMARY_ITEMS} bullet items`,
    };
  }

  if (lines.some((line) => !/^・\s*/.test(line))) {
    return { ok: false, message: 'summaryJa bullet items must start with ・' };
  }

  const items = lines.map((line) => line
    .replace(/^・\s*/, '')
    .replace(/[。．.]+$/u, '')
    .trim());

  if (items.some((item) => !item)) {
    return { ok: false, message: 'summaryJa contains an empty bullet item' };
  }

  const shortItem = items.find((item) => item.length < MIN_RSS_SUMMARY_ITEM_CHARS);
  if (shortItem) {
    return {
      ok: false,
      message: `summaryJa bullet item is too short (${shortItem.length} chars)`,
    };
  }

  const longItem = items.find((item) => item.length > MAX_RSS_SUMMARY_ITEM_CHARS);
  if (longItem) {
    return {
      ok: false,
      message: `summaryJa bullet item is too long (${longItem.length} chars)`,
    };
  }

  const summaryJa = items.map((item) => `・${item}`).join('\n');
  const totalChars = items.join('').length;
  if (totalChars < MIN_RSS_SUMMARY_CHARS || totalChars > MAX_RSS_SUMMARY_CHARS) {
    return {
      ok: false,
      message: `summaryJa total length is outside the expected range (${totalChars} chars)`,
    };
  }

  if (!looksLikeJapaneseSummary(summaryJa)) {
    return { ok: false, message: 'summaryJa does not look like a Japanese summary' };
  }

  return { ok: true, summaryJa };
}

function summaryError(index: number, article: RssArticle, message: string): RssSummaryError {
  const url = article.url ?? article.link;
  return {
    index,
    title: article.title,
    source: article.source,
    message,
    ...(url ? { url } : {}),
  };
}

function titleJaForArticle(article: RssArticle, translation: RssArticleTranslation | undefined): string {
  if (containsJapanese(article.title)) return article.title;
  const titleJa = normalizeTitle(translation?.titleJa ?? '');
  return looksLikeJapaneseTitle(titleJa) ? titleJa : '';
}

function rebuildTrendingKeywords(articles: RssArticle[], fallback: RssTrendItem[]): RssTrendItem[] {
  const counts = new Map<string, number>();
  for (const article of articles) {
    for (const keyword of article.keywords ?? []) {
      counts.set(keyword, (counts.get(keyword) ?? 0) + 1);
    }
  }

  const rebuilt = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([word, count]) => ({ word, count }));

  return rebuilt.length > 0 ? rebuilt : fallback;
}

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
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

  private async summarizeRssArticles(rssContext: RssContext, focusKeywords: string[]): Promise<RssContext> {
    const targets = rssContext.relatedArticles
      .map((article, index) => ({ article, index }))
      .filter(({ article }) => article.title && !article.summaryJa)
      .slice(0, MAX_SUMMARIZED_RSS_ARTICLES)
      .map(({ article, index }) => ({
        index,
        title: article.title,
        source: article.source,
        language: containsJapanese(article.title) ? 'ja' : 'other',
        summary: normalizeArticleSummary(article.summary).slice(0, 1800),
      }));

    if (targets.length === 0) return rssContext;

    const systemPrompt = renderPromptRole('rss_article_summary', 'system');

    const translations: RssArticleTranslation[] = [];
    const summaryErrors = new Map<number, RssSummaryError>();
    const addSummaryError = (index: number, message: string): void => {
      const article = rssContext.relatedArticles[index];
      if (!article || summaryErrors.has(index)) return;
      summaryErrors.set(index, summaryError(index, article, message));
    };

    for (const batch of chunkArray(targets, RSS_SUMMARY_BATCH_SIZE)) {
      try {
        const raw = await this.llm.send(
          systemPrompt,
          renderPromptRole('rss_article_summary', 'user', { articles: batch }),
          RSS_SUMMARY_MAX_TOKENS,
        );
        const parsed = ResponseParser.parse<RssArticleTranslation[]>(raw);
        if (!Array.isArray(parsed)) throw new Error('RSS summary response was not a JSON array');
        translations.push(...parsed);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const indexes = batch.map((target) => target.index).join(',');
        console.warn(`[TrendScan] RSS article summarization failed for indexes ${indexes}: ${message}`);
        for (const target of batch) {
          addSummaryError(target.index, `summary generation failed: ${message}`);
        }
      }
    }

    const translationByIndex = new Map(
      translations
        .filter((translation) => Number.isInteger(translation.index))
        .map((translation) => [translation.index as number, translation] as const),
    );

    const summarizedArticles: RssArticle[] = [];
    const candidates = rssContext.relatedArticles.slice(0, MAX_SUMMARIZED_RSS_ARTICLES);
    candidates.forEach((article, index) => {
      const translation = translationByIndex.get(index);
      if (!translation) {
        addSummaryError(index, 'summary response did not include this article index');
        return;
      }

      const titleJa = titleJaForArticle(article, translation);
      if (!titleJa) {
        addSummaryError(index, 'titleJa was missing or was not translated into Japanese');
        return;
      }

      const summary = validateSummaryJa(translation.summaryJa);
      if (!summary.ok) {
        addSummaryError(index, summary.message);
        return;
      }

      summarizedArticles.push({
        ...article,
        titleJa,
        summaryJa: summary.summaryJa,
      });
    });

    const errors = [...summaryErrors.values()];
    if (summarizedArticles.length === 0) {
      throw new RssSourceUnavailableError(
        'RSS記事の要約生成または日本語変換に失敗したため、トレンドスキャンを停止しました。',
        {
          operation: 'trend_summary',
          focusKeywords,
          rssArticleCount: rssContext.relatedArticles.length,
          trendingKeywordCount: rssContext.trendingKeywords.length,
          sourceNames: sourceNames(rssContext),
          sourceErrors: rssContext.sourceErrors,
          summaryErrors: errors,
          summaryFailureCount: errors.length,
        },
      );
    }

    return {
      ...rssContext,
      trendingKeywords: rebuildTrendingKeywords(summarizedArticles, rssContext.trendingKeywords),
      relatedArticles: summarizedArticles,
      ...(errors.length > 0 ? { summaryErrors: errors } : {}),
    };
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
    const rssContext = await this.summarizeRssArticles(result.rssContext, result.focusKeywords);
    const summaryFailureCount = rssContext.summaryErrors?.length ?? 0;
    const warnings = [
      ...(result.sourceSummary.warnings ?? []),
      ...(summaryFailureCount > 0
        ? [`RSS記事の要約生成に失敗した${summaryFailureCount}件をトレンド表示から除外しました。`]
        : []),
    ];
    return {
      ...result,
      rssContext,
      sourceSummary: {
        ...result.sourceSummary,
        rssItemCount: rssContext.trendingKeywords.length + rssContext.relatedArticles.length,
        ...(warnings.length > 0 ? { warnings } : {}),
      },
      featuredTrend: await this.selectFeaturedTrend(rssContext),
    };
  }

  async generateIdeasFromTrendScan(
    trendScan: TrendScanOutput,
    onProgress?: (text: string) => void,
    requestedIdeaCount = DEFAULT_IDEA_COUNT,
    batchTime?: string,
  ): Promise<IdeaGenerationOutput> {
    const startTime = Date.now();
    const { rssContext, focusKeywords } = trendScan;
    if (rssContext.relatedArticles.length === 0) {
      throw new RssSourceUnavailableError(
        '利用可能なRSS記事がないため、LLMによるアイデア生成を停止しました。',
        {
          operation: 'idea_generation',
          focusKeywords,
          rssArticleCount: rssContext.relatedArticles.length,
          trendingKeywordCount: rssContext.trendingKeywords.length,
          sourceNames: sourceNames(rssContext),
          sourceErrors: rssContext.sourceErrors,
        },
      );
    }
    const sourceCountText = `RSS: ${trendScan.sourceSummary.rssItemCount}件`;
    onProgress?.(`[Enrichment] ${sourceCountText}\n\n新しいアイデアを生成中...`);

    const input: IdeaGenerationInput = {
      rssContext,
      focusKeywords,
      requestedIdeaCount,
    };

    onProgress?.('アイデア候補を生成中...');
    const rawCandidates = await this.ideaGeneration.execute(input);

    // LLM may return various formats — normalize to IdeaCandidate[]
    let candidates = attachTrustedEvidence(normalizeCandidates(rawCandidates), rssContext);

    // Apply batchTime to each candidate
    if (batchTime) {
      candidates = candidates.map((c) => ({ ...c, batchTime }));
    }

    const totalTime = Date.now() - startTime;
    console.log(`[IdeaGeneration] Generated ${candidates.length} ideas in ${totalTime}ms`);

    let featuredIdea: IdeaCandidate | undefined;
    if (candidates.length > 0) {
      featuredIdea = await this.selectFeaturedIdea(candidates);
    }

    return {
      candidates,
      featuredIdea,
      generatedAt: new Date().toISOString(),
      batchTime,
      sourceSummary: trendScan.sourceSummary,
    };
  }

  async generateIdeas(
    onProgress?: (text: string) => void,
    inputFocusKeywords?: string[],
    requestedIdeaCount = DEFAULT_IDEA_COUNT,
    batchTime?: string,
  ): Promise<IdeaGenerationOutput> {
    const startTime = Date.now();
    console.log('[IdeaGeneration] Starting idea generation pipeline');

    const trendScan = await this.scanTrendContext(onProgress, inputFocusKeywords);
    const result = await this.generateIdeasFromTrendScan(
      trendScan,
      onProgress,
      requestedIdeaCount,
      batchTime,
    );
    console.log(`[IdeaGeneration] Pipeline completed in ${Date.now() - startTime}ms`);
    return result;
  }

  private async selectFeaturedIdea(candidates: IdeaCandidate[]): Promise<IdeaCandidate | undefined> {
    try {
      const summaries = candidates.map((c, i) => ({
        index: i,
        title: c.title,
        tagline: c.tagline,
        productType: c.productType,
        coreProblem: c.coreProblem,
        differentiation: c.differentiation,
      }));

      const systemPrompt = renderPromptRole('featured_idea_selection', 'system');
      const userPrompt = renderPromptRole('featured_idea_selection', 'user', { idea_summaries: summaries });
      const raw = await this.llm.send(systemPrompt, userPrompt, 256);
      const parsed = JSON.parse(raw.trim());
      const idx = typeof parsed.index === 'number' ? parsed.index : undefined;
      if (idx !== undefined && idx >= 0 && idx < candidates.length) {
        console.log(`[IdeaGeneration] Featured idea selected: index=${idx} "${candidates[idx].title}"`);
        return candidates[idx];
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[IdeaGeneration] Featured idea selection failed: ${message}`);
    }
    return undefined;
  }

  private async selectFeaturedTrend(rssContext: RssContext): Promise<FeaturedTrend | undefined> {
    const articles = rssContext.relatedArticles
      .filter((article) => article.url || article.link)
      .slice(0, 18);
    if (articles.length === 0) return undefined;

    try {
      const summaries = articles.map((article, index) => ({
        index,
        title: article.title,
        titleJa: article.titleJa,
        source: article.source,
        published: article.publishedAt ?? article.published,
        summary: article.summaryJa ?? article.summary ?? article.description,
        keywords: article.keywords ?? [],
      }));

      const systemPrompt = renderPromptRole('featured_trend_selection', 'system');
      const userPrompt = renderPromptRole('featured_trend_selection', 'user', { trend_summaries: summaries });
      const raw = await this.llm.send(systemPrompt, userPrompt, 512);
      const parsed = ResponseParser.parse<{ index?: unknown; summary?: unknown }>(raw);
      const index = typeof parsed.index === 'number' ? parsed.index : undefined;
      const summary = typeof parsed.summary === 'string' ? normalizeTitle(parsed.summary) : '';
      if (index === undefined || index < 0 || index >= articles.length || !summary) return undefined;

      const article = articles[index];
      console.log(`[TrendScan] Featured trend selected: index=${index} "${article.titleJa ?? article.title}"`);
      return {
        title: article.title,
        titleJa: article.titleJa,
        url: article.url ?? article.link,
        source: article.source,
        published: article.publishedAt ?? article.published,
        summary,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[TrendScan] Featured trend selection failed: ${message}`);
      return undefined;
    }
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
