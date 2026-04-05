import { describe, expect, it } from "bun:test";
import { MemoryCacheStore } from "../cache/MemoryCacheStore";
import type { ServiceRequestContext } from "../contracts/AccountDataService";
import type { BotDataService } from "../contracts/BotDataService";
import type { BybitReadonlyClient } from "./BybitClientFactory";
import { BybitExecutionService } from "./BybitExecutionService";
import { loadRealBybitFixture } from "./realFixtureLoader.test-util";

const linearContext: ServiceRequestContext = {
  category: "linear",
  sourceMode: "market",
  providerContext: { bybit: { botStrategyIds: { futuresGridBotIds: [], spotGridBotIds: [] } } },
  from: "2026-01-01T00:00:00.000Z",
  to: "2026-01-02T00:00:00.000Z",
  timeoutMs: 5_000
};

const spotContext: ServiceRequestContext = {
  ...linearContext,
  category: "spot",
  from: "2024-05-01T00:00:00.000Z",
  to: "2024-05-02T00:00:00.000Z"
};

const botService: BotDataService = {
  getBotReport: async () => ({
    source: "bybit",
    generatedAt: new Date().toISOString(),
    availability: "available",
    bots: [],
    dataCompleteness: {
      state: "complete",
      partial: false,
      warnings: [],
      issues: []
    }
  })
};

