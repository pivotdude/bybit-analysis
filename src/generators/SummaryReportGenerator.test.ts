import { describe, expect, it } from "bun:test";
import { SummaryReportGenerator } from "./SummaryReportGenerator";
import type { AccountDataService, ServiceRequestContext } from "../services/contracts/AccountDataService";
import type { ExecutionDataService } from "../services/contracts/ExecutionDataService";
import type { BotDataService } from "../services/contracts/BotDataService";
import type { PositionDataService } from "../services/contracts/PositionDataService";
import type { ReportSection } from "../types/report.types";

const linearContext: ServiceRequestContext = {
  category: "linear",
  sourceMode: "market",
  providerContext: { bybit: { botStrategyIds: { futuresGridBotIds: [], spotGridBotIds: [] } } },
  from: "2026-01-01T00:00:00.000Z",
  to: "2026-01-31T00:00:00.000Z",
  timeoutMs: 5_000
};

const botContext: ServiceRequestContext = {
  ...linearContext,
  sourceMode: "bot",
  providerContext: { bybit: { botStrategyIds: { futuresGridBotIds: ["fgrid-1"], spotGridBotIds: [] } } }
};

const positionsResult = {
  source: "bybit" as const,
  exchange: "bybit" as const,
  capturedAt: new Date().toISOString(),
  positions: [
    {
      source: "bybit" as const,
      exchange: "bybit" as const,
      category: "linear" as const,
      symbol: "BTCUSDT",
      baseAsset: "BTC",
      quoteAsset: "USDT",
      side: "long" as const,
      marginMode: "cross" as const,
      quantity: 0.2,
      entryPrice: 99_000,
      valuationPrice: 100_000,
      priceSource: "mark" as const,
      notionalUsd: 20_000,
      leverage: 2,
      unrealizedPnlUsd: 100,
      updatedAt: new Date().toISOString()
    }
  ],
  dataCompleteness: {
    state: "complete" as const,
    partial: false,
    warnings: [],
    issues: []
  }
};

