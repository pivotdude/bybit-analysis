import { describe, expect, it } from "bun:test";
import { MemoryCacheStore } from "../cache/MemoryCacheStore";
import type { ServiceRequestContext } from "../contracts/AccountDataService";
import { BybitExecutionService } from "./BybitExecutionService";
import type { BybitReadonlyClient } from "./BybitClientFactory";
import { PaginationLimitReachedError } from "./pagination";

const spotContext: ServiceRequestContext = {
  category: "spot",
  futuresGridBotIds: [],
  spotGridBotIds: [],
  from: "2026-01-01T00:00:00.000Z",
  to: "2026-01-02T00:00:00.000Z",
  timeoutMs: 5_000
};

const linearContext: ServiceRequestContext = {
  ...spotContext,
  category: "linear"
};

const botService = {
  getBotReport: async () => ({
    source: "bybit" as const,
    generatedAt: new Date().toISOString(),
    availability: "available" as const,
    bots: []
  })
};

describe("BybitExecutionService pagination", () => {
  it("reads all spot execution pages when no safety limit is configured", async () => {
    let calls = 0;
    const totalPages = 25;

    const client = {
      getExecutionList: async (_category: string, _from: string, _to: string, cursor?: string) => {
        calls += 1;
        const index = cursor ? Number(cursor.slice(1)) : 0;
        const nextPageCursor = index + 1 < totalPages ? `c${index + 1}` : undefined;

        return {
          list: [
            {
              symbol: "BTCUSDT",
              side: "Buy",
              execQty: "1",
              execValue: "100",
              execPrice: "100",
              execFee: "0",
              feeCurrency: "USDT",
              execType: "Trade",
              execTime: String(index + 1)
            }
          ],
          nextPageCursor
        };
      }
    } as unknown as BybitReadonlyClient;

    const service = new BybitExecutionService(client, botService, new MemoryCacheStore());
    const report = await service.getPnlReport(spotContext);

    expect(calls).toBe(25);
    expect(report.dataCompleteness.partial).toBe(false);
    expect(report.bySymbol[0]?.tradesCount).toBe(25);
  });

  it("marks report partial when closed-pnl safety limit is reached in partial mode", async () => {
    let calls = 0;

    const client = {
      getClosedPnl: async (_category: string, _from: string, _to: string, cursor?: string) => {
        calls += 1;
        const index = cursor ? Number(cursor.slice(1)) : 0;
        const nextPageCursor = index < 2 ? `c${index + 1}` : undefined;

        return {
          list: [
            {
              symbol: "BTCUSDT",
              closedPnl: "10",
              openFee: "1",
              closeFee: "1"
            }
          ],
          nextPageCursor
        };
      },
      getWalletBalance: async () => ({
        list: [{ totalPerpUPL: "0" }]
      })
    } as unknown as BybitReadonlyClient;

    const service = new BybitExecutionService(client, botService, new MemoryCacheStore(), {
      maxPagesPerChunk: 2,
      limitMode: "partial"
    });

    const report = await service.getPnlReport(linearContext);

    expect(calls).toBe(2);
    expect(report.dataCompleteness.partial).toBe(true);
    expect(report.dataCompleteness.warnings).toHaveLength(1);
    expect(report.dataCompleteness.warnings[0]).toContain("closed-pnl");
  });

  it("throws when closed-pnl safety limit is reached in error mode", async () => {
    const client = {
      getClosedPnl: async (_category: string, _from: string, _to: string, cursor?: string) => {
        const index = cursor ? Number(cursor.slice(1)) : 0;
        const nextPageCursor = index < 2 ? `c${index + 1}` : undefined;

        return {
          list: [
            {
              symbol: "BTCUSDT",
              closedPnl: "10",
              openFee: "1",
              closeFee: "1"
            }
          ],
          nextPageCursor
        };
      },
      getWalletBalance: async () => ({
        list: [{ totalPerpUPL: "0" }]
      })
    } as unknown as BybitReadonlyClient;

    const service = new BybitExecutionService(client, botService, new MemoryCacheStore(), {
      maxPagesPerChunk: 2,
      limitMode: "error"
    });

    try {
      await service.getPnlReport(linearContext);
      throw new Error("expected pagination limit error");
    } catch (error) {
      expect(error).toBeInstanceOf(PaginationLimitReachedError);
      const paginationError = error as PaginationLimitReachedError;
      expect(paginationError.context.endpoint).toBe("closed-pnl");
      expect(paginationError.context.pageLimit).toBe(2);
      expect(paginationError.context.pagesFetched).toBe(2);
    }
  });
});
