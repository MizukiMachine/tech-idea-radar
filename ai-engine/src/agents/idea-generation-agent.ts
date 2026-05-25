import { LLMClient } from '../services/llm-client';
import { renderPromptRole } from '../services/prompt-catalog';
import { ResponseParser } from '../services/response-parser';
import {
  DEFAULT_IDEA_COUNT,
  DEFAULT_IDEA_DETAIL_REQUEST_CONCURRENCY,
  DEFAULT_IDEA_DETAIL_REQUEST_RETRIES,
  DEFAULT_IDEA_DETAIL_REQUEST_TIMEOUT_MS,
  DEFAULT_IDEA_DETAIL_TOTAL_TIMEOUT_MS,
  DEFAULT_IDEA_DETAIL_RETRY_DELAY_MS,
  DEFAULT_IDEA_DETAIL_RETRY_MAX_DELAY_MS,
  DEFAULT_IDEA_FALLBACK_REQUEST_TIMEOUT_MS,
  DEFAULT_IDEA_SEED_REQUEST_TIMEOUT_MS,
  LARGE_MAX_TOKENS,
} from '../config/constants';
import type { IdeaGenerationInput } from '../types/idea-generation';
import type { IdeaCandidate } from '../types/idea-candidate';
import type { RssArticle } from '../services/rss-client';
import { BaseAgent } from './base-agent';
import { RssSourceUnavailableError } from '../errors';

const DEFAULT_PROMPT_ARTICLE_LIMIT = 8;
const DEFAULT_PROMPT_KEYWORD_LIMIT = 12;
const ARTICLE_SUMMARY_CHAR_LIMIT = 420;
const ARTICLE_DESCRIPTION_CHAR_LIMIT = 240;
const TOPIC_LIMIT = 8;
const IDEA_SEED_MAX_TOKENS = 8192;
const IDEA_DETAIL_MAX_TOKENS = 4096;
const DETAIL_BULLET_MAX_ITEMS = 5;
const DETAIL_BULLET_MAX_CHARS = 70;

type CandidateEvidenceUrl = NonNullable<IdeaCandidate['sources']['evidenceUrls']>[number];

