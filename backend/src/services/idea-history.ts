import type { IdeaCandidate } from 'ai-engine';

const DEFAULT_SIMILARITY_THRESHOLD = 0.34;
const TITLE_SIMILARITY_THRESHOLD = 0.72;
const CORE_SIMILARITY_THRESHOLD = 0.45;

const STOP_TERMS = new Set([
  'ai', 'api', 'app', 'apps', 'dev', 'developer', 'developers', 'development',
  'saas', 'tool', 'tools', 'web', 'service', 'services', 'user', 'users',
  'for', 'and', 'the', 'with', 'from', 'that', 'this', 'into', 'using',
  'アプリ', 'サービス', 'ツール', 'ユーザー', '開発', '課題', '解決',
  '自動化', '管理', '支援', '向け',
]);

export function normalizeText(text: string): string {
  return text
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}#+.\-\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function addJapaneseNgrams(tokens: Set<string>, run: string): void {
  if (run.length <= 4) {
    tokens.add(run);
    return;
  }

  for (let i = 0; i <= run.length - 3; i += 1) {
    tokens.add(run.slice(i, i + 3));
  }
}

export function tokenize(text: string): Set<string> {
  const tokens = new Set<string>();
  const normalized = normalizeText(text);

  for (const token of normalized.match(/[a-z][a-z0-9#+.-]{2,}/g) ?? []) {
    if (!STOP_TERMS.has(token) && token.length <= 32) tokens.add(token);
  }

  for (const run of normalized.match(/[ぁ-んァ-ヶ一-龯ー]{2,}/g) ?? []) {
    if (!STOP_TERMS.has(run) && run.length <= 40) addJapaneseNgrams(tokens, run);
  }

  return tokens;
}

function overlapCoefficient(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const token of a) {
    if (b.has(token)) intersection += 1;
  }
  return intersection / Math.min(a.size, b.size);
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const token of a) {
    if (b.has(token)) intersection += 1;
  }
  return intersection / (a.size + b.size - intersection);
}

function titleText(idea: IdeaCandidate): string {
  return `${idea.title} ${idea.tagline}`;
}

function coreText(idea: IdeaCandidate): string {
  return `${idea.coreProblem} ${idea.targetUsers} ${idea.productType}`;
}

function fullText(idea: IdeaCandidate): string {
  return [
    idea.title,
    idea.tagline,
    idea.description,
    idea.productType,
    idea.targetUsers,
    idea.coreProblem,
    idea.differentiation,
    ...idea.tags,
  ].join(' ');
}

function normalizedTitle(idea: IdeaCandidate): string {
  return normalizeText(idea.title).replace(/\s/g, '');
}

export function areIdeasSimilar(
  a: IdeaCandidate,
  b: IdeaCandidate,
  threshold = DEFAULT_SIMILARITY_THRESHOLD,
): boolean {
  if (a.id && b.id && a.id === b.id) return true;
  const aTitle = normalizedTitle(a);
  const bTitle = normalizedTitle(b);
  if (aTitle && aTitle === bTitle) return true;

  const titleScore = overlapCoefficient(tokenize(titleText(a)), tokenize(titleText(b)));
  if (titleScore >= TITLE_SIMILARITY_THRESHOLD) return true;

  const coreScore = jaccardSimilarity(tokenize(coreText(a)), tokenize(coreText(b)));
  if (coreScore >= CORE_SIMILARITY_THRESHOLD) return true;

  return jaccardSimilarity(tokenize(fullText(a)), tokenize(fullText(b))) >= threshold;
}

export function dedupeWithinBatch(
  candidates: IdeaCandidate[],
  threshold = DEFAULT_SIMILARITY_THRESHOLD,
): IdeaCandidate[] {
  const accepted: IdeaCandidate[] = [];
  for (const candidate of candidates) {
    const duplicate = accepted.some((existing) => areIdeasSimilar(existing, candidate, threshold));
    if (!duplicate) {
      accepted.push(candidate);
    }
  }
  return accepted;
}
