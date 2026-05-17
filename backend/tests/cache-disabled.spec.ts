import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const originalCacheDisabled = process.env.IDEA_CACHE_DISABLED;
const originalCacheFile = process.env.IDEA_CACHE_FILE;

function restoreEnv() {
  if (originalCacheDisabled === undefined) delete process.env.IDEA_CACHE_DISABLED;
  else process.env.IDEA_CACHE_DISABLED = originalCacheDisabled;

  if (originalCacheFile === undefined) delete process.env.IDEA_CACHE_FILE;
  else process.env.IDEA_CACHE_FILE = originalCacheFile;
}

describe("disabled idea cache", () => {
  afterEach(() => {
    restoreEnv();
    vi.resetModules();
  });

  it("does not expose persisted cache data when cache is disabled", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "builder-agent-chain-cache-"));
    const cacheFile = path.join(tmpDir, "idea-cache.json");
    fs.writeFileSync(cacheFile, JSON.stringify({
      version: 2,
      updatedAt: "2026-05-17T00:00:00.000Z",
      batches: [{
        batchTime: "2026-05-17T00:00:00+09:00",
        data: {
          generatedAt: "2026-05-17T00:00:00.000Z",
          sourceSummary: { rssItemCount: 1, usedLLMFallback: false },
          candidates: [{
            id: "cached-idea",
            title: "Cached Idea",
            tagline: "Should not be returned",
            description: "Cached data",
            tags: ["cache"],
            productType: "SaaS",
            targetUsers: "Builders",
            coreProblem: "Stale data",
            differentiation: "None",
            sources: { rssKeywords: ["cache"], evidenceUrls: [] },
            generatedAt: "2026-05-17T00:00:00.000Z",
          }],
        },
      }],
      trends: null,
    }));

    vi.resetModules();
    process.env.IDEA_CACHE_DISABLED = "true";
    process.env.IDEA_CACHE_FILE = cacheFile;

    const cache = await import("../src/services/idea-cache");

    expect(cache.isCacheDisabled()).toBe(true);
    expect(cache.isPersistentCacheEnabled()).toBe(false);
    expect(cache.getCachedIdeas()).toBeNull();
    expect(cache.getBatchInfos()).toEqual([]);
  });
});
