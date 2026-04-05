import { describe, expect, it } from "bun:test";
import type { RuntimeConfig } from "../../types/config.types";
import { MemoryCacheStore } from "../cache/MemoryCacheStore";
import type { ServiceRequestContext } from "../contracts/AccountDataService";
import { BybitExecutionService } from "./BybitExecutionService";
import { createBybitClient, type BybitReadonlyClient } from "./BybitClientFactory";
import { PaginationLimitReachedError } from "./pagination";

const spotContext: ServiceRequestContext = {
  category: "spot",
  sourceMode: "market",
  providerContext: { bybit: { botStrategyIds: { futuresGridBotIds: [], spotGridBotIds: [] } } },
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
  it("requests required bot data in bot source mode", async () => {
    let requirement: string | undefined;
    const service = new BybitExecutionService(
      {} as BybitReadonlyClient,
      {
        getBotReport: async (_context, options) => {
          requirement = options?.requirement;
          return {
            source: "bybit",
            generatedAt: new Date().toISOString(),
            availability: "available",
            bots: [
              {
                botId: "fgrid-1",
                name: "BTC Grid",
                status: "running",
                symbol: "BTCUSDT",
                realizedPnlUsd: 30,
                unrealizedPnlUsd: 5,
                activePositionCount: 1
              }
            ],
            dataCompleteness: {
              state: "complete",
              partial: false,
              warnings: [],
              issues: []
            }
          };
        }
      },
      new MemoryCacheStore()
    );

    const report = await service.getPnlReport({
      context: {
        ...linearContext,
        sourceMode: "bot",
        providerContext: { bybit: { botStrategyIds: { futuresGridBotIds: ["fgrid-1"], spotGridBotIds: [] } } }
      }
    });

    expect(requirement).toBe("required");
    expect(report.netPnlUsd).toBe(35);
  });

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
      endingState: {
        asOf: linearContext.to,
        totalEquityUsd: 1_100
      }
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
      equityStartUsd: undefined
    });

    expect(report.roiStatus).toBe("unsupported");
    expect(report.roiPct).toBeUndefined();
    expect(report.roiUnsupportedReason).toContain("starting equity is unavailable");
    expect(report.roiUnsupportedReasonCode).toBe("starting_equity_unavailable");
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

  it("surfaces unsupported non-stable quote conversion as unsupported_feature issue", async () => {
    const periodFromMs = new Date(spotContext.from).getTime();
    const periodToMs = new Date(spotContext.to).getTime();

    const client = {
      getExecutionList: async (_category: string, from: string, to: string) => {
        const fromMs = new Date(from).getTime();
        const toMs = new Date(to).getTime();
        if (fromMs >= periodFromMs && toMs <= periodToMs) {
          return {
            list: [spotTrade({ side: "Sell", qty: 1, price: 0.06, timeMs: periodFromMs + 1, symbol: "ETHBTC" })],
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

    expect(report.realizedPnlUsd).toBe(0);
    expect(report.netPnlUsd).toBe(0);
    expect(report.bySymbol).toEqual([]);
    expect(
      report.dataCompleteness.issues.some(
        (issue) =>
          issue.code === "unsupported_feature" &&
          issue.scope === "execution_window" &&
          issue.message.includes("ETHBTC")
      )
    ).toBe(true);
  });

  it("does not fetch opening inventory for non-stable quote sells, avoiding pagination abort", async () => {
    const periodFromMs = new Date(spotContext.from).getTime();
    const periodToMs = new Date(spotContext.to).getTime();
    let openingFetchAttempts = 0;

    const client = {
      getExecutionList: async (_category: string, from: string, to: string, _cursor?: string, _timeoutMs?: number, symbol?: string) => {
        const fromMs = new Date(from).getTime();
        const toMs = new Date(to).getTime();
        if (fromMs >= periodFromMs && toMs <= periodToMs) {
          return {
            list: [spotTrade({ side: "Sell", qty: 1, price: 0.06, timeMs: periodFromMs + 1, symbol: "ETHBTC" })],
            nextPageCursor: undefined
          };
        }

        if (symbol === "ETHBTC") {
          openingFetchAttempts += 1;
          return {
            list: [spotTrade({ side: "Buy", qty: 1, price: 0.05, timeMs: periodFromMs - 1, symbol: "ETHBTC" })],
            nextPageCursor: "c1"
          };
        }

        return {
          list: [],
          nextPageCursor: undefined
        };
      }
    } as unknown as BybitReadonlyClient;

    const service = new BybitExecutionService(client, botService, new MemoryCacheStore(), {
      maxPagesPerChunk: 1,
      limitMode: "error"
    });
    const report = await service.getPnlReport({ context: spotContext });

    expect(openingFetchAttempts).toBe(0);
    expect(report.realizedPnlUsd).toBe(0);
    expect(
      report.dataCompleteness.issues.some(
        (issue) =>
          issue.code === "unsupported_feature" &&
          issue.scope === "execution_window" &&
          issue.message.includes("ETHBTC")
      )
    ).toBe(true);
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
    expect(report.dataCompleteness.warnings).toHaveLength(2);
    expect(report.dataCompleteness.warnings.some((warning) => warning.includes("closed-pnl"))).toBe(true);
    expect(report.dataCompleteness.warnings.some((warning) => warning.includes("Historical period end-state is unavailable"))).toBe(
      true
    );
  });

  it("reuses supplied historical end-state and skips wallet fetch", async () => {
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
      endingState: {
        asOf: linearContext.to,
        totalEquityUsd: 1_050,
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

  it("does not amplify client 429 retries in service pagination flow", async () => {
    let closedPnlCalls = 0;
    const retryDelays: number[] = [];

    const client = createBybitClient(
      {
        apiKey: "test-api-key",
        apiSecret: "test-api-secret",
        timeoutMs: 5_000
      } as RuntimeConfig,
      {
        sleep: async (delayMs) => {
          retryDelays.push(delayMs);
        },
        random: () => 0,
        retryPolicy: {
          maxAttempts: 2,
          baseDelayMs: 100,
          maxDelayMs: 1_000,
          jitterRatio: 0
        },
        fetchFn: (async (...args: Parameters<typeof fetch>) => {
          const url = args[0];
          const urlText = typeof url === "string" ? url : url.toString();

          if (urlText.includes("/v5/position/closed-pnl")) {
            closedPnlCalls += 1;
            return new Response("{\"retCode\":10006,\"retMsg\":\"too many requests\"}", {
              status: 429,
              statusText: "Too Many Requests",
              headers: {
                "content-type": "application/json",
                "retry-after": "2"
              }
            });
          }

          if (urlText.includes("/v5/account/wallet-balance")) {
            return new Response("{\"retCode\":0,\"retMsg\":\"OK\",\"result\":{\"list\":[{\"totalPerpUPL\":\"0\"}]},\"time\":1}", {
              status: 200,
              statusText: "OK",
              headers: { "content-type": "application/json" }
            });
          }

          throw new Error(`unexpected endpoint in test: ${urlText}`);
        }) as unknown as typeof fetch
      }
    );

    const service = new BybitExecutionService(client, botService, new MemoryCacheStore());
    await expect(service.getPnlReport({ context: linearContext })).rejects.toThrow("after 2 attempts");
    expect(closedPnlCalls).toBe(2);
    expect(retryDelays).toEqual([2_000]);
  });

  it("stops further closed-pnl chunk fetches after a retried page failure", async () => {
    let closedPnlCalls = 0;
    const retryDelays: number[] = [];
    const multiChunkContext: ServiceRequestContext = {
      ...linearContext,
      from: "2026-01-01T00:00:00.000Z",
      to: "2026-02-20T00:00:00.000Z"
    };

    const client = createBybitClient(
      {
        apiKey: "test-api-key",
        apiSecret: "test-api-secret",
        timeoutMs: 5_000
      } as RuntimeConfig,
      {
        sleep: async (delayMs) => {
          retryDelays.push(delayMs);
        },
        random: () => 0,
        retryPolicy: {
          maxAttempts: 2,
          baseDelayMs: 100,
          maxDelayMs: 1_000,
          jitterRatio: 0
        },
        fetchFn: (async (...args: Parameters<typeof fetch>) => {
          const url = args[0];
          const urlText = typeof url === "string" ? url : url.toString();

          if (urlText.includes("/v5/position/closed-pnl")) {
            closedPnlCalls += 1;
            if (closedPnlCalls === 1) {
              return new Response(
                "{\"retCode\":0,\"retMsg\":\"OK\",\"result\":{\"list\":[{\"symbol\":\"BTCUSDT\",\"closedPnl\":\"10\",\"openFee\":\"1\",\"closeFee\":\"1\"}]},\"time\":1}",
                {
                  status: 200,
                  statusText: "OK",
                  headers: { "content-type": "application/json" }
                }
              );
            }

            return new Response("{\"retCode\":10006,\"retMsg\":\"too many requests\"}", {
              status: 429,
              statusText: "Too Many Requests",
              headers: {
                "content-type": "application/json",
                "retry-after": "2"
              }
            });
          }

          if (urlText.includes("/v5/account/wallet-balance")) {
            return new Response("{\"retCode\":0,\"retMsg\":\"OK\",\"result\":{\"list\":[{\"totalPerpUPL\":\"0\"}]},\"time\":1}", {
              status: 200,
              statusText: "OK",
              headers: { "content-type": "application/json" }
            });
          }

          throw new Error(`unexpected endpoint in test: ${urlText}`);
        }) as unknown as typeof fetch
      }
    );

    const service = new BybitExecutionService(client, botService, new MemoryCacheStore());
    const report = await service.getPnlReport({ context: multiChunkContext });

    expect(report.dataCompleteness.partial).toBe(true);
    expect(retryDelays).toEqual([2_000]);
    expect(closedPnlCalls).toBe(3);
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
