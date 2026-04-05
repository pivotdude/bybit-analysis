import { describe, expect, it } from "bun:test";
import { MemoryCacheStore } from "../cache/MemoryCacheStore";
import type { ServiceRequestContext } from "../contracts/AccountDataService";
import type { PositionDataService } from "../contracts/PositionDataService";
import type { BybitReadonlyClient } from "./BybitClientFactory";
import { BybitAccountService } from "./BybitAccountService";
import { loadRealBybitFixture } from "./realFixtureLoader.test-util";

const context: ServiceRequestContext = {
  category: "linear",
  sourceMode: "market",
  providerContext: { bybit: { botStrategyIds: { futuresGridBotIds: [], spotGridBotIds: [] } } },
  from: "2026-01-01T00:00:00.000Z",
  to: "2026-01-31T00:00:00.000Z",
  timeoutMs: 5_000
};

const completeDataCompleteness = {
  state: "complete" as const,
  partial: false,
  warnings: [],
  issues: []
};

describe("BybitAccountService real fixture contracts", () => {
  it("normalizes wallet-balance core capture into account snapshot contract", async () => {
    const walletFixture = await loadRealBybitFixture<Record<string, unknown>>("wallet-balance.unified.linear.core");

    const client = {
      getWalletBalance: async () => walletFixture
    } as unknown as BybitReadonlyClient;

    const positionsService: PositionDataService = {
      getOpenPositions: async () => ({
        source: "bybit",
        exchange: "bybit",
        positions: [],
        dataCompleteness: completeDataCompleteness
      })
    };

    const service = new BybitAccountService(client, positionsService, new MemoryCacheStore());
    const snapshot = await service.getAccountSnapshot(context);

    expect(snapshot.totalEquityUsd).toBeCloseTo(18452.6617);
    expect(snapshot.walletBalanceUsd).toBeCloseTo(17391.3311);
    expect(snapshot.unrealizedPnlUsd).toBeCloseTo(1061.3306);
    expect(snapshot.balances.map((item) => item.asset)).toEqual(["USDT", "BTC", "USDC"]);
    expect(snapshot.balances[0]?.usdValue).toBeCloseTo(9610.2281);
  });

  it("keeps empty wallet payloads schema-stable", async () => {
    const walletFixture = await loadRealBybitFixture<Record<string, unknown>>("wallet-balance.unified.linear.empty");

    const client = {
      getWalletBalance: async () => walletFixture
    } as unknown as BybitReadonlyClient;

    const positionsService: PositionDataService = {
      getOpenPositions: async () => ({
        source: "bybit",
        exchange: "bybit",
        positions: [],
        dataCompleteness: completeDataCompleteness
      })
    };

    const service = new BybitAccountService(client, positionsService, new MemoryCacheStore());
    const snapshot = await service.getAccountSnapshot(context);

    expect(snapshot.accountId).toBeUndefined();
    expect(snapshot.totalEquityUsd).toBe(0);
    expect(snapshot.walletBalanceUsd).toBe(0);
    expect(snapshot.availableBalanceUsd).toBe(0);
    expect(snapshot.balances).toEqual([]);
  });

  it("tolerates malformed wallet fields without breaking account contract", async () => {
    const walletFixture = await loadRealBybitFixture<Record<string, unknown>>("wallet-balance.unified.linear.malformed");

    const positionsService: PositionDataService = {
      getOpenPositions: async () => ({
        source: "bybit",
        exchange: "bybit",
        positions: [],
        dataCompleteness: {
          state: "degraded",
          partial: true,
          warnings: ["positions degraded"],
          issues: [
            {
              code: "page_fetch_failed",
              scope: "positions",
              severity: "warning",
              criticality: "optional",
              message: "positions degraded"
            }
          ]
        }
      })
    };

    const client = {
      getWalletBalance: async () => walletFixture
    } as unknown as BybitReadonlyClient;

    const service = new BybitAccountService(client, positionsService, new MemoryCacheStore());
    const snapshot = await service.getAccountSnapshot(context);

    expect(snapshot.totalEquityUsd).toBe(0);
    expect(snapshot.walletBalanceUsd).toBe(0);
    expect(snapshot.availableBalanceUsd).toBe(0);
    expect(snapshot.balances.map((item) => item.asset)).toEqual(["77", "USDT"]);
    expect(snapshot.balances[0]?.usdValue).toBeCloseTo(50.4);
    expect(snapshot.dataCompleteness.partial).toBe(true);
  });
});
