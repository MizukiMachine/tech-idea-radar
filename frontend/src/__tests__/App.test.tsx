import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import App from "../App";

const mockFetch = vi.fn();

beforeEach(() => {
  mockFetch.mockReset();
  vi.stubGlobal("fetch", mockFetch);
});

describe("App", () => {
  it("renders hero title", () => {
    render(<App />);
    expect(screen.getByText("作るものが決まっていないエンジニアへ")).toBeTruthy();
  });

  it("renders sidebar filter section", () => {
    render(<App />);
    expect(screen.getByText("フィルター")).toBeTruthy();
    expect(screen.getByText("得意技術")).toBeTruthy();
  });

  it("renders search input", () => {
    render(<App />);
    const input = screen.getByPlaceholderText("アイデアを検索（例: AI ツール、SaaS、副業...）");
    expect(input).toBeTruthy();
  });

  it("renders right panel cards", () => {
    render(<App />);
    expect(screen.getByText("サブスク管理SaaS")).toBeTruthy();
    expect(screen.getByText("AI画像生成APIサービス")).toBeTruthy();
  });
});
