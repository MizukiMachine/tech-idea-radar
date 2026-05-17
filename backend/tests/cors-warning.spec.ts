import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";

const originalNodeEnv = process.env.NODE_ENV;
const originalCorsOrigin = process.env.CORS_ORIGIN;

function restoreEnv() {
  if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = originalNodeEnv;

  if (originalCorsOrigin === undefined) delete process.env.CORS_ORIGIN;
  else process.env.CORS_ORIGIN = originalCorsOrigin;
}

describe("CORS production warning", () => {
  afterEach(() => {
    restoreEnv();
    vi.resetModules();
  });

  it("adds the warning header to routed responses when CORS_ORIGIN is missing", async () => {
    vi.resetModules();
    process.env.NODE_ENV = "production";
    delete process.env.CORS_ORIGIN;

    const { default: app } = await import("../src/app");
    const response = await request(app).get("/health");

    expect(response.status).toBe(200);
    expect(response.headers["x-cors-warning"]).toContain("CORS_ORIGIN is not configured");
  });
});
