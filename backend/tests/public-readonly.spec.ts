import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";

const originalPublicReadonlyMode = process.env.PUBLIC_READONLY_MODE;
const originalAdminApiToken = process.env.ADMIN_API_TOKEN;

function restoreEnv() {
  if (originalPublicReadonlyMode === undefined) delete process.env.PUBLIC_READONLY_MODE;
  else process.env.PUBLIC_READONLY_MODE = originalPublicReadonlyMode;

  if (originalAdminApiToken === undefined) delete process.env.ADMIN_API_TOKEN;
  else process.env.ADMIN_API_TOKEN = originalAdminApiToken;
}

describe("public read-only API boundaries", () => {
  afterEach(() => {
    restoreEnv();
    vi.resetModules();
  });

  it("blocks semantic filtering without an admin token in public mode", async () => {
    vi.resetModules();
    process.env.PUBLIC_READONLY_MODE = "true";
    delete process.env.ADMIN_API_TOKEN;

    const { default: app } = await import("../src/app");
    const response = await request(app)
      .post("/api/ai/ideas/filter")
      .send({ query: "AI" });

    expect(response.status).toBe(403);
  });

  it("requires the configured admin token before semantic filtering in public mode", async () => {
    vi.resetModules();
    process.env.PUBLIC_READONLY_MODE = "true";
    process.env.ADMIN_API_TOKEN = "secret";

    const { default: app } = await import("../src/app");
    const response = await request(app)
      .post("/api/ai/ideas/filter")
      .send({ query: "AI" });

    expect(response.status).toBe(401);
  });
});
