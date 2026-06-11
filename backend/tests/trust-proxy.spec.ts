import { afterEach, describe, expect, it, vi } from "vitest";

const originalNodeEnv = process.env.NODE_ENV;
const originalTrustProxy = process.env.TRUST_PROXY;

function restoreEnv() {
  if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = originalNodeEnv;

  if (originalTrustProxy === undefined) delete process.env.TRUST_PROXY;
  else process.env.TRUST_PROXY = originalTrustProxy;
}

describe("Express trust proxy", () => {
  afterEach(() => {
    restoreEnv();
    vi.resetModules();
  });

  it("trusts one reverse proxy hop in production by default", async () => {
    vi.resetModules();
    process.env.NODE_ENV = "production";
    delete process.env.TRUST_PROXY;

    const { default: app } = await import("../src/app");

    expect(app.get("trust proxy")).toBe(1);
  });

  it("allows direct deployments to disable trust proxy explicitly", async () => {
    vi.resetModules();
    process.env.NODE_ENV = "production";
    process.env.TRUST_PROXY = "false";

    const { default: app } = await import("../src/app");

    expect(app.get("trust proxy")).toBe(false);
  });

  it("treats TRUST_PROXY=true as the standard one-hop proxy setting", async () => {
    vi.resetModules();
    process.env.NODE_ENV = "production";
    process.env.TRUST_PROXY = "true";

    const { default: app } = await import("../src/app");

    expect(app.get("trust proxy")).toBe(1);
  });
});