interface IdeaSeed {
  seedId?: string;
  title: string;
  tagline?: string;
  tags?: string[];
  productType?: string;
  targetUsers?: string;
  coreProblem?: string;
  differentiationHint?: string;
  rssKeywords?: string[];
  evidenceUrls?: CandidateEvidenceUrl[];
  sources?: IdeaCandidate['sources'];
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function parseNonNegativeInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

function remainingMs(deadlineMs: number): number {
  return Math.max(0, deadlineMs - Date.now());
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function boundedRetryDelayMs(attempt: number): number {
  const baseDelayMs = parseNonNegativeInt(
    process.env.IDEA_DETAIL_RETRY_DELAY_MS,
    DEFAULT_IDEA_DETAIL_RETRY_DELAY_MS,
  );
  const maxDelayMs = parseNonNegativeInt(
    process.env.IDEA_DETAIL_RETRY_MAX_DELAY_MS,
    DEFAULT_IDEA_DETAIL_RETRY_MAX_DELAY_MS,
  );
  if (baseDelayMs === 0 || maxDelayMs === 0) return 0;
  return Math.min(baseDelayMs * (2 ** Math.max(0, attempt - 1)), maxDelayMs);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function textField(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function textArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => textField(item))
    .filter((item): item is string => Boolean(item));
}

function trimBulletSentenceEnd(value: string): string {
  return value
    .replace(/^[\s・\-*•]+/, '')
    .trim()
    .replace(/[。．.]+$/u, '')
    .trim();
}

function compactBulletItem(value: string): string {
  const trimmed = trimBulletSentenceEnd(value);
  const chars = Array.from(trimmed);
  if (chars.length <= DETAIL_BULLET_MAX_CHARS) return trimmed;
  return trimBulletSentenceEnd(`${chars.slice(0, DETAIL_BULLET_MAX_CHARS - 1).join('').trimEnd()}…`);
}

function normalizeBulletDescription(value: string): string {
  const lines = value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const alreadyList = lines.length > 1 || lines.some((line) => /^[・\-*•]/.test(line));
  const rawItems = alreadyList
    ? lines
    : value
      .replace(/\r?\n/g, ' ')
      .split(/。|．|(?:\.(?:\s+|$))/u);
  const items = rawItems
    .map(compactBulletItem)
    .filter(Boolean);

  return (items.length > 0 ? items : [compactBulletItem(value)])
    .slice(0, DETAIL_BULLET_MAX_ITEMS)
    .map((item) => `・${item}`)
    .join('\n');
}

function normalizeEvidenceUrl(value: unknown): CandidateEvidenceUrl | undefined {
  if (!isRecord(value)) return undefined;
  const title = textField(value.title);
  const url = textField(value.url);
  if (!title || !url) return undefined;
  const rawType = textField(value.type);
  const type: CandidateEvidenceUrl['type'] = rawType === 'web' || rawType === 'other' ? rawType : 'rss';
  return { title, url, type };
}

function normalizeEvidenceUrls(value: unknown): CandidateEvidenceUrl[] {
  if (!Array.isArray(value)) return [];
  return value
    .map(normalizeEvidenceUrl)
    .filter((item): item is CandidateEvidenceUrl => Boolean(item));
}

function objectCandidates(raw: unknown): Record<string, unknown>[] {
  if (Array.isArray(raw)) return raw.filter(isRecord);
  if (!isRecord(raw)) return [];

  if (textField(raw.title)) return [raw];

  const knownArrayKeys = ['ideas', 'candidates', 'ideaCandidates', 'seeds', 'ideaSeeds'];
  for (const key of knownArrayKeys) {
    const value = raw[key];
    if (Array.isArray(value)) return value.filter(isRecord);
  }

  const knownObjectKeys = ['idea', 'candidate', 'seed'];
  for (const key of knownObjectKeys) {
    const value = raw[key];
    if (isRecord(value) && textField(value.title)) return [value];
  }

  const nested = Object.values(raw)
    .find((value) => Array.isArray(value) && value.some((item) => isRecord(item) && textField(item.title)));
  if (Array.isArray(nested)) return nested.filter(isRecord);

  return [];
}

function normalizeIdeaSeed(raw: Record<string, unknown>, index: number): IdeaSeed | undefined {
  const title = textField(raw.title);
  if (!title) return undefined;

  const sources = isRecord(raw.sources) ? raw.sources : undefined;
  const seed: IdeaSeed = {
    seedId: textField(raw.seedId) ?? textField(raw.id) ?? `seed-${index + 1}`,
    title,
    tagline: textField(raw.tagline),
    tags: textArray(raw.tags),
    productType: textField(raw.productType),
    targetUsers: textField(raw.targetUsers),
    coreProblem: textField(raw.coreProblem),
    differentiationHint: textField(raw.differentiationHint) ?? textField(raw.differentiation),
    rssKeywords: textArray(raw.rssKeywords),
    evidenceUrls: normalizeEvidenceUrls(raw.evidenceUrls),
  };

  if (sources) {
    seed.sources = {
      rssKeywords: textArray(sources.rssKeywords),
      evidenceUrls: normalizeEvidenceUrls(sources.evidenceUrls),
    };
  }

  return seed;
}

function normalizeIdeaSeeds(raw: unknown): IdeaSeed[] {
  return objectCandidates(raw)
    .map((item, index) => normalizeIdeaSeed(item, index))
    .filter((item): item is IdeaSeed => Boolean(item));
}

function seedEvidenceUrls(seed: IdeaSeed): CandidateEvidenceUrl[] {
  if (seed.sources?.evidenceUrls?.length) return seed.sources.evidenceUrls;
  return seed.evidenceUrls ?? [];
}

function seedRssKeywords(seed: IdeaSeed): string[] {
  if (seed.sources?.rssKeywords?.length) return seed.sources.rssKeywords;
  return seed.rssKeywords ?? [];
}

function completeIdeaCandidate(raw: Record<string, unknown>, seed: IdeaSeed, index: number): IdeaCandidate | undefined {
  const title = textField(raw.title) ?? seed.title;
  const rawSources = isRecord(raw.sources) ? raw.sources : undefined;
  const tags = textArray(raw.tags);
  const fallbackTags = seed.tags ?? [];
  const rssKeywords = rawSources ? textArray(rawSources.rssKeywords) : [];
  const evidenceUrls = rawSources ? normalizeEvidenceUrls(rawSources.evidenceUrls) : [];
  const description = textField(raw.description);
  const tagline = textField(raw.tagline) ?? seed.tagline;
  const productType = textField(raw.productType) ?? seed.productType;
  const targetUsers = textField(raw.targetUsers) ?? seed.targetUsers;
  const coreProblem = textField(raw.coreProblem) ?? seed.coreProblem;
  const differentiation = textField(raw.differentiation) ?? seed.differentiationHint;
  const finalTags = tags.length > 0 ? tags : fallbackTags;

  if (
    !title
    || !tagline
    || !description
    || finalTags.length === 0
    || !productType
    || !targetUsers
    || !coreProblem
    || !differentiation
  ) {
    return undefined;
  }

  return {
    id: textField(raw.id) ?? seed.seedId ?? `idea-${index + 1}`,
    title,
    tagline,
    description: normalizeBulletDescription(description),
    tags: finalTags,
    productType,
    targetUsers,
    coreProblem,
    differentiation,
    sources: {
      rssKeywords: rssKeywords.length > 0 ? rssKeywords : seedRssKeywords(seed),
      evidenceUrls: evidenceUrls.length > 0 ? evidenceUrls : seedEvidenceUrls(seed),
    },
    generatedAt: textField(raw.generatedAt) ?? new Date().toISOString(),
  };
}

function normalizeIdeaCandidate(raw: unknown, seed: IdeaSeed, index: number): IdeaCandidate | undefined {
  const candidates = objectCandidates(raw);
  const first = candidates[0];
  return first ? completeIdeaCandidate(first, seed, index) : undefined;
}

function normalizeFallbackCandidates(raw: unknown): IdeaCandidate[] {
  return objectCandidates(raw)
    .map((item, index) => {
      const seed = normalizeIdeaSeed(item, index);
      return seed ? completeIdeaCandidate(item, seed, index) : undefined;
    })
    .filter((item): item is IdeaCandidate => Boolean(item));
}

async function runWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) return [];
  const workerCount = Math.max(1, Math.min(items.length, Math.floor(concurrency)));
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await worker(items[index], index);
    }
  }));

  return results;
}

