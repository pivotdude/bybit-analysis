import { describe, expect, it } from "bun:test";
import { MemoryCacheStore } from "../cache/MemoryCacheStore";
import type { ServiceRequestContext } from "../contracts/AccountDataService";
import { RequiredBotDataUnavailableError } from "../contracts/BotDataService";
import { BybitPositionService } from "./BybitPositionService";
import type { BybitReadonlyClient } from "./BybitClientFactory";
import { PaginationLimitReachedError } from "./pagination";

const context: ServiceRequestContext = {
  category: "linear",
  sourceMode: "market",
  providerContext: { bybit: { botStrategyIds: { futuresGridBotIds: [], spotGridBotIds: [] } } },
  from: "2026-01-01T00:00:00.000Z",
  to: "2026-01-31T00:00:00.000Z",
  timeoutMs: 5_000
};

function createClient(totalPages: number): { client: BybitReadonlyClient; getCalls: () => number } {
  let calls = 0;

  const client = {
    getPositions: async (_category: string, cursor?: string) => {
      calls += 1;
      const index = cursor ? Number(cursor.slice(1)) : 0;
      const nextPageCursor = index + 1 < totalPages ? `c${index + 1}` : undefined;

      return {
        list: [
          {
            symbol: `BTCUSDT_${index}`,
            size: "1",
            side: "Buy",
            markPrice: "100",
            avgPrice: "90",
            positionValue: "100",
            leverage: "2",
            unrealisedPnl: "5"
          }
        ],
        nextPageCursor
      };
    }
  } as unknown as BybitReadonlyClient;

  return {
    client,
    getCalls: () => calls
  };
}

const botService = {
  getBotReport: async () => ({
    source: "bybit" as const,
    generatedAt: new Date().toISOString(),
    availability: "available" as const,
    bots: [],
    dataCompleteness: {
      state: "complete" as const,
      partial: false,
      warnings: [],
      issues: []
    }
  })
};

describe("BybitPositionService pagination", () => {
  it("reads all pages when no safety limit is configured", async () => {
    const { client, getCalls } = createClient(12);
    const service = new BybitPositionService(client, botService, new MemoryCacheStore());

    const result = await service.getOpenPositions(context);

    expect(result.positions).toHaveLength(12);
    expect(result.dataCompleteness.partial).toBe(false);
    expect(getCalls()).toBe(12);
  });

  it("throws when safety limit is reached and nextPageCursor is still present", async () => {
    const { client } = createClient(3);
    const service = new BybitPositionService(client, botService, new MemoryCacheStore(), { maxPages: 2 });

    try {
      await service.getOpenPositions(context);
      throw new Error("expected pagination limit error");
    } catch (error) {
      expect(error).toBeInstanceOf(PaginationLimitReachedError);
      const paginationError = error as PaginationLimitReachedError;
      expect(paginationError.context.endpoint).toBe("positions");
      expect(paginationError.context.pageLimit).toBe(2);
      expect(paginationError.context.pagesFetched).toBe(2);
    }
  });

  it("returns partial result when safety limit is reached in partial mode", async () => {
    const { client } = createClient(3);
    const service = new BybitPositionService(client, botService, new MemoryCacheStore(), {
      maxPages: 2,
      limitMode: "partial"
    });

    const result = await service.getOpenPositions(context);

    expect(result.positions).toHaveLength(2);
    expect(result.dataCompleteness.partial).toBe(true);
    expect(result.dataCompleteness.warnings).toHaveLength(1);
    expect(result.dataCompleteness.warnings[0]).toContain("positions");
  });

  it("fails fast when first positions page cannot be fetched", async () => {
    let calls = 0;
    const client = {
      getPositions: async () => {
        calls += 1;
        throw new Error("temporary transport issue");
      }
    } as unknown as BybitReadonlyClient;

    const service = new BybitPositionService(client, botService, new MemoryCacheStore());

    await expect(service.getOpenPositions(context)).rejects.toThrow("Failed to fetch page 1");
    expect(calls).toBe(1);
  });

  it("uses transport retry metadata in page failure message", async () => {
    let calls = 0;
    const error = Object.assign(new Error("too many requests"), {
      retryInfo: {
        attempts: 4
      }
    });

    const client = {
      getPositions: async () => {
        calls += 1;
        throw error;
      }
    } as unknown as BybitReadonlyClient;

    const service = new BybitPositionService(client, botService, new MemoryCacheStore());
    await expect(service.getOpenPositions(context)).rejects.toThrow("after 4 attempts");
    expect(calls).toBe(1);
  });

  it("degrades when subsequent positions page fails", async () => {
    const client = {
      getPositions: async (_category: string, cursor?: string) => {
        if (!cursor) {
          return {
            list: [
              {
                symbol: "BTCUSDT",
                size: "1",
                side: "Buy",
                markPrice: "100",
                avgPrice: "90",
                positionValue: "100",
                leverage: "2",
                unrealisedPnl: "5"
              }
            ],
            nextPageCursor: "next-cursor"
          };
        }

        throw new Error("timeout on second page");
      }
    } as unknown as BybitReadonlyClient;

    const service = new BybitPositionService(client, botService, new MemoryCacheStore());
    const result = await service.getOpenPositions(context);

    expect(result.positions).toHaveLength(1);
    expect(result.dataCompleteness.partial).toBe(true);
    expect(result.dataCompleteness.issues[0]?.code).toBe("page_fetch_failed");
  });

  it("requests required bot data in bot source mode", async () => {
    let requirement: string | undefined;
    const client = {
      getPositions: async () => ({
        list: [],
        nextPageCursor: undefined
      })
    } as unknown as BybitReadonlyClient;

    const requiredBotService = {
      getBotReport: async (_context: ServiceRequestContext, options?: { requirement?: string }) => {
        requirement = options?.requirement;
        return {
          source: "bybit" as const,
          generatedAt: new Date().toISOString(),
          availability: "available" as const,
          bots: [
            {
              botId: "fgrid-1",
              name: "BTC Grid",
              status: "running" as const,
              symbol: "BTCUSDT",
              quoteAsset: "USDT",
              side: "long" as const,
              exposureUsd: 150,
              markPrice: 150
            }
          ],
          dataCompleteness: {
            state: "complete" as const,
            partial: false,
            warnings: [],
            issues: []
          }
        };
      }
    };

    const service = new BybitPositionService(client, requiredBotService, new MemoryCacheStore());
    const result = await service.getOpenPositions({
      ...context,
      sourceMode: "bot",
      providerContext: { bybit: { botStrategyIds: { futuresGridBotIds: ["fgrid-1"], spotGridBotIds: [] } } }
    });

    expect(requirement).toBe("required");
    expect(result.positions).toHaveLength(1);
  });

  it("fails closed in bot mode even when category is spot", async () => {
    const client = {
      getPositions: async () => ({
        list: [],
        nextPageCursor: undefined
      })
    } as unknown as BybitReadonlyClient;

    const requiredBotService = {
      getBotReport: async () => {
        throw new RequiredBotDataUnavailableError("required-input-failed: mandatory bot data is unavailable.");
      }
    };

    const service = new BybitPositionService(client, requiredBotService, new MemoryCacheStore());

    await expect(
      service.getOpenPositions({
        ...context,
        category: "spot",
        sourceMode: "bot",
        providerContext: { bybit: { botStrategyIds: { futuresGridBotIds: ["bot-id-1"], spotGridBotIds: [] } } }
      })
    ).rejects.toBeInstanceOf(RequiredBotDataUnavailableError);
  });
});
