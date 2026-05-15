import { LLMClient } from '../services/llm-client';
import { ResponseParser } from '../services/response-parser';
import { IdeaGenerationAgent } from './idea-generation-agent';
import { FilterAgent } from './filter-agent';
import { fetchRssContext } from '../services/mcp-client';
import { fetchXContext } from '../services/x-client';
import type { IdeaGenerationInput, IdeaGenerationOutput, TrendScanOutput } from '../types/idea-generation';
import type { SemanticFilterInput, SemanticFilterOutput } from '../types/semantic-filter';
import type { IdeaCandidate } from '../types/idea-candidate';
import type { RssArticle, RssContext } from '../services/mcp-client';
import type { XContext } from '../types/x-context';

const DEFAULT_KEYWORDS = ['AI', 'SaaS', 'developer', 'productivity', 'automation', 'エンジニア', '個人開発'];
const MAX_EVIDENCE_URLS = 1;
const MAX_TRANSLATED_RSS_ARTICLES = 18;
const MIN_RSS_EVIDENCE_SCORE = 4;
const MIN_X_EVIDENCE_SCORE = 5;
const MIN_DECLARED_X_SEED_SCORE = 2;
const GENERIC_EVIDENCE_TERMS = new Set([
  'ai', 'api', 'app', 'apps', 'dev', 'developer', 'developers', 'development',
  'cli', 'saas', 'tool', 'tools', 'web', 'service', 'services', 'user', 'users',
  'アプリ', 'エンジニア', 'サービス', 'ツール', 'ユーザー', '個人開発', '開発',
  'スキル', '欲しい', '不便', '困ってる', '改善', '問題', '課題', '自動化',
  '文章を', '章を書', 'を書く',
]);

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

interface XEvidence {
  seedId: string;
  title: string;
  url: string;
  keywords: string[];
  weight: number;
}

type CandidateEvidenceUrl = NonNullable<IdeaCandidate['sources']['evidenceUrls']>[number];
type ScoredEvidenceUrl = CandidateEvidenceUrl & { score: number };

function buildXDemandEvidenceList(xContext: XContext): XEvidence[] {
  const map = new Map<string, XEvidence>();

  for (const [index, signal] of xContext.demandSignals.slice(0, 10).entries()) {
    const url = signal.tweet.url;
    if (!url) continue;
    const current = map.get(url);
    const next: XEvidence = {
      seedId: `x-demand-${index + 1}`,
      title: signal.tweet.text.slice(0, 120),
      url,
      keywords: [...signal.matchedKeywords, signal.needCategory],
      weight: signal.relevanceScore + signal.tweet.likeCount + signal.tweet.retweetCount,
    };
    if (!current || next.weight > current.weight) map.set(url, next);
  }

  return [...map.values()];
}

function scoreXEvidenceForCandidate(
  source: XEvidence,
  text: string,
  minScore = MIN_X_EVIDENCE_SCORE,
): number {
  const sourceText = `${source.title} ${source.keywords.join(' ')}`;
  let score = evidenceOverlapScore(sourceText, text);
  for (const keyword of source.keywords) {
    const normalized = normalizeEvidenceText(keyword);
    if (normalized && !GENERIC_EVIDENCE_TERMS.has(normalized) && text.includes(normalized)) score += 2;
  }
  if (score < minScore) return 0;
  return score + Math.min(Math.log1p(source.weight), 6);
}

