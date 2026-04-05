import { describe, expect, it } from "bun:test";
import { normalizeAccountSnapshot } from "./accountSnapshot.normalizer";

describe("normalizeAccountSnapshot", () => {
  it("does not infer equity history from wallet payload", () => {
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
      "linear"
    );

    expect(snapshot.equityHistory).toBeUndefined();
  });

  it("normalizes explicit equity history input when provided", () => {
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
        ]
      },
      "linear",
      undefined,
      {
        equityHistoryInput: [
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
      }
    );

    expect(snapshot.equityHistory?.map((item) => item.timestamp)).toEqual([
      "2026-01-10T00:00:00.000Z",
      "2026-01-20T00:00:00.000Z"
    ]);
    expect(snapshot.equityHistory?.[0]?.grossExposureUsd).toBe(1000);
    expect(snapshot.equityHistory?.[1]?.grossExposureUsd).toBe(2000);
  });

  it("uses deterministic tie-breakers for balances and equity history", () => {
    const snapshotA = normalizeAccountSnapshot(
      {
        list: [
          {
            accountType: "UNIFIED",
            totalEquity: "1500",
            totalWalletBalance: "1400",
            totalAvailableBalance: "1200",
            totalPerpUPL: "100",
            coin: [
              { coin: "USDT", walletBalance: "1", availableToWithdraw: "1", usdValue: "100" },
              { coin: "BTC", walletBalance: "0.001", availableToWithdraw: "0.001", usdValue: "100" }
            ]
          }
        ]
      },
      "linear",
      undefined,
      {
        equityHistoryInput: [
          {
            timestamp: "2026-01-10T00:00:00.000Z",
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
      }
    );
    const snapshotB = normalizeAccountSnapshot(
      {
        list: [
          {
            accountType: "UNIFIED",
            totalEquity: "1500",
            totalWalletBalance: "1400",
            totalAvailableBalance: "1200",
            totalPerpUPL: "100",
            coin: [
              { coin: "BTC", walletBalance: "0.001", availableToWithdraw: "0.001", usdValue: "100" },
              { coin: "USDT", walletBalance: "1", availableToWithdraw: "1", usdValue: "100" }
            ]
          }
        ]
      },
      "linear",
      undefined,
      {
        equityHistoryInput: [
          {
            timestamp: "2026-01-10T00:00:00.000Z",
            totalEquityUsd: "1300",
            grossExposureUsd: "1000",
            netExposureUsd: "400"
          },
          {
            timestamp: "2026-01-10T00:00:00.000Z",
            totalEquityUsd: "1400",
            grossExposureUsd: "2000",
            netExposureUsd: "800"
          }
        ]
      }
    );

    expect(snapshotA.balances.map((item) => item.asset)).toEqual(["BTC", "USDT"]);
    expect(snapshotB.balances.map((item) => item.asset)).toEqual(["BTC", "USDT"]);
    expect(snapshotA.equityHistory?.map((item) => item.totalEquityUsd)).toEqual([1300, 1400]);
    expect(snapshotB.equityHistory?.map((item) => item.totalEquityUsd)).toEqual([1300, 1400]);
  });

  it("surfaces malformed wallet fields instead of normalizing them silently", () => {
    const snapshot = normalizeAccountSnapshot(
      {
        list: [
          {
            accountType: "UNIFIED",
            totalEquity: "nan",
            totalWalletBalance: "broken",
            totalAvailableBalance: null,
            totalPerpUPL: "oops",
            coin: [
              { coin: 77, walletBalance: "bad", availableToWithdraw: "1", usdValue: "50.4" },
              { coin: "USDT", walletBalance: null, availableToWithdraw: "10", usdValue: "10" }
            ]
          }
        ]
      },
      "linear"
    );

    expect(snapshot.totalEquityUsd).toBe(0);
    expect(snapshot.walletBalanceUsd).toBe(0);
    expect(snapshot.availableBalanceUsd).toBe(0);
    expect(snapshot.balances).toEqual([]);
    expect(snapshot.dataCompleteness.state).toBe("partial_critical");
    expect(snapshot.dataCompleteness.issues.some((issue) => issue.code === "invalid_payload_field")).toBe(true);
    expect(snapshot.dataCompleteness.issues.some((issue) => issue.code === "invalid_payload_row")).toBe(true);
  });
});
