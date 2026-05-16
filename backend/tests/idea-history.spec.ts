import { describe, expect, it } from "vitest";
import { dedupeWithinBatch } from "../src/services/idea-history";
import type { IdeaCandidate } from "ai-engine";

const baseIdea: IdeaCandidate = {
  id: "idea-1",
  title: "AI Ops Memo",
  tagline: "障害対応メモを自動整理",
  description: "SRE チーム向けに障害対応ログを分類し、再発防止策を提案する。",
  tags: ["AI", "SaaS", "dev-tools"],
  productType: "B2B SaaS",
  targetUsers: "小規模な SRE チーム",
  coreProblem: "障害対応の知見が散らばる",
  differentiation: "運用トレンドを根拠に提案する",
  sources: { rssKeywords: ["AI", "SRE"], evidenceUrls: [] },
  generatedAt: "2026-05-14T00:00:00.000Z",
};

function idea(overrides: Partial<IdeaCandidate>): IdeaCandidate {
  return {
    ...baseIdea,
    ...overrides,
    sources: overrides.sources ?? baseIdea.sources,
  };
}

describe("dedupeWithinBatch", () => {
  it("keeps all unique ideas", () => {
    const fresh = idea({
      id: "idea-2",
      title: "Browser QA Recorder",
      tagline: "ブラウザ操作からQA手順を作る",
      description: "ユーザー操作を記録して、再現手順とチェックリストを自動生成する。",
      coreProblem: "小規模チームの検証手順が属人化する",
      targetUsers: "Webアプリを運用する個人開発者",
      productType: "ブラウザ拡張機能",
      tags: ["QA", "browser-extension"],
      differentiation: "実際の操作ログから検証観点を抽出する",
    });

    const result = dedupeWithinBatch([baseIdea, fresh]);

    expect(result.map((candidate) => candidate.id)).toEqual(["idea-1", "idea-2"]);
  });

  it("drops near-duplicate ideas within a batch", () => {
    const duplicate = idea({
      id: "idea-duplicate",
      title: "AI Incident Memo",
      tagline: "障害対応ログをAIで整理",
      coreProblem: "障害対応の知見が散らばって再発防止に活かせない",
      targetUsers: "小規模なSREチーム",
    });

    const result = dedupeWithinBatch([baseIdea, duplicate]);

    expect(result.map((candidate) => candidate.id)).toEqual(["idea-1"]);
  });

  it("returns empty array for empty input", () => {
    const result = dedupeWithinBatch([]);
    expect(result).toEqual([]);
  });

  it("keeps first occurrence when multiple duplicates exist", () => {
    const dup1 = idea({
      id: "dup-1",
      title: "AI Incident Memo",
      tagline: "障害対応ログをAIで整理",
      coreProblem: "障害対応の知見が散らばって再発防止に活かせない",
      targetUsers: "小規模なSREチーム",
    });
    const dup2 = idea({
      id: "dup-2",
      title: "AI Incident Memo",
      tagline: "障害対応ログをAIで整理",
      coreProblem: "障害対応の知見が散らばって再発防止に活かせない",
      targetUsers: "小規模なSREチーム",
    });

    const result = dedupeWithinBatch([baseIdea, dup1, dup2]);
    expect(result.map((candidate) => candidate.id)).toEqual(["idea-1"]);
  });
});