function compactText(value: string | undefined, maxChars: number): string | undefined {
  if (!value) return undefined;
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxChars) return normalized;
  return `${normalized.slice(0, maxChars - 1).trim()}…`;
}

function seedKey(seed: IdeaSeed): string {
  return [
    seedEvidenceUrls(seed)[0]?.url ?? '',
    seed.title,
    seed.coreProblem ?? '',
  ].join('|').toLowerCase();
}

function uniqueSeeds(seeds: IdeaSeed[]): IdeaSeed[] {
  const seen = new Set<string>();
  const unique: IdeaSeed[] = [];
  for (const seed of seeds) {
    const key = seedKey(seed);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(seed);
  }
  return unique;
}

function articleEvidenceUrl(article: RssArticle): CandidateEvidenceUrl | undefined {
  const url = article.url ?? article.link;
  if (!url) return undefined;
  return {
    title: article.titleJa ?? article.title,
    url,
    type: 'rss',
  };
}

function articleKeywords(
  article: RssArticle,
  fallbackKeywords: string[],
): string[] {
  const keywords = [
    ...(article.keywords ?? []),
    article.topicKey,
    ...fallbackKeywords,
  ].filter((value): value is string => Boolean(textField(value)));
  return [...new Set(keywords)].slice(0, 5);
}

