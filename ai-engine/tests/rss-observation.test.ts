import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const originalEnv = process.env;

beforeEach(() => {
  vi.resetModules();
  process.env = { ...originalEnv };
});

afterEach(() => {
  vi.useRealTimers();
  process.env = originalEnv;
});

function observedItem(id: string, lastSeenAt: string) {
  return {
    fingerprint: id,
    title: `Observed ${id}`,
    link: `https://example.com/${id}`,
    url: `https://example.com/${id}`,
    source: 'Example',
    sourceUrl: 'https://example.com/feed.xml',
    publishedAt: lastSeenAt,
    firstSeenAt: lastSeenAt,
    lastSeenAt,
    summary: `Summary for ${id}`,
    topicKey: id,
  };
}

describe('rss observation retention', () => {
  it('keeps only the last 24 hours of observed RSS items by default', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-17T04:00:00.000Z'));
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'builder-agent-chain-observation-'));
    const observationFile = path.join(tmpDir, 'rss-observations.json');
    const boundarySeenAt = '2026-05-16T04:00:00.000Z';
    const oldSeenAt = '2026-05-16T03:59:59.000Z';

    fs.writeFileSync(observationFile, JSON.stringify({
      schemaVersion: 1,
      updatedAt: '2026-05-17T00:00:00.000Z',
      items: [
        observedItem('recent', '2026-05-17T00:00:00.000Z'),
        observedItem('boundary', boundarySeenAt),
        observedItem('old', oldSeenAt),
      ],
    }));

    process.env.RSS_OBSERVATIONS_FILE = observationFile;

    const { observeRssArticles } = await import('../src/services/rss-observation');
    observeRssArticles([]);

    const persisted = JSON.parse(fs.readFileSync(observationFile, 'utf8')) as {
      items: { fingerprint: string }[];
    };
    expect(persisted.items.map((item) => item.fingerprint)).toEqual([
      'recent',
      'boundary',
    ]);
  });
});
