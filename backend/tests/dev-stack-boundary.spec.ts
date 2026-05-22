import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";

const originalRequireHeader = process.env.BAC_REQUIRE_DEV_STACK_HEADER;
const originalDevStackId = process.env.BAC_DEV_STACK_ID;

function restoreEnv() {
  if (originalRequireHeader === undefined) delete process.env.BAC_REQUIRE_DEV_STACK_HEADER;
  else process.env.BAC_REQUIRE_DEV_STACK_HEADER = originalRequireHeader;

  if (originalDevStackId === undefined) delete process.env.BAC_DEV_STACK_ID;
  else process.env.BAC_DEV_STACK_ID = originalDevStackId;
}

describe("local dev-stack API boundary", () => {
  afterEach(() => {
    restoreEnv();
    vi.resetModules();
  });

  it("rejects API requests that bypass the matching Vite dev proxy", async () => {
    vi.resetModules();
    process.env.BAC_REQUIRE_DEV_STACK_HEADER = "true";
    process.env.BAC_DEV_STACK_ID = "dev-current";

    const { default: app } = await import("../src/app");
    const response = await request(app).get("/api/_boundary_probe");

    expect(response.status).toBe(409);
    expect(response.body).toEqual(expect.objectContaining({
      error: "DEV_STACK_MISMATCH",
      expectedDevStackId: "dev-current",
      receivedDevStackId: null,
    }));
  });

  it("allows API requests from the matching Vite dev proxy", async () => {
    vi.resetModules();
    process.env.BAC_REQUIRE_DEV_STACK_HEADER = "true";
    process.env.BAC_DEV_STACK_ID = "dev-current";

    const { default: app } = await import("../src/app");
    const response = await request(app)
      .get("/api/_boundary_probe")
      .set("X-BAC-Dev-Stack-Id", "dev-current");

    expect(response.status).toBe(404);
  });
});
