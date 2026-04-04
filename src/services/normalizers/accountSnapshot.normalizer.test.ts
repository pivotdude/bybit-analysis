import { describe, expect, it } from "bun:test";
import { normalizeAccountSnapshot } from "./accountSnapshot.normalizer";

describe("normalizeAccountSnapshot", () => {
  it("propagates normalized equity history from payload", () => {
    const snapshot = normalizeAccountSnapshot(
      {
        list: [
          {
            accountType: "UNIFIED",
            totalEquity: "1500",
            totalWalletBalance: "1400",
            totalAvailableBalance: "1200",
            totalPerpUPL: "100"
          }
        ],
        equityHistory: [
          {
            timestamp: "2026-01-20T00:00:00.000Z",
            totalEquityUsd: "1400",
            grossExposureUsd: "2000",
            netExposureUsd: "800"
          },
          {
            timestamp: "2026-01-10T00:00:00.000Z",
            totalEquityUsd: "1300",
            grossExposureUsd: "1000",
            netExposureUsd: "400"
          }
        ]
      },
      "linear",
      []
    );

    expect(snapshot.equityHistory?.map((item) => item.timestamp)).toEqual([
      "2026-01-10T00:00:00.000Z",
      "2026-01-20T00:00:00.000Z"
    ]);
    expect(snapshot.equityHistory?.[0]?.grossExposureUsd).toBe(1000);
    expect(snapshot.equityHistory?.[1]?.grossExposureUsd).toBe(2000);
  });
});
