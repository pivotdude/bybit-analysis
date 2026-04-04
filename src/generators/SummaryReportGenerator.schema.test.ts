import { describe, expect, it } from "bun:test";
import { SummaryReportGenerator, SUMMARY_SCHEMA_VERSION } from "./SummaryReportGenerator";
import { MarkdownRenderer } from "../renderers/MarkdownRenderer";
import type { AccountDataService, ServiceRequestContext } from "../services/contracts/AccountDataService";
import type { ExecutionDataService } from "../services/contracts/ExecutionDataService";
import type { BotDataService } from "../services/contracts/BotDataService";
import type { MarketCategory } from "../types/domain.types";

const BASE_CONTEXT = {
  futuresGridBotIds: [],
  spotGridBotIds: [],
  from: "2026-01-01T00:00:00.000Z",
  to: "2026-01-31T00:00:00.000Z",
  timeoutMs: 5_000
} as const;

function createContext(category: MarketCategory): ServiceRequestContext {
  return {
    ...BASE_CONTEXT,
    category
  };
}

const accountService: AccountDataService = {
  getAccountSnapshot: async (context) => {
    if (context.category === "linear") {
      return {
        source: "bybit",
        exchange: "bybit",
        category: "linear",
        capturedAt: "2026-01-31T00:00:00.000Z",
        totalEquityUsd: 10_000,
        walletBalanceUsd: 9_700,
        availableBalanceUsd: 7_000,
        unrealizedPnlUsd: 300,
        positions: [
          {
            source: "bybit",
            exchange: "bybit",
            category: "linear",
            symbol: "BTCUSDT",
            baseAsset: "BTC",
            quoteAsset: "USDT",
            side: "long",
            marginMode: "cross",
            quantity: 0.12,
            entryPrice: 44_000,
            valuationPrice: 45_000,
            priceSource: "mark",
            notionalUsd: 5_400,
            leverage: 3,
            unrealizedPnlUsd: 120,
            updatedAt: "2026-01-31T00:00:00.000Z"
          },
          {
            source: "bybit",
            exchange: "bybit",
            category: "linear",
            symbol: "ETHUSDT",
            baseAsset: "ETH",
            quoteAsset: "USDT",
            side: "short",
            marginMode: "isolated",
            quantity: 1,
            entryPrice: 2_600,
            valuationPrice: 2_550,
            priceSource: "mark",
            notionalUsd: -2_550,
            leverage: 2,
            unrealizedPnlUsd: 60,
            updatedAt: "2026-01-31T00:00:00.000Z"
          }
        ],
        balances: [
          { asset: "USDT", walletBalance: 6_000, availableBalance: 4_500, usdValue: 6_000 },
          { asset: "BTC", walletBalance: 0.08, availableBalance: 0.04, usdValue: 3_600 },
          { asset: "ETH", walletBalance: 0.2, availableBalance: 0.1, usdValue: 400 }
        ],
        dataCompleteness: {
          state: "complete",
          partial: false,
          warnings: [],
          issues: []
        }
      };
    }

    if (context.category === "spot") {
      return {
        source: "bybit",
        exchange: "bybit",
        category: "spot",
        capturedAt: "2026-01-31T00:00:00.000Z",
        totalEquityUsd: 8_000,
        walletBalanceUsd: 8_000,
        availableBalanceUsd: 8_000,
        unrealizedPnlUsd: 0,
        positions: [],
        balances: [
          { asset: "USDT", walletBalance: 5_000, availableBalance: 5_000, usdValue: 5_000 },
          { asset: "SOL", walletBalance: 30, availableBalance: 30, usdValue: 3_000 }
        ],
        dataCompleteness: {
          state: "complete",
          partial: false,
          warnings: [],
          issues: []
        }
      };
    }

    return {
      source: "bybit",
      exchange: "bybit",
      category: "bot",
      capturedAt: "2026-01-31T00:00:00.000Z",
      totalEquityUsd: 12_000,
      walletBalanceUsd: 12_000,
      availableBalanceUsd: 9_500,
      unrealizedPnlUsd: 0,
      positions: [],
      balances: [
        { asset: "USDT", walletBalance: 12_000, availableBalance: 9_500, usdValue: 12_000 }
      ],
      dataCompleteness: {
        state: "degraded",
        partial: true,
        warnings: ["Bot equity source lagged by one polling interval"],
        issues: [
          {
            code: "optional_item_failed",
            scope: "unknown",
            severity: "warning",
            criticality: "optional",
            message: "Bot equity source lagged by one polling interval"
          }
        ]
      }
    };
  },
  checkHealth: async () => ({
    connectivity: "ok",
    auth: "ok",
    latencyMs: 1,
    diagnostics: []
  }),
  getApiKeyPermissionInfo: async () => ({
    apiKeyStatus: "present",
    apiKeyDisplay: "<redacted>",
    readOnly: true,
    ipWhitelistRestricted: false,
    ipWhitelistCount: 0,
    ipWhitelistDisplay: "not configured",
    permissions: {}
  })
};

