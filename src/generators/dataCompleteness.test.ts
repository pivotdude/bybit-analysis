import { describe, expect, it } from "bun:test";
import { PerformanceReportGenerator } from "./PerformanceReportGenerator";
import { PnLReportGenerator } from "./PnLReportGenerator";
import { SummaryReportGenerator } from "./SummaryReportGenerator";
import type { AccountDataService, ServiceRequestContext } from "../services/contracts/AccountDataService";
import type { ExecutionDataService } from "../services/contracts/ExecutionDataService";
import type { BotDataService } from "../services/contracts/BotDataService";
import type { PositionDataService } from "../services/contracts/PositionDataService";

const context: ServiceRequestContext = {
  category: "spot",
  sourceMode: "market",
  providerContext: { bybit: { botStrategyIds: { futuresGridBotIds: [], spotGridBotIds: [] } } },
  from: "2026-01-01T00:00:00.000Z",
  to: "2026-01-31T00:00:00.000Z",
  timeoutMs: 5_000
};

const accountService: AccountDataService = {
  getWalletSnapshot: async () => ({
    source: "bybit",
    exchange: "bybit",
    category: "spot",
    capturedAt: new Date().toISOString(),
    totalEquityUsd: 10_000,
    walletBalanceUsd: 10_000,
    availableBalanceUsd: 10_000,
    unrealizedPnlUsd: 0,
    balances: [{ asset: "USDT", walletBalance: 10_000, availableBalance: 10_000, usdValue: 10_000 }],
    dataCompleteness: {
      state: "partial_critical",
      partial: true,
      warnings: ["Pagination safety limit reached for positions"],
      issues: [
        {
          code: "pagination_limit_reached",
          scope: "positions",
          severity: "warning",
          criticality: "critical",
          message: "Pagination safety limit reached for positions"
        }
      ]
    }
  }),
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

const positionService: PositionDataService = {
  getOpenPositions: async () => ({
    source: "bybit",
    exchange: "bybit",
    capturedAt: new Date().toISOString(),
    positions: [],
    dataCompleteness: {
      state: "partial_critical",
      partial: true,
      warnings: ["Pagination safety limit reached for positions"],
      issues: [
        {
          code: "pagination_limit_reached",
          scope: "positions",
          severity: "warning",
          criticality: "critical",
          message: "Pagination safety limit reached for positions"
        }
      ]
    }
  })
};

const partialPnlReport = {
  source: "bybit" as const,
  generatedAt: new Date().toISOString(),
  periodFrom: context.from,
  periodTo: context.to,
  realizedPnlUsd: 10,
  unrealizedPnlUsd: 0,
  fees: {
    tradingFeesUsd: 1,
    fundingFeesUsd: 0
  },
  netPnlUsd: 9,
  endStateStatus: "unsupported" as const,
  endStateUnsupportedReason: "Historical period end-state is unavailable",
  endStateUnsupportedReasonCode: "historical_end_state_unavailable" as const,
  roiStatus: "unsupported" as const,
  roiUnsupportedReason: "ending equity is unavailable for the requested period window",
  roiUnsupportedReasonCode: "ending_equity_unavailable" as const,
  roiStartEquityUsd: 10_000,
  roiEndEquityUsd: undefined,
  roiPct: undefined,
  bySymbol: [
    {
      symbol: "BTCUSDT",
      realizedPnlUsd: 10,
      unrealizedPnlUsd: 0,
      netPnlUsd: 9,
      tradesCount: 2
    }
  ],
  bestSymbols: [
    {
      symbol: "BTCUSDT",
      realizedPnlUsd: 10,
      unrealizedPnlUsd: 0,
      netPnlUsd: 9,
      tradesCount: 2
    }
  ],
  worstSymbols: [
    {
      symbol: "BTCUSDT",
      realizedPnlUsd: 10,
      unrealizedPnlUsd: 0,
      netPnlUsd: 9,
      tradesCount: 2
    }
  ],
  dataCompleteness: {
    state: "partial_critical" as const,
    partial: true,
    warnings: ["Pagination safety limit reached for execution-list"],
    issues: [
      {
        code: "pagination_limit_reached" as const,
        scope: "execution_window" as const,
        severity: "warning" as const,
        criticality: "critical" as const,
        message: "Pagination safety limit reached for execution-list"
      }
    ]
  }
};

const executionService: ExecutionDataService = {
  getPnlReport: async () => partialPnlReport
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

describe("Data completeness sections", () => {
  it("adds fixed data completeness alerts section in pnl report", async () => {
    const generator = new PnLReportGenerator(executionService, accountService);
    const report = await generator.generate(context);

    const section = report.sections.find((item) => item.title === "Data Completeness");
    expect(section?.type).toBe("alerts");
    expect(
      section && section.type === "alerts"
        ? section.alerts.some((alert) => alert.message.includes("pagination_limit_reached"))
        : false
    ).toBe(true);
    expect(report.dataCompleteness?.state).toBe("partial_critical");
  });

  it("adds fixed data completeness alerts section in performance report", async () => {
    const generator = new PerformanceReportGenerator(accountService, executionService);
    const report = await generator.generate(context);

    const section = report.sections.find((item) => item.title === "Data Completeness");
    expect(section?.type).toBe("alerts");
    expect(report.dataCompleteness?.state).toBe("partial_critical");
  });

  it("keeps summary data completeness alerts contract", async () => {
    const generator = new SummaryReportGenerator(accountService, executionService, positionService, botService);
    const report = await generator.generate(context);

    const section = report.sections.find((item) => item.title === "Data Completeness");
    expect(section?.type).toBe("alerts");
    expect(
      section && section.type === "alerts"
        ? section.alerts.some((alert) => alert.message.includes("pagination_limit_reached"))
        : false
    ).toBe(true);
    expect(
      section && section.type === "alerts"
        ? section.alerts.some((alert) => alert.message === "State: partial_critical")
        : false
    ).toBe(true);
    expect(report.dataCompleteness?.state).toBe("partial_critical");
  });
});
