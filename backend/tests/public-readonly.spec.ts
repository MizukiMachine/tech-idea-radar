import { afterEach, describe, expect, it, vi } from "vitest";

const originalPublicReadonlyMode = process.env.PUBLIC_READONLY_MODE;
const originalAdminApiToken = process.env.ADMIN_API_TOKEN;

function restoreEnv() {
  if (originalPublicReadonlyMode === undefined) delete process.env.PUBLIC_READONLY_MODE;
  else process.env.PUBLIC_READONLY_MODE = originalPublicReadonlyMode;

  if (originalAdminApiToken === undefined) delete process.env.ADMIN_API_TOKEN;
  else process.env.ADMIN_API_TOKEN = originalAdminApiToken;
}

async function postIdeasFilter(body: unknown = { query: "AI" }): Promise<{ status: number; body: unknown }> {
  const { default: router } = await import("../src/routes/ai");
  const route = router.stack.find((layer) => layer.route?.path === "/ideas/filter");
  const handler = route?.route?.stack[0]?.handle;
  let statusCode = 200;
  let responseBody: unknown;

  const req = {
    body,
    get: () => undefined,
  };
  const res = {
    status(code: number) {
      statusCode = code;
      return this;
    },
    json(payload: unknown) {
      responseBody = payload;
      return this;
    },
  };

  await handler?.(req as never, res as never, (() => undefined) as never);
  return { status: statusCode, body: responseBody };
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

    const response = await postIdeasFilter();

    expect(response.status).toBe(403);
  });

  it("requires the configured admin token before semantic filtering in public mode", async () => {
    vi.resetModules();
    process.env.PUBLIC_READONLY_MODE = "true";
    process.env.ADMIN_API_TOKEN = "secret";

    const response = await postIdeasFilter();

    expect(response.status).toBe(401);
  });
});
