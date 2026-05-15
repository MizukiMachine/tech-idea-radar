import { describe, expect, it } from "vitest";
import { mergeIdeaHistory } from "../src/services/idea-history";
import type { IdeaCandidate } from "ai-engine";

const baseIdea: IdeaCandidate = {
  id: "idea-1",
  title: "AI Ops Memo",
  tagline: "障害対応メモを自動整理",
  description: "SRE チーム向けに障害対応ログを分類し、再発防止策を提案する。",
  trendScore: 88,
  tags: ["AI", "SaaS", "dev-tools"],
  productType: "B2B SaaS",
  targetUsers: "小規模な SRE チーム",
  coreProblem: "障害対応の知見が散らばる",
  revenuePotential: "high",
  estimatedMvpTime: "2週間",
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

describe("mergeIdeaHistory", () => {
  it("prepends new ideas and keeps existing history", () => {
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

    const result = mergeIdeaHistory([baseIdea], [fresh], { maxCandidates: 10 });

    expect(result.addedCandidates.map((candidate) => candidate.id)).toEqual(["idea-2"]);
    expect(result.duplicateCandidates).toHaveLength(0);
    expect(result.candidates.map((candidate) => candidate.id)).toEqual(["idea-2", "idea-1"]);
  });

  it("drops near-duplicate ideas before storing them", () => {
    const duplicate = idea({
      id: "idea-duplicate",
      title: "AI Incident Memo",
      tagline: "障害対応ログをAIで整理",
      coreProblem: "障害対応の知見が散らばって再発防止に活かせない",
      targetUsers: "小規模なSREチーム",
    });

    const result = mergeIdeaHistory([baseIdea], [duplicate], { maxCandidates: 10 });

    expect(result.addedCandidates).toHaveLength(0);
    expect(result.duplicateCandidates.map((candidate) => candidate.id)).toEqual(["idea-duplicate"]);
    expect(result.candidates.map((candidate) => candidate.id)).toEqual(["idea-1"]);
  });

  it("caps the stored history size", () => {
    const fresh = idea({
      id: "idea-2",
      title: "Release Note Diff",
      tagline: "依存ライブラリの変更点を要約",
      description: "package lock の差分からアップデート影響と確認項目をまとめる。",
      coreProblem: "ライブラリアップデート時の影響確認に時間がかかる",
      targetUsers: "個人開発者",
      tags: ["dev-tools", "release"],
      differentiation: "依存関係の差分とリリースノートをまとめて扱う",
    });

    const result = mergeIdeaHistory([baseIdea], [fresh], { maxCandidates: 1 });

    expect(result.candidates.map((candidate) => candidate.id)).toEqual(["idea-2"]);
  });
});
