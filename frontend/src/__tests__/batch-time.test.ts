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

  it("keeps the noon JST batch slot", () => {
    const generatedAt = "2026-05-24T10:51:08.838Z";
    const batchTime = "2026-05-24T12:00:00+09:00";

    expect(normalizeBatchTimeJST(batchTime, generatedAt)).toBe(batchTime);
  });

  it("replaces non-scheduled hours with the generated JST schedule slot", () => {
    // generatedAt is JST 13:41 → current slot is the 12:00 JST slot.
    const generatedAt = "2026-05-24T04:41:11.695Z";

    expect(normalizeBatchTimeJST("2026-05-24T13:00:00+09:00", generatedAt))
      .toBe("2026-05-24T12:00:00+09:00");
  });

  it("keeps the previous scheduled slot when generation crosses a batch boundary", () => {
    // generatedAt is JST 12:05 (current slot 12:00); the batch was tagged with
    // the immediately previous 00:00 slot (one 12h slot behind) and is kept.
    const generatedAt = "2026-05-24T03:05:00.000Z";

    expect(normalizeBatchTimeJST("2026-05-24T00:00:00+09:00", generatedAt))
      .toBe("2026-05-24T00:00:00+09:00");
  });
});