function heuristicIdeaSeeds(input: IdeaGenerationInput, requestedIdeaCount: number): IdeaSeed[] {
  const rssContext = input.rssContext;
  if (!rssContext) return [];

  const fallbackKeywords = [
    ...(input.focusKeywords ?? []),
    ...rssContext.trendingKeywords.map((item) => item.word),
  ].filter((value): value is string => Boolean(textField(value)));
  const productTypes = ['B2B SaaS', '開発者ツール', '分析ダッシュボード', 'B2Cアプリ', 'APIサービス'];
  const targetUsers = ['プロダクトチーム', '開発チーム', '小規模事業者', '情報収集担当者', '業務改善担当者'];

  const articleSeeds = rssContext.relatedArticles.map((article, index): IdeaSeed => {
    const title = article.titleJa ?? article.title;
    const keywords = articleKeywords(article, fallbackKeywords);
    const evidenceUrl = articleEvidenceUrl(article);
    const topic = compactText(article.topicKey ?? keywords[0] ?? title, 36) ?? `trend-${index + 1}`;
    return {
      seedId: `rss-seed-${index + 1}`,
      title: `${topic}支援プロダクト`,
      tagline: `${title}の動きから検証するプロダクト仮説`,
      tags: keywords.length > 0 ? keywords : ['RSS', 'trend'],
      productType: productTypes[index % productTypes.length],
      targetUsers: targetUsers[index % targetUsers.length],
      coreProblem: `${title}に関連する変化を追い切れず、意思決定や実務への落とし込みが遅れる`,
      differentiationHint: `RSS記事「${title}」を根拠に、具体的な利用シーンと検証しやすい導入単位まで絞り込む`,
      rssKeywords: keywords,
      evidenceUrls: evidenceUrl ? [evidenceUrl] : [],
    };
  });

  const keywordSeeds = fallbackKeywords.map((keyword, index): IdeaSeed => ({
    seedId: `keyword-seed-${index + 1}`,
    title: `${keyword}活用ワークスペース`,
    tagline: `${keyword}関連の変化を実務に落とし込むプロダクト仮説`,
    tags: [keyword, 'RSS', 'trend'],
    productType: productTypes[(articleSeeds.length + index) % productTypes.length],
    targetUsers: targetUsers[(articleSeeds.length + index) % targetUsers.length],
    coreProblem: `${keyword}に関する情報は多いが、自社やチームで何を試すべきか判断しづらい`,
    differentiationHint: `直近RSSの論点をもとに、小さく検証できるワークフローへ変換する`,
    rssKeywords: [keyword],
    evidenceUrls: [],
  }));

  return uniqueSeeds([...articleSeeds, ...keywordSeeds]).slice(0, requestedIdeaCount);
}

