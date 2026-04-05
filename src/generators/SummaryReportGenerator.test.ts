import { describe, expect, it } from "bun:test";
import { SummaryReportGenerator } from "./SummaryReportGenerator";
import type { AccountDataService, ServiceRequestContext } from "../services/contracts/AccountDataService";
import type { ExecutionDataService } from "../services/contracts/ExecutionDataService";
import type { BotDataService } from "../services/contracts/BotDataService";
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

const accountService: AccountDataService = {
  getAccountSnapshot: async () => ({
    source: "bybit",
    exchange: "bybit",
    category: "linear",
    capturedAt: new Date().toISOString(),
    totalEquityUsd: 20_000,
    walletBalanceUsd: 21_000,
    availableBalanceUsd: 19_000,
    unrealizedPnlUsd: 100,
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
        quantity: 0.2,
        entryPrice: 99_000,
        valuationPrice: 100_000,
        priceSource: "mark",
        notionalUsd: 20_000,
        leverage: 2,
        unrealizedPnlUsd: 100,
        updatedAt: new Date().toISOString()
      }
    ],
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
    roiStatus: "supported",
    roiUnsupportedReason: undefined,
    roiStartEquityUsd: 20_000,
    roiEndEquityUsd: 21_145,
    roiPct: 5.725,
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
    const generator = new SummaryReportGenerator(accountService, executionService, availableBotService);

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
    const generator = new SummaryReportGenerator(accountService, executionService, failingBotService);

    const report = await generator.generate(linearContext);
    const alertsSection = report.sections.find((section) => section.type === "alerts" && section.title === "Alerts");

    expect(report.command).toBe("summary");
    expect(report.sections.some((section) => section.title === "Overview")).toBe(true);
    expect(report.dataCompleteness?.state).toBe("degraded");
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
  });

  it("fails summary generation when bot report fetch fails for bot source mode", async () => {
    const generator = new SummaryReportGenerator(accountService, executionService, failingBotService);

    await expect(generator.generate(botContext)).rejects.toThrow("bot endpoint unavailable");
  });

  it("uses bot capital as holdings fallback when token balances are unavailable", async () => {
    const accountServiceWithoutTokenBalances: AccountDataService = {
      ...accountService,
      getAccountSnapshot: async () => ({
        source: "bybit",
        exchange: "bybit",
        category: "linear",
        capturedAt: new Date().toISOString(),
        totalEquityUsd: 12_000,
        walletBalanceUsd: 12_000,
        availableBalanceUsd: 9_500,
        unrealizedPnlUsd: 0,
        positions: [],
        balances: [],
        botCapital: [{ asset: "USDT", allocatedCapitalUsd: 12_000, availableBalanceUsd: 9_500, equityUsd: 12_000 }],
        dataCompleteness: {
          state: "complete",
          partial: false,
          warnings: [],
          issues: []
        }
      })
    };

    const generator = new SummaryReportGenerator(accountServiceWithoutTokenBalances, executionService, availableBotService);
    const report = await generator.generate(botContext);

    const allocation = report.sections.find((section) => section.id === "summary.allocation");
    const holdings = report.sections.find((section) => section.id === "summary.top_holdings");

    expect(allocation?.type).toBe("kpi");
    expect(allocation && allocation.type === "kpi" ? allocation.kpis[0]?.value : undefined).toBe("$12,000.00");
    expect(allocation && allocation.type === "kpi" ? allocation.kpis[4]?.value : undefined).toBe("USDT (100.00%)");

    expect(holdings?.type).toBe("table");
    expect(holdings && holdings.type === "table" ? holdings.table.rows[0] : []).toEqual([
      "USDT",
      "$12,000.00",
      "100.00%"
    ]);
  });
});