describe("BybitExecutionService real fixture contracts", () => {
  it("normalizes closed-pnl mixed-market fixture via linear market boundary", async () => {
    const closedPnlFixture = await loadRealBybitFixture<{ list?: Array<Record<string, unknown>>; nextPageCursor?: string }>(
      "closed-pnl.linear.core"
    );

    const client = {
      getClosedPnl: async () => closedPnlFixture,
      getWalletBalance: async () => ({ list: [{ totalPerpUPL: "10" }] })
    } as unknown as BybitReadonlyClient;

    const service = new BybitExecutionService(client, botService, new MemoryCacheStore());
    const report = await service.getPnlReport({ context: linearContext });

    expect(report.realizedPnlUsd).toBeCloseTo(114.7);
    expect(report.fees.tradingFeesUsd).toBeCloseTo(10.05);
    expect(report.unrealizedPnlUsd).toBe(0);
    expect(report.netPnlUsd).toBeCloseTo(104.65);
    expect(report.bySymbol.map((item) => item.symbol)).toEqual(["BTCUSDT", "ETHUSDC"]);
    expect(report.dataCompleteness.partial).toBe(true);
    expect(report.endStateStatus).toBe("unsupported");
  });

  it("keeps linear pnl contract stable for empty payload", async () => {
    const client = {
      getClosedPnl: async () => ({ list: [], nextPageCursor: undefined }),
      getWalletBalance: async () => ({ list: [{ totalPerpUPL: "0" }] })
    } as unknown as BybitReadonlyClient;

    const service = new BybitExecutionService(client, botService, new MemoryCacheStore());
    const report = await service.getPnlReport({ context: linearContext });

    expect(report.realizedPnlUsd).toBe(0);
    expect(report.fees.tradingFeesUsd).toBe(0);
    expect(report.bySymbol).toEqual([]);
    expect(report.dataCompleteness.partial).toBe(true);
  });

  it("absorbs malformed linear rows from captured payload", async () => {
    const fixture = await loadRealBybitFixture<{ list?: Array<Record<string, unknown>>; nextPageCursor?: string }>(
      "closed-pnl.linear.partial-malformed"
    );

    const client = {
      getClosedPnl: async () => fixture,
      getWalletBalance: async () => ({ list: [{ totalPerpUPL: "0" }] })
    } as unknown as BybitReadonlyClient;

    const service = new BybitExecutionService(client, botService, new MemoryCacheStore());
    const report = await service.getPnlReport({ context: linearContext });

    expect(report.realizedPnlUsd).toBeCloseTo(12.3);
    expect(report.fees.tradingFeesUsd).toBeCloseTo(0.7);
    expect(report.netPnlUsd).toBeCloseTo(11.6);
    expect(report.bySymbol.map((item) => item.symbol)).toEqual(["SOLUSDT"]);
    expect(report.dataCompleteness.issues.some((issue) => issue.code === "invalid_payload_row")).toBe(true);
  });

  it("normalizes spot execution and opening-inventory captures in mixed-market mode", async () => {
    const windowFixture = await loadRealBybitFixture<{ list?: Array<Record<string, unknown>>; nextPageCursor?: string }>(
      "execution-list.spot.window.mixed-market.core"
    );
    const openingFixture = await loadRealBybitFixture<{ list?: Array<Record<string, unknown>>; nextPageCursor?: string }>(
      "execution-list.spot.opening.core"
    );

    const client = {
      getExecutionList: async (
        _category: string,
        _from: string,
        _to: string,
        _cursor?: string,
        _timeoutMs?: number,
        symbol?: string
      ) => {
        if (!symbol) {
          return { ...windowFixture, nextPageCursor: undefined };
        }

        return {
          list: (openingFixture.list ?? []).filter((row) => String(row.symbol ?? "").toUpperCase() === symbol),
          nextPageCursor: undefined
        };
      }
    } as unknown as BybitReadonlyClient;

    const service = new BybitExecutionService(client, botService, new MemoryCacheStore());
    const report = await service.getPnlReport({ context: spotContext });

    expect(report.realizedPnlUsd).toBeCloseTo(110);
    expect(report.fees.tradingFeesUsd).toBeCloseTo(3);
    expect(report.netPnlUsd).toBeCloseTo(107);
    expect(report.bySymbol.map((item) => item.symbol)).toEqual(["ETHUSDC", "BTCUSDT"]);
    expect(report.dataCompleteness.partial).toBe(false);
  });

  it("marks spot data partial when malformed/partial fixture cannot reconstruct opening inventory", async () => {
    const windowFixture = await loadRealBybitFixture<{ list?: Array<Record<string, unknown>>; nextPageCursor?: string }>(
      "execution-list.spot.partial-malformed"
    );

    const client = {
      getExecutionList: async (
        _category: string,
        _from: string,
        _to: string,
        _cursor?: string,
        _timeoutMs?: number,
        symbol?: string
      ) => {
        if (!symbol) {
          return { ...windowFixture, nextPageCursor: undefined };
        }

        return { list: [], nextPageCursor: undefined };
      }
    } as unknown as BybitReadonlyClient;

    const service = new BybitExecutionService(client, botService, new MemoryCacheStore());
    const report = await service.getPnlReport({ context: spotContext });

    expect(report.realizedPnlUsd).toBe(0);
    expect(report.dataCompleteness.partial).toBe(true);
    expect(report.dataCompleteness.warnings.some((warning) => warning.includes("cost basis"))).toBe(true);
  });

  it("returns partial linear report when later page fails after core fixture page 1", async () => {
    const fixture = await loadRealBybitFixture<{ list?: Array<Record<string, unknown>>; nextPageCursor?: string }>(
      "closed-pnl.linear.core"
    );

    const client = {
      getClosedPnl: async (_category: string, _from: string, _to: string, cursor?: string) => {
        if (!cursor) {
          return { ...fixture, nextPageCursor: "page-2" };
        }
        throw new Error("simulated closed-pnl page-2 outage");
      },
      getWalletBalance: async () => ({ list: [{ totalPerpUPL: "0" }] })
    } as unknown as BybitReadonlyClient;

    const service = new BybitExecutionService(client, botService, new MemoryCacheStore());
    const report = await service.getPnlReport({ context: linearContext });

    expect(report.bySymbol.length).toBeGreaterThan(0);
    expect(report.dataCompleteness.partial).toBe(true);
    expect(report.dataCompleteness.issues[0]?.code).toBe("page_fetch_failed");
  });
});
