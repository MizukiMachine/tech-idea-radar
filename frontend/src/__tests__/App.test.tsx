import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import App from "../App";

const mockFetch = vi.fn();
const idea = {
  id: "idea-1",
  title: "AI Ops Memo",
  tagline: "障害対応メモを自動整理",
  description: "SRE チーム向けに障害対応ログを分類します。",
  trendScore: 82,
  tags: ["AI", "SaaS"],
  productType: "B2B SaaS",
  targetUsers: "小規模な SRE チーム",
  coreProblem: "障害対応の知見が散らばる",
  revenuePotential: "high",
  estimatedMvpTime: "2週間",
  differentiation: "運用トレンドを根拠に提案する",
  sources: { rssKeywords: ["AI"], demandSignals: 1, evidenceUrls: [] },
  generatedAt: new Date().toISOString(),
};

beforeEach(() => {
  mockFetch.mockReset();
  mockFetch.mockResolvedValue({
    ok: true,
    json: async () => ({
      status: "cached",
      candidates: [idea],
      generatedAt: new Date().toISOString(),
      sourceSummary: { rssItemCount: 0, xSignalCount: 0, usedLLMFallback: false },
    }),
  });
  vi.stubGlobal("fetch", mockFetch);
});

describe("App", () => {
  it("renders hero title", async () => {
    render(<App />);
    expect(screen.getByText("作るものが決まっていないエンジニアへ")).toBeTruthy();
    await waitFor(() => expect(mockFetch).toHaveBeenCalled());
  });

  it("renders sidebar filter section", async () => {
    render(<App />);
    await waitFor(() => expect(mockFetch).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByText("フィルター")).toBeTruthy());
    expect(screen.getByText("得意技術")).toBeTruthy();
  });

  it("renders search input", async () => {
    render(<App />);
    const input = screen.getByPlaceholderText("キーワードで絞り込み（例: AI ツール、SaaS、副業）");
    expect(input).toBeTruthy();
    await waitFor(() => expect(mockFetch).toHaveBeenCalled());
  });

  it("renders right panel cards", async () => {
    render(<App />);
    await waitFor(() => expect(mockFetch).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByText(/高収益ポテンシャル/)).toBeTruthy());
    expect(screen.getByText(/急上昇トレンド/)).toBeTruthy();
    expect(screen.getByText("選択中のアイデア")).toBeTruthy();
  });
});
