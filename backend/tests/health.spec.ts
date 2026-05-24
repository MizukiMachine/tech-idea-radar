import { describe, it, expect } from "vitest";
import healthRouter from "../src/routes/health";

describe("GET /health", () => {
  it("responds with service status", () => {
    const route = healthRouter.stack.find((layer) => layer.route?.path === "/");
    const handler = route?.route?.stack[0]?.handle;
    let statusCode = 0;
    let body: unknown;

    const res = {
      status(code: number) {
        statusCode = code;
        return this;
      },
      json(payload: unknown) {
        body = payload;
        return this;
      },
    };

    handler?.({} as never, res as never, (() => undefined) as never);

    expect(statusCode).toBe(200);
    expect(body).toEqual(
      expect.objectContaining({
        status: "ok",
        service: "builder-agent-chain-backend",
        cache: expect.objectContaining({
          hasData: expect.any(Boolean),
          batchCount: expect.any(Number),
          persistentCacheEnabled: expect.any(Boolean),
          cacheDisabled: expect.any(Boolean),
        }),
        config: expect.objectContaining({
          corsConfigured: expect.any(Boolean),
          cacheDisabled: expect.any(Boolean),
          requireDevStackHeader: expect.any(Boolean),
        }),
      }),
    );
  });
});
