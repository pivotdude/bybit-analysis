import { describe, expect, it } from "bun:test";
import { resolveStartingEquity } from "./startingEquityResolver";

describe("resolveStartingEquity", () => {
  it("resolves sample at or before period start", () => {
    const result = resolveStartingEquity(
      {
        equityHistory: [
          {
            timestamp: "2026-01-01T00:00:00.000Z",
            totalEquityUsd: 1_000,
            totalExposureUsd: 0,
            grossExposureUsd: 0,
            netExposureUsd: 0
          },
          {
            timestamp: "2026-01-05T00:00:00.000Z",
            totalEquityUsd: 1_200,
            totalExposureUsd: 0,
            grossExposureUsd: 0,
            netExposureUsd: 0
          }
        ]
      },
      "2026-01-03T00:00:00.000Z"
    );

    expect(result.equityStartUsd).toBe(1_000);
    expect(result.missingStartReason).toBeUndefined();
    expect(result.missingStartReasonCode).toBeUndefined();
  });

  it("returns machine-readable unsupported reason when history is missing", () => {
    const result = resolveStartingEquity({ equityHistory: undefined }, "2026-01-03T00:00:00.000Z");

    expect(result.equityStartUsd).toBeUndefined();
    expect(result.missingStartReasonCode).toBe("equity_history_unavailable");
    expect(result.missingStartReason).toBe("equity history is unavailable");
  });
});
