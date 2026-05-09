import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "../App";

const mockFetch = vi.fn();

beforeEach(() => {
  mockFetch.mockReset();
  vi.stubGlobal("fetch", mockFetch);
});

describe("App", () => {
  it("renders workflow input view by default", () => {
    render(<App />);
    expect(screen.getByText("Builder Agent Chain")).toBeTruthy();
    expect(screen.getByText("Workflow Input (JSON)")).toBeTruthy();
    expect(screen.getByText("Run Workflow")).toBeTruthy();
  });

  it("shows JSON parse error on invalid input", async () => {
    const user = userEvent.setup();
    render(<App />);

    const textarea = screen.getByRole("textbox");
    await user.clear(textarea);
    await user.type(textarea, "not valid json");
    await user.click(screen.getByText("Run Workflow"));

    expect(screen.getByText(/JSON parse error/)).toBeTruthy();
  });
});
