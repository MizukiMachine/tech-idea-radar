const TARGET_USERS_DISPLAY_MAX_CHARS = 18;

const DOMAIN_TARGET_FALLBACKS: Array<[RegExp, string]> = [
  [/AIコーディング(?:アシスタント|エージェント)|Copilot|Cursor/i, 'AI開発チーム'],
  [/インディーゲーム|ゲーム開発/, 'ゲーム開発者'],
  [/レガシー|モダナイゼーション/, 'レガシー刷新チーム'],
  [/OSS|オープンソース/, 'OSSメンテナ'],
];

const ROLE_SUFFIXES = [
  'インディーゲーム開発者',
  'オープンソースプロジェクトのメンテナ',
  'モダナイゼーション担当者',
  'DX担当者',
  'EC担当者',
  '担当者',
  '責任者',
  '管理者',
  '利用者',
  'ユーザー',
  'メンテナ',
  '開発者',
  'エンジニア',
  'デザイナー',
  'マーケター',
  'クリエイター',
  'チーム',
  '組織',
  '企業',
  '事業者',
  '自治体',
  '学校',
  '店舗',
  '情シス',
  'SRE',
  'PM',
  'PdM',
];

const CLAUSE_MARKERS = [
  '検討中の',
  '導入済みだが',
  '導入したいが',
  '組織導入している',
  '組織導入して',
  '利用中の',
  '運用中の',
  '必要とする',
  '必要な',
  '抱える',
  '悩む',
  '持たず',
  '持たない',
  '向けの',
  '使う',
];

const GENERIC_ORG_TARGETS = new Set(['組織', '企業', 'チーム']);
const ACTIONY_ORG_TARGET_PATTERN = /[をにがは].*(?:チーム|組織|企業)$/;

function cleanupTargetUsers(value: string): string {
  return value
    .replace(/\s+/g, ' ')
    .replace(/[.…]+$/g, '')
    .replace(/^[、。,.／/|｜\s]+/g, '')
    .replace(/[、。,.／/|｜\s]+$/g, '')
    .replace(/[でにをがはもとへ]+$/g, '')
    .trim();
}

export function normalizeTargetUsers(value: string): string {
  return cleanupTargetUsers(value);
}

function lastClauseMarkerIndex(value: string): { index: number; length: number } | null {
  let found: { index: number; length: number } | null = null;
  for (const marker of CLAUSE_MARKERS) {
    const index = value.lastIndexOf(marker);
    if (index >= 0 && (!found || index > found.index)) {
      found = { index, length: marker.length };
    }
  }
  return found;
}

function roleBasedTarget(value: string): string | null {
  const sizeOrg = /[0-9０-９]+[〜~～-][0-9０-９]+チーム規模の組織/.exec(value)?.[0];
  if (sizeOrg) return cleanupTargetUsers(sizeOrg);

  for (const suffix of ROLE_SUFFIXES) {
    const end = value.lastIndexOf(suffix);
    if (end < 0) continue;
    const nextChar = value[end + suffix.length];
    if (nextChar && !/[、。,.／/|｜\sでにをがはもとへ]/.test(nextChar)) continue;

    const prefix = value.slice(0, end + suffix.length);
    const marker = lastClauseMarkerIndex(prefix);
    const candidate = cleanupTargetUsers(marker ? prefix.slice(marker.index + marker.length) : prefix);
    if (candidate && candidate.length <= TARGET_USERS_DISPLAY_MAX_CHARS) return candidate;
  }

  return null;
}

function domainFallback(value: string): string | null {
  return DOMAIN_TARGET_FALLBACKS.find(([pattern]) => pattern.test(value))?.[1] ?? null;
}

export function compactTargetUsers(value: string): string {
  const normalized = normalizeTargetUsers(value);
  if (!normalized) return '対象未設定';
  if (normalized.length <= TARGET_USERS_DISPLAY_MAX_CHARS) return normalized;

  const roleTarget = roleBasedTarget(normalized);
  const fallback = domainFallback(normalized);
  if (
    roleTarget
    && !GENERIC_ORG_TARGETS.has(roleTarget)
    && !(fallback && ACTIONY_ORG_TARGET_PATTERN.test(roleTarget))
  ) {
    return roleTarget;
  }
  if (fallback) return fallback;
  if (roleTarget) return roleTarget;

  const firstSegment = normalized
    .split(/[、。,.／/|｜]/)
    .map(cleanupTargetUsers)
    .find((part) => part.length > 0 && part.length <= TARGET_USERS_DISPLAY_MAX_CHARS);
  if (firstSegment) return firstSegment;

  return `${cleanupTargetUsers(normalized.slice(0, TARGET_USERS_DISPLAY_MAX_CHARS - 1))}…`;
}
