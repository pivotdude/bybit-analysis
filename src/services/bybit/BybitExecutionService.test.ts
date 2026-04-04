import { describe, expect, it } from "bun:test";
import { MemoryCacheStore } from "../cache/MemoryCacheStore";
import type { ServiceRequestContext } from "../contracts/AccountDataService";
import { BybitExecutionService } from "./BybitExecutionService";
import type { BybitReadonlyClient } from "./BybitClientFactory";
import { PaginationLimitReachedError } from "./pagination";

const spotContext: ServiceRequestContext = {
  category: "spot",
  sourceMode: "market",
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
    bots: [],
    dataCompleteness: {
      state: "complete" as const,
      partial: false,
      warnings: [],
      issues: []
    }
  })
};

function spotTrade(args: {
  side: "Buy" | "Sell";
  qty: number;
  price: number;
  timeMs: number;
  symbol?: string;
}): Record<string, unknown> {
  const qty = args.qty;
  const price = args.price;

  return {
    symbol: args.symbol ?? "BTCUSDT",
    side: args.side,
    execQty: String(qty),
    execValue: String(qty * price),
    execPrice: String(price),
    execFee: "0",
    feeCurrency: "USDT",
    execType: "Trade",
    execTime: String(args.timeMs)
  };
}

describe("BybitExecutionService pagination", () => {
  it("returns supported ROI contract when start/end equity are provided", async () => {
    const client = {
      getClosedPnl: async () => ({
        list: [],
        nextPageCursor: undefined
      }),
      getWalletBalance: async () => ({
        list: [{ totalPerpUPL: "0" }]
      })
    } as unknown as BybitReadonlyClient;

    const service = new BybitExecutionService(client, botService, new MemoryCacheStore());
    const report = await service.getPnlReport({
      context: linearContext,
      equityStartUsd: 1_000,
      equityEndUsd: 1_100
    });

    expect(report.roiStatus).toBe("supported");
    expect(report.roiPct).toBeCloseTo(10);
    expect(report.roiStartEquityUsd).toBe(1_000);
    expect(report.roiEndEquityUsd).toBe(1_100);
  });

  it("returns unsupported ROI contract with reason when start equity is missing", async () => {
    const client = {
      getClosedPnl: async () => ({
        list: [],
        nextPageCursor: undefined
      }),
      getWalletBalance: async () => ({
        list: [{ totalPerpUPL: "0" }]
      })
    } as unknown as BybitReadonlyClient;

    const service = new BybitExecutionService(client, botService, new MemoryCacheStore());
    const report = await service.getPnlReport({
      context: linearContext,
      equityStartUsd: undefined,
      equityEndUsd: 1_100
    });

    expect(report.roiStatus).toBe("unsupported");
    expect(report.roiPct).toBeUndefined();
    expect(report.roiUnsupportedReason).toContain("starting equity is unavailable");
  });

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
    const report = await service.getPnlReport({ context: spotContext });

    expect(calls).toBe(25);
    expect(report.dataCompleteness.partial).toBe(false);
    expect(report.bySymbol[0]?.tradesCount).toBe(25);
  });

  it("uses pre-window spot executions to build opening inventory cost basis", async () => {
    const periodFromMs = new Date(spotContext.from).getTime();
    const periodToMs = new Date(spotContext.to).getTime();
    const openingBuyTimeMs = periodFromMs - 60_000;
    let openingCalls = 0;
    let windowCalls = 0;

    const client = {
      getExecutionList: async (
        _category: string,
        from: string,
        to: string,
        _cursor?: string,
        _timeoutMs?: number,
        symbol?: string
      ) => {
        const fromMs = new Date(from).getTime();
        const toMs = new Date(to).getTime();

        if (fromMs >= periodFromMs && toMs <= periodToMs) {
          windowCalls += 1;
          return {
            list: [spotTrade({ side: "Sell", qty: 1, price: 150, timeMs: periodFromMs + 60_000 })],
            nextPageCursor: undefined
          };
        }

        if (symbol === "BTCUSDT") {
          openingCalls += 1;
          if (fromMs <= openingBuyTimeMs && openingBuyTimeMs <= toMs) {
            return {
              list: [spotTrade({ side: "Buy", qty: 1, price: 100, timeMs: openingBuyTimeMs })],
              nextPageCursor: undefined
            };
          }
        }

        return {
          list: [],
          nextPageCursor: undefined
        };
      }
    } as unknown as BybitReadonlyClient;

    const service = new BybitExecutionService(client, botService, new MemoryCacheStore());
    const report = await service.getPnlReport({ context: spotContext });

    expect(windowCalls).toBe(1);
    expect(openingCalls).toBeGreaterThan(0);
    expect(report.realizedPnlUsd).toBeCloseTo(50);
    expect(report.bySymbol[0]?.realizedPnlUsd).toBeCloseTo(50);
    expect(report.dataCompleteness.partial).toBe(false);
  });

  it("marks spot report partial when opening inventory basis cannot be reconstructed", async () => {
    const periodFromMs = new Date(spotContext.from).getTime();
    const periodToMs = new Date(spotContext.to).getTime();

    const client = {
      getExecutionList: async (_category: string, from: string, to: string) => {
        const fromMs = new Date(from).getTime();
        const toMs = new Date(to).getTime();
        if (fromMs >= periodFromMs && toMs <= periodToMs) {
          return {
            list: [spotTrade({ side: "Sell", qty: 1, price: 150, timeMs: periodFromMs + 1 })],
            nextPageCursor: undefined
          };
        }

        return {
          list: [],
          nextPageCursor: undefined
        };
      }
    } as unknown as BybitReadonlyClient;

    const service = new BybitExecutionService(client, botService, new MemoryCacheStore());
    const report = await service.getPnlReport({ context: spotContext });

    expect(report.realizedPnlUsd).toBeCloseTo(0);
    expect(report.dataCompleteness.partial).toBe(true);
    expect(report.dataCompleteness.warnings.some((warning) => warning.includes("cost basis"))).toBe(true);
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

    const report = await service.getPnlReport({ context: linearContext });

    expect(calls).toBe(2);
    expect(report.dataCompleteness.partial).toBe(true);
    expect(report.dataCompleteness.warnings).toHaveLength(1);
    expect(report.dataCompleteness.warnings[0]).toContain("closed-pnl");
  });

  it("reuses unrealized pnl from account snapshot and skips wallet fetch", async () => {
    let walletCalls = 0;

    const client = {
      getClosedPnl: async () => ({
        list: [
          {
            symbol: "BTCUSDT",
            closedPnl: "10",
            openFee: "1",
            closeFee: "1"
          }
        ],
        nextPageCursor: undefined
      }),
      getWalletBalance: async () => {
        walletCalls += 1;
        return {
          list: [{ totalPerpUPL: "999" }]
        };
      }
    } as unknown as BybitReadonlyClient;

    const service = new BybitExecutionService(client, botService, new MemoryCacheStore());
    const report = await service.getPnlReport({
      context: linearContext,
      accountSnapshot: {
        unrealizedPnlUsd: 42
      }
    });

    expect(walletCalls).toBe(0);
    expect(report.unrealizedPnlUsd).toBe(42);
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
      await service.getPnlReport({ context: linearContext });
      throw new Error("expected pagination limit error");
    } catch (error) {
      expect(error).toBeInstanceOf(PaginationLimitReachedError);
      const paginationError = error as PaginationLimitReachedError;
      expect(paginationError.context.endpoint).toBe("closed-pnl");
      expect(paginationError.context.pageLimit).toBe(2);
      expect(paginationError.context.pagesFetched).toBe(2);
    }
  });

  it("fails fast when first closed-pnl page cannot be fetched", async () => {
    const client = {
      getClosedPnl: async () => {
        throw new Error("network timeout");
      },
      getWalletBalance: async () => ({
        list: [{ totalPerpUPL: "0" }]
      })
    } as unknown as BybitReadonlyClient;

    const service = new BybitExecutionService(client, botService, new MemoryCacheStore());
    await expect(service.getPnlReport({ context: linearContext })).rejects.toThrow("Failed to fetch page 1");
  });

  it("degrades when subsequent closed-pnl page fails", async () => {
    const client = {
      getClosedPnl: async (_category: string, _from: string, _to: string, cursor?: string) => {
        if (!cursor) {
          return {
            list: [
              {
                symbol: "BTCUSDT",
                closedPnl: "10",
                openFee: "1",
                closeFee: "1"
              }
            ],
            nextPageCursor: "next-page"
          };
        }
        throw new Error("upstream failed on second page");
      },
      getWalletBalance: async () => ({
        list: [{ totalPerpUPL: "0" }]
      })
    } as unknown as BybitReadonlyClient;

    const service = new BybitExecutionService(client, botService, new MemoryCacheStore());
    const report = await service.getPnlReport({ context: linearContext });

    expect(report.bySymbol[0]?.symbol).toBe("BTCUSDT");
    expect(report.dataCompleteness.partial).toBe(true);
    expect(report.dataCompleteness.issues[0]?.code).toBe("page_fetch_failed");
  });
});