function fillSeedsToRequestedCount(
  seeds: IdeaSeed[],
  input: IdeaGenerationInput,
  requestedIdeaCount: number,
): IdeaSeed[] {
  return uniqueSeeds([
    ...seeds,
    ...heuristicIdeaSeeds(input, requestedIdeaCount),
  ]).slice(0, requestedIdeaCount);
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
    return renderPromptRole('idea_generation', 'user', {
      rss_context: compactRssContextForPrompt(input.rssContext),
      focus_keywords: this.focusKeywordsText(input),
      requested_idea_count: String(this.requestedIdeaCount(input)),
    });
  }

  async execute(input: IdeaGenerationInput, onProgress?: (text: string) => void): Promise<IdeaCandidate[]> {
    this.assertRssArticlesAvailable(input);
    const parsed = await super.execute(input, onProgress) as unknown;
    const candidates = normalizeFallbackCandidates(parsed);
    if (candidates.length === 0) {
      throw new Error(`${this.name}: response contained no complete idea candidates`);
    }
    return candidates;
  }

  async executeStaged(input: IdeaGenerationInput, onProgress?: (text: string) => void): Promise<IdeaCandidate[]> {
    this.assertRssArticlesAvailable(input);
    const requestedIdeaCount = this.requestedIdeaCount(input);

    let seeds: IdeaSeed[] = [];
    try {
      onProgress?.('アイデア候補を選定中...');
      seeds = await this.generateSeeds(input);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[IdeaGeneration] Idea seed generation failed; using RSS-derived seed fallback: ${message}`);
      onProgress?.('RSS記事からアイデア候補を補完中...');
    }

    const selectedSeeds = fillSeedsToRequestedCount(seeds, input, requestedIdeaCount);
    if (selectedSeeds.length === 0) {
      console.warn('[IdeaGeneration] Idea seed generation returned no usable seeds; falling back to single request');
      return this.executeFallback(input, onProgress);
    }
    if (selectedSeeds.length < requestedIdeaCount) {
      console.warn(
        `[IdeaGeneration] Idea seed generation returned ${selectedSeeds.length}/${requestedIdeaCount} usable seeds; continuing with available seeds`,
      );
    }

    const defaultConcurrency = Math.min(selectedSeeds.length, DEFAULT_IDEA_DETAIL_REQUEST_CONCURRENCY);
    const detailConcurrency = Math.min(
      selectedSeeds.length,
      parsePositiveInt(process.env.IDEA_DETAIL_REQUEST_CONCURRENCY, defaultConcurrency),
    );
    console.log(
      `[IdeaGeneration] Expanding ${selectedSeeds.length} idea seeds with concurrency=${detailConcurrency}`,
    );
    onProgress?.(`アイデア候補 ${selectedSeeds.length} 件を並列で詳細化中...`);

    const detailRetries = parseNonNegativeInt(
      process.env.IDEA_DETAIL_REQUEST_RETRIES,
      DEFAULT_IDEA_DETAIL_REQUEST_RETRIES,
    );
    const detailTotalTimeoutMs = parsePositiveInt(
      process.env.IDEA_DETAIL_TOTAL_TIMEOUT_MS,
      DEFAULT_IDEA_DETAIL_TOTAL_TIMEOUT_MS,
    );
    const detailResults = await this.generateDetailsWithRetries(
      input,
      selectedSeeds,
      detailConcurrency,
      detailRetries,
      detailTotalTimeoutMs,
      onProgress,
    );

    const candidates = detailResults
      .filter((candidate): candidate is IdeaCandidate => Boolean(candidate))
      .slice(0, requestedIdeaCount);
    if (candidates.length < selectedSeeds.length) {
      console.warn(
        `[IdeaGeneration] Idea detail generation returned ${candidates.length}/${selectedSeeds.length} usable candidates after retries`,
      );
      if (candidates.length > 0) {
        onProgress?.(`生成できた ${candidates.length} 件のアイデアを表示します。`);
        return candidates;
      }

      onProgress?.('アイデア詳細生成に失敗したため、まとめて再生成中...');
      return this.executeFallback(input, onProgress);
    }

    onProgress?.(`アイデア詳細を ${candidates.length} 件生成しました。`);
    return candidates;
  }

  private async generateSeeds(input: IdeaGenerationInput): Promise<IdeaSeed[]> {
    const raw = await this.llm.send(
      renderPromptRole('idea_seed_generation', 'system'),
      renderPromptRole('idea_seed_generation', 'user', {
        rss_context: compactRssContextForPrompt(input.rssContext),
        focus_keywords: this.focusKeywordsText(input),
        requested_idea_count: String(this.requestedIdeaCount(input)),
      }),
      IDEA_SEED_MAX_TOKENS,
      {
        maxAttempts: 1,
        timeoutMs: parsePositiveInt(
          process.env.IDEA_SEED_REQUEST_TIMEOUT_MS,
          DEFAULT_IDEA_SEED_REQUEST_TIMEOUT_MS,
        ),
      },
    );
    const parsed = ResponseParser.parse<unknown>(raw);
    return normalizeIdeaSeeds(parsed);
  }

  private async generateDetail(
    input: IdeaGenerationInput,
    seed: IdeaSeed,
    index: number,
    timeoutMs = parsePositiveInt(
      process.env.IDEA_DETAIL_REQUEST_TIMEOUT_MS,
      DEFAULT_IDEA_DETAIL_REQUEST_TIMEOUT_MS,
    ),
  ): Promise<IdeaCandidate | undefined> {
    const raw = await this.llm.send(
      renderPromptRole('idea_detail_generation', 'system'),
      renderPromptRole('idea_detail_generation', 'user', {
        rss_context: compactRssContextForPrompt(input.rssContext),
        focus_keywords: this.focusKeywordsText(input),
        idea_seed: seed,
      }),
      IDEA_DETAIL_MAX_TOKENS,
      {
        maxAttempts: 1,
        timeoutMs,
      },
    );
    const parsed = ResponseParser.parse<unknown>(raw);
    return normalizeIdeaCandidate(parsed, seed, index);
  }

  private async generateDetailsWithRetries(
    input: IdeaGenerationInput,
    seeds: IdeaSeed[],
    concurrency: number,
    retries: number,
    totalTimeoutMs: number,
    onProgress?: (text: string) => void,
  ): Promise<Array<IdeaCandidate | undefined>> {
    const results: Array<IdeaCandidate | undefined> = new Array(seeds.length);
    let pending = seeds.map((seed, index) => ({ seed, index }));
    const maxAttempts = retries + 1;
    const deadlineMs = Date.now() + totalTimeoutMs;
    const requestTimeoutMs = parsePositiveInt(
      process.env.IDEA_DETAIL_REQUEST_TIMEOUT_MS,
      DEFAULT_IDEA_DETAIL_REQUEST_TIMEOUT_MS,
    );

    for (let attempt = 1; attempt <= maxAttempts && pending.length > 0; attempt += 1) {
      if (remainingMs(deadlineMs) <= 0) {
        console.warn(`[IdeaGeneration] Idea detail total timeout reached with ${pending.length} pending seeds`);
        onProgress?.('アイデア詳細生成の時間上限に達したため、まとめて再生成中...');
        break;
      }
      console.log(
        `[IdeaGeneration] Idea detail attempt ${attempt}/${maxAttempts}: ${pending.length} pending, concurrency=${concurrency}, remaining=${remainingMs(deadlineMs)}ms`,
      );
      const attemptResults = await runWithConcurrency(pending, concurrency, async ({ seed, index }) => {
        const availableMs = remainingMs(deadlineMs);
        if (availableMs < 1000) {
          console.warn(`[IdeaGeneration] Idea detail total timeout reached before seed ${index + 1}`);
          return { index, seed, candidate: undefined };
        }

        try {
          const candidate = await this.generateDetail(input, seed, index, Math.min(requestTimeoutMs, availableMs));
          if (!candidate) {
            console.warn(`[IdeaGeneration] Idea detail generation returned incomplete JSON for seed ${index + 1}`);
          }
          return { index, seed, candidate };
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          console.warn(`[IdeaGeneration] Idea detail generation failed for seed ${index + 1}: ${message}`);
          return { index, seed, candidate: undefined };
        }
      });

      pending = [];
      for (const result of attemptResults) {
        if (result.candidate) {
          results[result.index] = result.candidate;
        } else {
          pending.push({ seed: result.seed, index: result.index });
        }
      }

      if (pending.length > 0 && attempt < maxAttempts) {
        const delayMs = Math.min(boundedRetryDelayMs(attempt), remainingMs(deadlineMs));
        if (delayMs > 0) {
          const delaySeconds = Math.ceil(delayMs / 1000);
          console.warn(`[IdeaGeneration] Waiting ${delayMs}ms before retrying ${pending.length} idea details`);
          onProgress?.(`失敗したアイデア詳細 ${pending.length} 件を ${delaySeconds} 秒後に再生成します...`);
          await sleep(delayMs);
        } else {
          onProgress?.(`失敗したアイデア詳細 ${pending.length} 件を再生成中...`);
        }
      }
    }

    return results;
  }

  private async executeFallback(input: IdeaGenerationInput, onProgress?: (text: string) => void): Promise<IdeaCandidate[]> {
    onProgress?.('アイデアをまとめて再生成中...');
    const raw = await this.llm.send(
      this.systemPrompt,
      this.buildUserPrompt(input),
      this.maxTokens,
      {
        maxAttempts: 1,
        timeoutMs: parsePositiveInt(
          process.env.IDEA_FALLBACK_REQUEST_TIMEOUT_MS,
          DEFAULT_IDEA_FALLBACK_REQUEST_TIMEOUT_MS,
        ),
      },
    );
    try {
      const parsed = ResponseParser.parse<unknown>(raw);
      const candidates = normalizeFallbackCandidates(parsed);
      if (candidates.length === 0) {
        throw new Error('fallback response contained no complete idea candidates');
      }
      return candidates;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      throw new Error(`${this.name}: fallback response parsing failed — ${msg}`);
    }
  }

  private assertRssArticlesAvailable(input: IdeaGenerationInput): void {
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
  }

  private focusKeywordsText(input: IdeaGenerationInput): string {
    return input.focusKeywords?.length
      ? input.focusKeywords.join(', ')
      : '（特になし — 幅広く提案してください）';
  }

  private requestedIdeaCount(input: IdeaGenerationInput): number {
    return input.requestedIdeaCount ?? DEFAULT_IDEA_COUNT;
  }
}
