import type { IdeaCandidate } from '../types/idea-candidate';

function clampScale(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.min(5, Math.max(1, Math.round(value)));
  }

  if (typeof value === 'string') {
    const match = value.match(/\d(?:\.\d+)?/);
    if (!match) return null;
    const parsed = Number(match[0]);
    if (Number.isFinite(parsed)) return Math.min(5, Math.max(1, Math.round(parsed)));
  }

  return null;
}

function scaleFromLegacyMvpTime(value: string | undefined): number {
  if (!value) return 3;
  if (/日|1\s*週|2\s*週/.test(value)) return 1;
  if (/週|1\s*(ヶ月|か月|月)/.test(value)) return 2;
  if (/2\s*(ヶ月|か月|月)/.test(value)) return 3;
  if (/3\s*(ヶ月|か月|月)/.test(value)) return 4;
  if (/半年|6\s*(ヶ月|か月|月)|年/.test(value)) return 5;
  return 3;
}

export function getDevelopmentScale(
  idea: Pick<IdeaCandidate, 'developmentScale' | 'estimatedMvpTime'>,
): number {
  return clampScale(idea.developmentScale) ?? scaleFromLegacyMvpTime(idea.estimatedMvpTime);
}

export function developmentScaleStars(scale: number): string {
  const safeScale = Math.min(5, Math.max(1, Math.round(scale)));
  return `${'★'.repeat(safeScale)}${'☆'.repeat(5 - safeScale)}`;
}

export function developmentScaleLabel(scale: number): string {
  const labels = ['軽い検証', '小さめ', '中規模', '大きめ', 'かなり大きい'];
  const index = Math.min(5, Math.max(1, Math.round(scale))) - 1;
  return labels[index];
}