const accountService: AccountDataService = {
  getWalletSnapshot: async () => ({
    source: "bybit",
    exchange: "bybit",
    category: "linear",
    capturedAt: new Date().toISOString(),
    totalEquityUsd: 20_000,
    walletBalanceUsd: 21_000,
    availableBalanceUsd: 19_000,
    unrealizedPnlUsd: 100,
    balances: [{ asset: "USDT", walletBalance: 21_000, availableBalance: 19_000, usdValue: 21_000 }],
    dataCompleteness: {
      state: "complete",
      partial: false,
      warnings: [],
      issues: []
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
  getOpenPositions: async () => positionsResult
};

const executionService: ExecutionDataService = {
  getPnlReport: async () => ({
    source: "bybit",
    generatedAt: new Date().toISOString(),
    periodFrom: linearContext.from,
    periodTo: linearContext.to,
    realizedPnlUsd: 1_200,
    unrealizedPnlUsd: 100,
    fees: {
      tradingFeesUsd: 50,
      fundingFeesUsd: 5
    },
    netPnlUsd: 1_145,
    endStateStatus: "unsupported",
    endStateUnsupportedReason: "Historical period end-state is unavailable",
    endStateUnsupportedReasonCode: "historical_end_state_unavailable",
    roiStatus: "unsupported",
    roiUnsupportedReason: "ending equity is unavailable for the requested period window",
    roiUnsupportedReasonCode: "ending_equity_unavailable",
    roiStartEquityUsd: 20_000,
    roiEndEquityUsd: undefined,
    roiPct: undefined,
    bySymbol: [
      {
        symbol: "BTCUSDT",
        realizedPnlUsd: 1_200,
        unrealizedPnlUsd: 100,
        netPnlUsd: 1_145,
        tradesCount: 12
      }
    ],
    bestSymbols: [
      {
        symbol: "BTCUSDT",
        realizedPnlUsd: 1_200,
        unrealizedPnlUsd: 100,
        netPnlUsd: 1_145,
        tradesCount: 12
      }
    ],
    worstSymbols: [
      {
        symbol: "BTCUSDT",
        realizedPnlUsd: 1_200,
        unrealizedPnlUsd: 100,
        netPnlUsd: 1_145,
        tradesCount: 12
      }
    ],
    dataCompleteness: {
      state: "complete",
      partial: false,
      warnings: [],
      issues: []
    }
  })
};

const availableBotService: BotDataService = {
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

const failingBotService: BotDataService = {
  getBotReport: async () => {
    throw new Error("bot endpoint unavailable");
  }
};

function assertSectionSchema(section: ReportSection): void {
  expect(typeof section.title).toBe("string");
  expect(section.title.length).toBeGreaterThan(0);

  if (section.type === "kpi") {
    expect(section.kpis).toBeDefined();
    expect(section.kpis!.length).toBeGreaterThan(0);
    for (const kpi of section.kpis ?? []) {
      expect(typeof kpi.label).toBe("string");
      expect(kpi.label.length).toBeGreaterThan(0);
      expect(typeof kpi.value).toBe("string");
      expect(kpi.value.length).toBeGreaterThan(0);
    }
  }

  if (section.type === "table") {
    expect(section.table).toBeDefined();
    expect(section.table!.headers.length).toBeGreaterThan(0);
    for (const row of section.table?.rows ?? []) {
      expect(row.length).toBe(section.table!.headers.length);
    }
  }

  if (section.type === "alerts") {
    expect(section.alerts).toBeDefined();
    expect(section.alerts!.length).toBeGreaterThan(0);
    for (const alert of section.alerts ?? []) {
      expect(["info", "warning", "critical"]).toContain(alert.severity);
      expect(alert.message.length).toBeGreaterThan(0);
    }
  }

  if (section.type === "text") {
    expect(section.text).toBeDefined();
    expect(section.text!.length).toBeGreaterThan(0);
  }
}

describe("SummaryReportGenerator", () => {
  it("returns a schema-valid summary report document", async () => {
    const generator = new SummaryReportGenerator(accountService, executionService, positionService, availableBotService);

    const report = await generator.generate(linearContext);

    expect(report.command).toBe("summary");
    expect(report.title).toBe("Account Summary");
    expect(Number.isNaN(Date.parse(report.generatedAt))).toBe(false);
    expect(report.sections.length).toBeGreaterThan(0);
    expect(report.sections.some((section) => section.title === "Overview")).toBe(true);
    expect(report.sections.some((section) => section.title === "Risk")).toBe(true);
    expect(report.schemaVersion).toBe("summary-markdown-v1");

    for (const section of report.sections) {
      assertSectionSchema(section);
    }
  });

  it("continues generating linear summary when optional bot report fetch fails", async () => {
    const generator = new SummaryReportGenerator(accountService, executionService, positionService, failingBotService);

    const report = await generator.generate(linearContext);
    const alertsSection = report.sections.find((section) => section.type === "alerts" && section.title === "Alerts");
    const botsSection = report.sections.find((section) => section.id === "summary.bots");

    expect(report.command).toBe("summary");
    expect(report.sections.some((section) => section.title === "Overview")).toBe(true);
    expect(report.dataCompleteness?.state).toBe("partial_optional");
    expect(
      alertsSection && alertsSection.type === "alerts"
        ? alertsSection.alerts.some((alert) => alert.message.includes("bot endpoint unavailable"))
        : false
    ).toBe(true);
    expect(
      report.dataCompleteness?.issues.some(
        (issue) =>
          issue.scope === "bots" &&
          issue.code === "optional_item_failed" &&
          issue.message.includes("bot endpoint unavailable")
      ) ?? false
    ).toBe(true);
    expect(botsSection?.type).toBe("table");
    expect(botsSection && botsSection.type === "table" ? botsSection.table.headers : []).toEqual([
      "Bot",
      "Status",
      "Allocated",
      "Exposure",
      "Realized",
      "Unrealized",
      "ROI"
    ]);
    expect(botsSection && botsSection.type === "table" ? botsSection.table.rows : []).toEqual([]);
    expect(botsSection && botsSection.type === "table" ? botsSection.table.emptyMessage : undefined).toContain(
      "bot endpoint unavailable"
    );
    expect(botsSection && botsSection.type === "table" ? botsSection.table.emptyMode : undefined).toBeUndefined();
  });

  it("fails summary generation when bot report fetch fails for bot source mode", async () => {
    const generator = new SummaryReportGenerator(accountService, executionService, positionService, failingBotService);

    await expect(generator.generate(botContext)).rejects.toThrow("bot endpoint unavailable");
  });

  it("does not infer holdings from bot metadata when token balances are unavailable", async () => {
    const accountServiceWithoutTokenBalances: AccountDataService = {
      ...accountService,
      getWalletSnapshot: async () => ({
        source: "bybit",
        exchange: "bybit",
        category: "linear",
        capturedAt: new Date().toISOString(),
        totalEquityUsd: 12_000,
        walletBalanceUsd: 12_000,
        availableBalanceUsd: 9_500,
        unrealizedPnlUsd: 0,
        balances: [],
        dataCompleteness: {
          state: "complete",
          partial: false,
          warnings: [],
          issues: []
        }
      })
    };

    const generator = new SummaryReportGenerator(
      accountServiceWithoutTokenBalances,
      executionService,
      positionService,
      availableBotService
    );
    const report = await generator.generate(botContext);

    const allocation = report.sections.find((section) => section.id === "summary.allocation");
    const holdings = report.sections.find((section) => section.id === "summary.top_holdings");

    expect(allocation?.type).toBe("kpi");
    expect(allocation && allocation.type === "kpi" ? allocation.kpis[0]?.value : undefined).toBe("$0.00");
    expect(allocation && allocation.type === "kpi" ? allocation.kpis[1]?.value : undefined).toBe("$12,000.00");
    expect(allocation && allocation.type === "kpi" ? allocation.kpis[4]?.value : undefined).toBe("N/A");

    expect(holdings?.type).toBe("table");
    expect(holdings && holdings.type === "table" ? holdings.table.rows : []).toEqual([]);
  });

  it("uses a consistent symbol pnl table schema", async () => {
    const generator = new SummaryReportGenerator(accountService, executionService, positionService, availableBotService);
    const report = await generator.generate(linearContext);
    const symbolPnl = report.sections.find((section) => section.id === "summary.symbol_pnl");

    expect(symbolPnl?.type).toBe("table");
    expect(symbolPnl && symbolPnl.type === "table" ? symbolPnl.table.headers : []).toEqual([
      "Symbol",
      "Realized",
      "Unrealized",
      "Net",
      "Trades"
    ]);
  });

  it("uses bot-oriented overview and activity KPIs in bot mode", async () => {
    const generator = new SummaryReportGenerator(accountService, executionService, positionService, availableBotService);
    const report = await generator.generate(botContext);
    const overview = report.sections.find((section) => section.id === "summary.overview");
    const activity = report.sections.find((section) => section.id === "summary.activity");

    expect(overview?.type).toBe("kpi");
    expect(overview && overview.type === "kpi" ? overview.kpis.map((item) => item.label) : []).toEqual([
      "Wallet Equity",
      "Bot Allocated",
      "Bot Exposure",
      "Bot Net PnL",
      "Tracked Bots",
      "ROI"
    ]);

    expect(activity?.type).toBe("kpi");
    expect(activity && activity.type === "kpi" ? activity.kpis.map((item) => item.label) : []).toEqual([
      "Tracked Symbols",
      "Running Bots",
      "Bots in Profit",
      "Bots in Loss",
      "Open Positions",
      "Bot Win Rate"
    ]);
  });

  it("shows spot limitation once while keeping summary completeness complete", async () => {
    const limitationReason = "Spot positions are unavailable for this account/category.";
    const limitationMessage = `Spot limitation: ${limitationReason}`;
    const spotPositionService: PositionDataService = {
      getOpenPositions: async () => ({
        ...positionsResult,
        positions: [],
        dataCompleteness: {
          state: "unsupported",
          partial: true,
          warnings: [limitationReason],
          issues: [
            {
              code: "unsupported_feature",
              scope: "positions",
              severity: "critical",
              criticality: "critical",
              message: limitationReason
            }
          ]
        }
      })
    };
    const generator = new SummaryReportGenerator(accountService, executionService, spotPositionService, availableBotService);
    const report = await generator.generate({ ...linearContext, category: "spot" });
    const contract = report.sections.find((section) => section.id === "summary.contract");
    const alerts = report.sections.find((section) => section.id === "summary.alerts");
    const dataCompleteness = report.sections.find((section) => section.id === "summary.data_completeness");

    expect(report.dataCompleteness?.state).toBe("complete");

    expect(contract?.type).toBe("text");
    expect(contract && contract.type === "text" ? contract.text.includes(limitationMessage) : false).toBe(true);

    expect(alerts?.type).toBe("alerts");
    expect(alerts && alerts.type === "alerts"
      ? alerts.alerts.some((alert) => alert.message === limitationMessage)
      : false).toBe(false);

    expect(dataCompleteness?.type).toBe("alerts");
    expect(dataCompleteness && dataCompleteness.type === "alerts"
      ? dataCompleteness.alerts.some((alert) => alert.message === limitationMessage)
      : false).toBe(false);
    expect(dataCompleteness && dataCompleteness.type === "alerts"
      ? dataCompleteness.alerts.some((alert) => alert.message === "State: complete")
      : false).toBe(true);
  });
});
