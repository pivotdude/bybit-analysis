import { describe, expect, it } from "bun:test";
import { MemoryCacheStore } from "../cache/MemoryCacheStore";
import type { ServiceRequestContext } from "../contracts/AccountDataService";
import type { BybitReadonlyClient } from "./BybitClientFactory";
import { BybitPositionService } from "./BybitPositionService";
import { loadRealBybitFixture } from "./realFixtureLoader.test-util";

const context: ServiceRequestContext = {
  category: "linear",
  sourceMode: "market",
  providerContext: { bybit: { botStrategyIds: { futuresGridBotIds: [], spotGridBotIds: [] } } },
  from: "2026-01-01T00:00:00.000Z",
  to: "2026-01-31T00:00:00.000Z",
  timeoutMs: 5_000
};

describe("BybitPositionService real fixture contracts", () => {
  it("normalizes mixed-market position-list capture", async () => {
    const fixture = await loadRealBybitFixture<{ list?: Array<Record<string, unknown>>; nextPageCursor?: string }>(
      "position-list.linear.mixed-market.core"
    );

    const client = {
      getPositions: async () => fixture
    } as unknown as BybitReadonlyClient;

    const service = new BybitPositionService(client, new MemoryCacheStore());
    const result = await service.getOpenPositions(context);

    expect(result.positions).toHaveLength(2);
    expect(result.positions.map((position) => position.symbol).sort()).toEqual(["BTCUSDT", "ETHUSDC"]);
    expect(result.positions.find((position) => position.symbol === "ETHUSDC")?.quoteAsset).toBe("USDC");
    expect(result.positions.find((position) => position.symbol === "ETHUSDC")?.side).toBe("short");
    expect(result.positions.find((position) => position.symbol === "ETHUSDC")?.marginMode).toBe("isolated");
    expect(result.dataCompleteness.partial).toBe(false);
  });

  it("keeps empty position payloads contract-safe", async () => {
    const client = {
      getPositions: async () => ({ list: [], nextPageCursor: undefined })
    } as unknown as BybitReadonlyClient;

    const service = new BybitPositionService(client, new MemoryCacheStore());
    const result = await service.getOpenPositions(context);

    expect(result.positions).toEqual([]);
    expect(result.dataCompleteness.partial).toBe(false);
  });

  it("absorbs malformed rows and preserves normalized shape", async () => {
    const malformedFixture = await loadRealBybitFixture<{ list?: Array<Record<string, unknown>>; nextPageCursor?: string }>(
      "position-list.linear.partial-malformed"
    );

    const client = {
      getPositions: async () => malformedFixture
    } as unknown as BybitReadonlyClient;

    const service = new BybitPositionService(client, new MemoryCacheStore());
    const result = await service.getOpenPositions(context);

    expect(result.positions).toHaveLength(1);
    expect(result.positions[0]?.symbol).toBe("UNKNOWN");
    expect(result.positions[0]?.side).toBe("short");
    expect(result.positions[0]?.quantity).toBe(2);
    expect(result.positions[0]?.leverage).toBe(1);
    expect(result.positions[0]?.valuationPrice).toBe(0.9);
  });

  it("returns partial position data when a later page fails after fixture-backed page 1", async () => {
    const fixture = await loadRealBybitFixture<{ list?: Array<Record<string, unknown>>; nextPageCursor?: string }>(
      "position-list.linear.mixed-market.core"
    );

    const client = {
      getPositions: async (_category: string, cursor?: string) => {
        if (!cursor) {
          return { ...fixture, nextPageCursor: "cursor-2" };
        }
        throw new Error("simulated page-2 outage");
      }
    } as unknown as BybitReadonlyClient;

    const service = new BybitPositionService(client, new MemoryCacheStore());
    const result = await service.getOpenPositions(context);

    expect(result.positions).toHaveLength(2);
    expect(result.dataCompleteness.partial).toBe(true);
    expect(result.dataCompleteness.issues[0]?.code).toBe("page_fetch_failed");
  });
});
