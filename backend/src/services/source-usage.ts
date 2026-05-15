import type { IdeaCandidate, UsedRssSource } from 'ai-engine';

export interface SourceUsageRecord extends UsedRssSource {
  firstUsedAt: string;
  lastUsedAt: string;
  count: number;
  ideaIds: string[];
  ideaTitles: string[];
}

export function normalizeSourceUrl(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.hash = '';
    for (const key of [...parsed.searchParams.keys()]) {
      const normalizedKey = key.toLowerCase();
      if (normalizedKey.startsWith('utm_') || ['fbclid', 'gclid'].includes(normalizedKey)) {
        parsed.searchParams.delete(key);
      }
    }
    return parsed.toString();
  } catch {
    return url.trim();
  }
}

function sourceKey(source: { url: string }): string {
  return normalizeSourceUrl(source.url);
}

function candidateGeneratedAt(candidate: IdeaCandidate, fallback: string): string {
  return candidate.generatedAt || fallback;
}

export function buildSourceUsageHistory(
  candidates: IdeaCandidate[],
  fallbackUsedAt: string,
  limit: number,
): SourceUsageRecord[] {
  return mergeSourceUsageHistory([], candidates, fallbackUsedAt, limit);
}

export function mergeSourceUsageHistory(
  existingRecords: SourceUsageRecord[],
  candidates: IdeaCandidate[],
  fallbackUsedAt: string,
  limit: number,
): SourceUsageRecord[] {
  const records = new Map<string, SourceUsageRecord>();

  for (const record of existingRecords) {
    const key = sourceKey(record);
    if (!key) continue;
    records.set(key, {
      ...record,
      url: key,
      ideaIds: [...new Set(record.ideaIds ?? [])],
      ideaTitles: [...new Set(record.ideaTitles ?? [])],
    });
  }

  for (const candidate of candidates) {
    const usedAt = candidateGeneratedAt(candidate, fallbackUsedAt);
    for (const source of candidate.sources.evidenceUrls ?? []) {
      if (source.type !== 'rss' || !source.url) continue;
      const key = sourceKey(source);
      if (!key) continue;

      const current = records.get(key);
      if (!current) {
        records.set(key, {
          title: source.title,
          url: key,
          firstUsedAt: usedAt,
          lastUsedAt: usedAt,
          count: 1,
          ideaIds: [candidate.id],
          ideaTitles: [candidate.title],
        });
        continue;
      }

      records.set(key, {
        ...current,
        title: current.title || source.title,
        firstUsedAt: current.firstUsedAt < usedAt ? current.firstUsedAt : usedAt,
        lastUsedAt: current.lastUsedAt > usedAt ? current.lastUsedAt : usedAt,
        count: current.count + 1,
        ideaIds: [...new Set([...current.ideaIds, candidate.id])],
        ideaTitles: [...new Set([...current.ideaTitles, candidate.title])],
      });
    }
  }

  return [...records.values()]
    .sort((a, b) => Date.parse(b.lastUsedAt) - Date.parse(a.lastUsedAt))
    .slice(0, limit);
}

export function sourceUsageForPrompt(records: SourceUsageRecord[]): UsedRssSource[] {
  return records.map((record) => ({
    title: record.title,
    url: record.url,
    lastUsedAt: record.lastUsedAt,
    count: record.count,
    ideaTitles: record.ideaTitles,
  }));
}
