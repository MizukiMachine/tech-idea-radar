import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import App from "../App";

const mockFetch = vi.fn();

beforeEach(() => {
  mockFetch.mockReset();
  mockFetch.mockResolvedValue({
    ok: true,
    json: async () => ({
      status: "cached",
      candidates: [],
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
    expect(screen.getByText("フィルター")).toBeTruthy();
    expect(screen.getByText("得意技術")).toBeTruthy();
    await waitFor(() => expect(mockFetch).toHaveBeenCalled());
  });

  it("renders search input", async () => {
    render(<App />);
    const input = screen.getByPlaceholderText("アイデアを検索（例: AI ツール、SaaS、副業...）");
    expect(input).toBeTruthy();
    await waitFor(() => expect(mockFetch).toHaveBeenCalled());
  });

  it("renders right panel cards", async () => {
    render(<App />);
    expect(screen.getByText(/高収益ポテンシャル/)).toBeTruthy();
    expect(screen.getByText(/急上昇トレンド/)).toBeTruthy();
    expect(screen.getByText("選択中のアイデア")).toBeTruthy();
    await waitFor(() => expect(mockFetch).toHaveBeenCalled());
  });
});
