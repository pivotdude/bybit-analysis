import { describe, expect, it } from "bun:test";
import { PerformanceReportGenerator } from "./PerformanceReportGenerator";
import { PnLReportGenerator } from "./PnLReportGenerator";
import { SummaryReportGenerator } from "./SummaryReportGenerator";
import type { AccountDataService, ServiceRequestContext } from "../services/contracts/AccountDataService";
import type { ExecutionDataService } from "../services/contracts/ExecutionDataService";
import type { BotDataService } from "../services/contracts/BotDataService";

const context: ServiceRequestContext = {
  category: "spot",
  futuresGridBotIds: [],
  spotGridBotIds: [],
  from: "2026-01-01T00:00:00.000Z",
  to: "2026-01-31T00:00:00.000Z",
  timeoutMs: 5_000
};

const accountService: AccountDataService = {
  getAccountSnapshot: async () => ({
    source: "bybit",
    exchange: "bybit",
    category: "spot",
    capturedAt: new Date().toISOString(),
    totalEquityUsd: 10_000,
    walletBalanceUsd: 10_000,
    availableBalanceUsd: 10_000,
    unrealizedPnlUsd: 0,
    positions: [],
    balances: [{ asset: "USDT", walletBalance: 10_000, availableBalance: 10_000, usdValue: 10_000 }]
  }),
  checkHealth: async () => ({
    connectivity: "ok",
    auth: "ok",
    latencyMs: 1,
    diagnostics: []
  }),
  getApiKeyPermissionInfo: async () => ({
    readOnly: true,
    ips: [],
    permissions: {}
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
  roiPct: 0.09,
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
    partial: true,
    warnings: ["Pagination safety limit reached for execution-list"]
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
    bots: []
  })
};

describe("Data completeness sections", () => {
  it("adds warning section in pnl report", async () => {
    const generator = new PnLReportGenerator(executionService, accountService);
    const report = await generator.generate(context);

    const section = report.sections.find((item) => item.title === "Data Completeness");
    expect(section?.type).toBe("alerts");
    expect(section?.alerts?.[0]?.severity).toBe("warning");
  });

  it("adds warning section in performance report", async () => {
    const generator = new PerformanceReportGenerator(accountService, executionService);
    const report = await generator.generate(context);

    const section = report.sections.find((item) => item.title === "Data Completeness");
    expect(section?.type).toBe("alerts");
    expect(section?.alerts?.[0]?.severity).toBe("warning");
  });

  it("adds warning section in summary report", async () => {
    const generator = new SummaryReportGenerator(accountService, executionService, botService);
    const report = await generator.generate(context);

    const section = report.sections.find((item) => item.title === "Data Completeness");
    expect(section?.type).toBe("alerts");
    expect(section?.alerts?.[0]?.severity).toBe("warning");
  });
});