function scoreExistingEvidenceForCandidate(
  source: CandidateEvidenceUrl,
  text: string,
  articleByUrl: Map<string, RssArticle>,
  xEvidenceByUrl: Map<string, XEvidence>,
): number {
  if (source.type === 'rss') {
    const article = articleByUrl.get(source.url);
    return article ? scoreArticleForCandidate(article, text) : 0;
  }
  if (source.type === 'x') {
    const evidence = xEvidenceByUrl.get(source.url);
    return evidence ? scoreXEvidenceForCandidate(evidence, text) : 0;
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

function attachTrustedEvidence(candidates: IdeaCandidate[], rssContext: RssContext, xContext: XContext): IdeaCandidate[] {
  const articles = rssContext.relatedArticles.filter((article) => article.link || article.url);
  const articleByUrl = new Map<string, RssArticle>();
  for (const article of articles) {
    const url = article.url ?? article.link;
    if (url) articleByUrl.set(url, article);
  }
  const xEvidence = buildXDemandEvidenceList(xContext);
  const xEvidenceByUrl = new Map(xEvidence.map((source) => [source.url, source]));
  const xEvidenceBySeedId = new Map(xEvidence.map((source) => [source.seedId, source]));
  const allowedUrls = new Set<string>(articleByUrl.keys());
  for (const source of xEvidence) allowedUrls.add(source.url);

  if (articles.length === 0 && xEvidence.length === 0) {
    return candidates.map((candidate) => ({
      ...candidate,
      sources: {
        ...candidate.sources,
        evidenceUrls: (candidate.sources.evidenceUrls ?? [])
          .filter((source) => allowedUrls.has(source.url))
          .slice(0, MAX_EVIDENCE_URLS),
      },
    }));
  }

  return candidates.map((candidate) => {
    const text = candidateText(candidate);
    const declaredSeed = candidate.sources.sourceSeedId
      ? xEvidenceBySeedId.get(candidate.sources.sourceSeedId)
      : undefined;
    if (declaredSeed) {
      const score = scoreXEvidenceForCandidate(declaredSeed, text, MIN_DECLARED_X_SEED_SCORE);
      if (score > 0) {
        return {
          ...candidate,
          sources: {
            ...candidate.sources,
            evidenceUrls: [{
              title: declaredSeed.title,
              url: declaredSeed.url,
              type: 'x',
            }],
          },
        };
      }
      return {
        ...candidate,
        sources: {
          ...candidate.sources,
          evidenceUrls: [],
        },
      };
    }

    const existing = (candidate.sources.evidenceUrls ?? [])
      .filter((source) => allowedUrls.has(source.url))
      .map((source): ScoredEvidenceUrl => ({
        ...source,
        title: source.type === 'x'
          ? xEvidenceByUrl.get(source.url)?.title ?? source.title
          : source.title,
        score: scoreExistingEvidenceForCandidate(source, text, articleByUrl, xEvidenceByUrl),
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

    const preferredX = existing
      .filter((source) => source.type === 'x')
      .sort((a, b) => b.score - a.score);

    if (preferredX.length > 0) {
      const [{ title, url, type }] = preferredX;
      return {
        ...candidate,
        sources: {
          ...candidate.sources,
          evidenceUrls: [{ title, url, type }],
        },
      };
    }

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
        ...candidate.sources,
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
    onProgress?.('[Enrichment] RSS + X データ取得中...');
    const [rssContext, xContext] = await Promise.all([
      fetchRssContext(effectiveKeywords.slice(0, 3)),
      fetchXContext(effectiveKeywords, []),
    ]);
    const rssCount = rssContext.trendingKeywords.length + rssContext.relatedArticles.length;
    const xCount = xContext.trendingTopics.length + xContext.demandSignals.length + xContext.competitorSentiments.length;
    console.log(`[IdeaGeneration] Enrichment: RSS: ${rssCount} items, X: ${xCount} signals`);

    const usedLLMFallback = rssContext.relatedArticles.length === 0 && xCount === 0;
    const warnings = usedLLMFallback
      ? ['外部RSS/Xデータを取得できなかったため、LLMの一般知識フォールバックで生成しました。']
      : [];

    return {
      rssContext,
      xContext,
      focusKeywords: effectiveKeywords,
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

  async scanTrends(onProgress?: (text: string) => void): Promise<TrendScanOutput> {
    console.log('[TrendScan] Starting trend scan pipeline');
    const result = await this.scanTrendContext(onProgress);
    return {
      ...result,
      rssContext: await this.translateRssArticles(result.rssContext),
    };
  }

  async generateIdeas(onProgress?: (text: string) => void, inputFocusKeywords?: string[]): Promise<IdeaGenerationOutput> {
    const startTime = Date.now();
    console.log('[IdeaGeneration] Starting idea generation pipeline');

    const trendScan = await this.scanTrendContext(onProgress, inputFocusKeywords);
    const { rssContext, xContext, focusKeywords } = trendScan;
    onProgress?.(`[Enrichment] RSS: ${trendScan.sourceSummary.rssItemCount}件, X: ${trendScan.sourceSummary.xSignalCount}件\n\nアイデア生成中...`);

    const input: IdeaGenerationInput = {
      rssContext,
      xContext,
      focusKeywords,
    };

    onProgress?.('アイデア候補を生成中...');
    const rawCandidates = await this.ideaGeneration.execute(input);

    // LLM may return various formats — normalize to IdeaCandidate[]
    const candidates = attachTrustedEvidence(normalizeCandidates(rawCandidates), rssContext, xContext);

    const totalTime = Date.now() - startTime;
    console.log(`[IdeaGeneration] Generated ${candidates.length} ideas in ${totalTime}ms (fallback: ${trendScan.sourceSummary.usedLLMFallback})`);

    return {
      candidates,
      generatedAt: new Date().toISOString(),
      sourceSummary: trendScan.sourceSummary,
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
