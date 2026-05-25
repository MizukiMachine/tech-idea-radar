import { describe, expect, it } from "vitest";
import { normalizeBatchTimeJST, scheduledBatchTimeJST } from "../utils/batch-time";

describe("batch time formatting helpers", () => {
  it("keeps a valid scheduled JST batch slot", () => {
    const generatedAt = "2026-05-24T10:51:08.838Z";
    const batchTime = "2026-05-24T00:00:00+09:00";

    expect(normalizeBatchTimeJST(batchTime, generatedAt)).toBe(batchTime);
  });

  it("replaces stale fixed batch times with the generated JST schedule slot", () => {
    const generatedAt = "2026-05-24T10:51:08.838Z";

    expect(normalizeBatchTimeJST("2026-05-22T00:00:00+09:00", generatedAt))
      .toBe(scheduledBatchTimeJST(generatedAt));
  });

  it("replaces non-scheduled hours with the generated JST schedule slot", () => {
    const generatedAt = "2026-05-24T04:41:11.695Z";

    expect(normalizeBatchTimeJST("2026-05-24T13:00:00+09:00", generatedAt))
      .toBe("2026-05-24T00:00:00+09:00");
  });

  it("keeps the previous scheduled slot when generation crosses a batch boundary", () => {
    const generatedAt = "2026-05-24T15:35:00.000Z";

    expect(normalizeBatchTimeJST("2026-05-24T00:00:00+09:00", generatedAt))
      .toBe("2026-05-24T00:00:00+09:00");
  });
});
