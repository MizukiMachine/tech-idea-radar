import { describe, expect, it } from "vitest";
import {
  buildSourceUsageHistory,
  mergeSourceUsageHistory,
  normalizeSourceUrl,
  sourceUsageForPrompt,
} from "../src/services/source-usage";
import type { IdeaCandidate } from "ai-engine";

const idea: IdeaCandidate = {
  id: "idea-1",
  title: "AI Ops Memo",
  tagline: "障害対応メモを自動整理",
  description: "SRE チーム向けに障害対応ログを分類する。",
  trendScore: 88,
  tags: ["AI", "SaaS"],
  productType: "B2B SaaS",
  targetUsers: "SRE チーム",
  coreProblem: "障害対応の知見が散らばる",
  revenuePotential: "high",
  estimatedMvpTime: "2週間",
  differentiation: "運用トレンドを根拠に提案する",
  sources: {
    rssKeywords: ["AI"],
    evidenceUrls: [
      { title: "AI Ops article", url: "https://example.com/ai-ops?utm_source=rss#section", type: "rss" },
      { title: "External article", url: "https://example.com/external", type: "web" },
    ],
  },
  generatedAt: "2026-05-14T00:00:00.000Z",
};

describe("source usage history", () => {
  it("normalizes tracking parameters and fragments", () => {
    expect(normalizeSourceUrl("https://example.com/a?utm_source=rss&x=1#top")).toBe("https://example.com/a?x=1");
  });

  it("builds usage history from RSS evidence URLs only", () => {
    const records = buildSourceUsageHistory([idea], idea.generatedAt, 10);

    expect(records).toHaveLength(1);
    expect(records[0]).toEqual(expect.objectContaining({
      title: "AI Ops article",
      url: "https://example.com/ai-ops",
      count: 1,
      ideaIds: ["idea-1"],
      ideaTitles: ["AI Ops Memo"],
    }));
  });

  it("merges repeated source usage and prepares prompt records", () => {
    const existing = buildSourceUsageHistory([idea], idea.generatedAt, 10);
    const nextIdea = {
      ...idea,
      id: "idea-2",
      title: "Incident Review Copilot",
      generatedAt: "2026-05-15T00:00:00.000Z",
    };

    const merged = mergeSourceUsageHistory(existing, [nextIdea], nextIdea.generatedAt, 10);
    const promptRecords = sourceUsageForPrompt(merged);

    expect(merged[0].count).toBe(2);
    expect(merged[0].lastUsedAt).toBe("2026-05-15T00:00:00.000Z");
    expect(promptRecords[0]).toEqual(expect.objectContaining({
      url: "https://example.com/ai-ops",
      ideaTitles: ["AI Ops Memo", "Incident Review Copilot"],
    }));
  });
});