const executionService: ExecutionDataService = {
  getPnlReport: async (request) => {
    const { context } = request;

    if (context.category === "linear") {
      return {
        source: "bybit",
        generatedAt: "2026-01-31T00:00:00.000Z",
        periodFrom: context.from,
        periodTo: context.to,
        realizedPnlUsd: 280,
        unrealizedPnlUsd: 180,
        fees: {
          tradingFeesUsd: 25,
          fundingFeesUsd: -4
        },
        netPnlUsd: 439,
        bySymbol: [
          {
            symbol: "BTCUSDT",
            realizedPnlUsd: 300,
            unrealizedPnlUsd: 120,
            netPnlUsd: 420,
            tradesCount: 8
          },
          {
            symbol: "ETHUSDT",
            realizedPnlUsd: -20,
            unrealizedPnlUsd: 60,
            netPnlUsd: 40,
            tradesCount: 5
          }
        ],
        bestSymbols: [],
        worstSymbols: [],
        dataCompleteness: {
          state: "complete",
          partial: false,
          warnings: [],
          issues: []
        }
      };
    }

    if (context.category === "spot") {
      return {
        source: "bybit",
        generatedAt: "2026-01-31T00:00:00.000Z",
        periodFrom: context.from,
        periodTo: context.to,
        realizedPnlUsd: 70,
        unrealizedPnlUsd: 0,
        fees: {
          tradingFeesUsd: 5,
          fundingFeesUsd: 0
        },
        netPnlUsd: 65,
        bySymbol: [
          {
            symbol: "SOLUSDT",
            realizedPnlUsd: 70,
            unrealizedPnlUsd: 0,
            netPnlUsd: 65,
            tradesCount: 6
          }
        ],
        bestSymbols: [],
        worstSymbols: [],
        dataCompleteness: {
          state: "complete",
          partial: false,
          warnings: [],
          issues: []
        }
      };
    }

    return {
      source: "bybit",
      generatedAt: "2026-01-31T00:00:00.000Z",
      periodFrom: context.from,
      periodTo: context.to,
      realizedPnlUsd: 125,
      unrealizedPnlUsd: 0,
      fees: {
        tradingFeesUsd: 10,
        fundingFeesUsd: 0
      },
      netPnlUsd: 115,
      bySymbol: [],
      bestSymbols: [],
      worstSymbols: [],
      dataCompleteness: {
        state: "degraded",
        partial: true,
        warnings: ["Execution history truncated at configured safety limit"],
        issues: [
          {
            code: "pagination_limit_reached",
            scope: "execution_window",
            severity: "warning",
            criticality: "critical",
            message: "Execution history truncated at configured safety limit"
          }
        ]
      }
    };
  }
};

const botService: BotDataService = {
  getBotReport: async (context) => {
    if (context.category !== "bot") {
      return {
        source: "bybit",
        generatedAt: "2026-01-31T00:00:00.000Z",
        availability: "not_available",
        availabilityReason: "Bot endpoints disabled for this category",
        bots: [],
        dataCompleteness: {
          state: "complete",
          partial: false,
          warnings: [],
          issues: []
        }
      };
    }

    return {
      source: "bybit",
      generatedAt: "2026-01-31T00:00:00.000Z",
      availability: "available",
      bots: [
        {
          botId: "612330315406398322",
          name: "BTC Grid",
          botType: "futures_grid",
          symbol: "BTCUSDT",
          status: "running",
          side: "long",
          allocatedCapitalUsd: 1_500,
          exposureUsd: 1_850,
          realizedPnlUsd: 75,
          unrealizedPnlUsd: 20,
          roiPct: 6.33
        }
      ],
      totalAllocatedUsd: 1_500,
      totalBotExposureUsd: 1_850,
      totalBotPnlUsd: 95,
      dataCompleteness: {
        state: "complete",
        partial: false,
        warnings: [],
        issues: []
      }
    };
  }
};

async function generateByCategory(category: MarketCategory) {
  const generator = new SummaryReportGenerator(accountService, executionService, botService);
  return generator.generate(createContext(category));
}

describe("SummaryReportGenerator schema stability", () => {
  it("keeps section IDs and types identical across categories", async () => {
    const [linear, spot, bot] = await Promise.all([
      generateByCategory("linear"),
      generateByCategory("spot"),
      generateByCategory("bot")
    ]);

    const linearShape = linear.sections.map((section) => ({ id: section.id, type: section.type }));
    const spotShape = spot.sections.map((section) => ({ id: section.id, type: section.type }));
    const botShape = bot.sections.map((section) => ({ id: section.id, type: section.type }));

    expect(linear.schemaVersion).toBe(SUMMARY_SCHEMA_VERSION);
    expect(spot.schemaVersion).toBe(SUMMARY_SCHEMA_VERSION);
    expect(bot.schemaVersion).toBe(SUMMARY_SCHEMA_VERSION);

    expect(spotShape).toEqual(linearShape);
    expect(botShape).toEqual(linearShape);
    expect(linearShape).toMatchSnapshot();
  });

  it("produces stable snapshots for linear category sections", async () => {
    const report = await generateByCategory("linear");
    expect(report.sections).toMatchSnapshot();
  });

  it("produces stable snapshots for spot category sections", async () => {
    const report = await generateByCategory("spot");
    expect(report.sections).toMatchSnapshot();
  });

  it("produces stable snapshots for bot category sections", async () => {
    const report = await generateByCategory("bot");
    expect(report.sections).toMatchSnapshot();
  });

  it("renders schema version and section IDs in markdown", async () => {
    const report = await generateByCategory("linear");
    const markdown = new MarkdownRenderer().render(report, "md");

    expect(markdown).toContain(`Schema: ${SUMMARY_SCHEMA_VERSION}`);
    expect(markdown).toContain("## [summary.contract] Summary Contract");
    expect(markdown).toContain("## [summary.data_completeness] Data Completeness");
  });
});
