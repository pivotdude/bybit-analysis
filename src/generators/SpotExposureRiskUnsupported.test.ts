import { describe, expect, it } from "bun:test";
import { PositionsReportGenerator } from "./PositionsReportGenerator";
import { ExposureReportGenerator } from "./ExposureReportGenerator";
import { RiskReportGenerator } from "./RiskReportGenerator";
import { SummaryReportGenerator } from "./SummaryReportGenerator";
import type { ServiceRequestContext, AccountDataService } from "../services/contracts/AccountDataService";
import type { PositionDataService } from "../services/contracts/PositionDataService";
import type { ExecutionDataService } from "../services/contracts/ExecutionDataService";
import type { BotDataService } from "../services/contracts/BotDataService";
import {
  buildUnsupportedFeatureIssue,
  completeDataCompleteness,
  degradedDataCompleteness
} from "../services/reliability/dataCompleteness";
import type { ReportDocument, ReportSection } from "../types/report.types";

const context: ServiceRequestContext = {
  category: "spot",
  sourceMode: "market",
  providerContext: { bybit: { botStrategyIds: { futuresGridBotIds: [], spotGridBotIds: [] } } },
  from: "2026-01-01T00:00:00.000Z",
  to: "2026-01-31T00:00:00.000Z",
  timeoutMs: 5_000
};

const unsupportedMessage =
  "Spot market exposure/risk is unsupported: spot balances are not modeled as exposure-bearing positions.";

const unsupportedCompleteness = degradedDataCompleteness([
  buildUnsupportedFeatureIssue({
    scope: "positions",
    message: unsupportedMessage
  })
]);

const positionService: PositionDataService = {
  getOpenPositions: async () => ({
    source: "bybit",
    exchange: "bybit",
    capturedAt: new Date().toISOString(),
    positions: [],
    dataCompleteness: unsupportedCompleteness
  })
};

const linearPositionService: PositionDataService = {
  getOpenPositions: async () => ({
    source: "bybit",
    exchange: "bybit",
    capturedAt: new Date().toISOString(),
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
        quantity: 1,
        entryPrice: 100,
        valuationPrice: 100,
        priceSource: "mark",
        notionalUsd: 100,
        leverage: 1,
        unrealizedPnlUsd: 0,
        updatedAt: new Date().toISOString()
      }
    ],
    dataCompleteness: completeDataCompleteness()
  })
};

const accountService: AccountDataService = {
  getWalletSnapshot: async () => ({
    source: "bybit",
    exchange: "bybit",
    category: "spot",
    capturedAt: new Date().toISOString(),
    totalEquityUsd: 8_000,
    walletBalanceUsd: 8_000,
    availableBalanceUsd: 8_000,
    unrealizedPnlUsd: 0,
    balances: [
      { asset: "USDT", walletBalance: 5_000, availableBalance: 5_000, usdValue: 5_000 },
      { asset: "SOL", walletBalance: 30, availableBalance: 30, usdValue: 3_000 }
    ],
    dataCompleteness: unsupportedCompleteness
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
    periodFrom: context.from,
    periodTo: context.to,
    realizedPnlUsd: 70,
    unrealizedPnlUsd: 0,
    fees: {
      tradingFeesUsd: 5,
      fundingFeesUsd: 0
    },
    netPnlUsd: 65,
    endStateStatus: "unsupported",
    endStateUnsupportedReason: "Historical period end-state is unavailable",
    endStateUnsupportedReasonCode: "historical_end_state_unavailable",
    roiStatus: "unsupported",
    roiUnsupportedReason: "ending equity is unavailable for the requested period window",
    roiUnsupportedReasonCode: "ending_equity_unavailable",
    roiStartEquityUsd: 8_000,
    roiEndEquityUsd: undefined,
    roiPct: undefined,
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
    dataCompleteness: completeDataCompleteness()
  })
};

const botService: BotDataService = {
  getBotReport: async () => ({
    source: "bybit",
    generatedAt: new Date().toISOString(),
    availability: "not_available",
    availabilityReason: "Bot endpoints disabled for this category",
    bots: [],
    dataCompleteness: completeDataCompleteness()
  })
};

function getSection(report: ReportDocument, id: string): ReportSection {
  const section = report.sections.find((item) => item.id === id);
  if (!section) {
    throw new Error(`Missing section: ${id}`);
  }
  return section;
}

describe("Spot exposure/risk fail-closed reports", () => {
  it("renders positions report as unsupported for spot exposure/risk path", async () => {
    const report = await new PositionsReportGenerator(positionService).generate(context);

    const sideSplit = getSection(report, "positions.side_split");
    const alerts = getSection(report, "positions.alerts");
    expect(sideSplit.type).toBe("kpi");
    expect(sideSplit.type === "kpi" ? sideSplit.kpis[0]?.value : undefined).toBe("unsupported");
    expect(alerts.type).toBe("alerts");
    expect(alerts.type === "alerts" ? alerts.alerts.some((item) => item.message.includes("unsupported")) : false).toBe(
      true
    );
    expect(report.dataCompleteness?.issues[0]?.code).toBe("unsupported_feature");
  });

  it("renders exposure report as unsupported for spot exposure/risk path", async () => {
    const report = await new ExposureReportGenerator(positionService).generate(context);

    const overview = getSection(report, "exposure.overview");
    const perAsset = getSection(report, "exposure.per_asset");
    expect(overview.type).toBe("kpi");
    expect(overview.type === "kpi" ? overview.kpis[2]?.value : undefined).toBe("unsupported");
    expect(perAsset.type).toBe("table");
    expect(perAsset.type === "table" ? perAsset.table.rows[0]?.[5] : undefined).toContain("unsupported");
    expect(report.dataCompleteness?.issues[0]?.code).toBe("unsupported_feature");
  });

  it("renders risk report as unsupported for spot exposure/risk path", async () => {
    const report = await new RiskReportGenerator(accountService, positionService).generate(context);

    const overview = getSection(report, "risk.overview");
    const alerts = getSection(report, "risk.alerts");
    expect(overview.type).toBe("kpi");
    expect(overview.type === "kpi" ? overview.kpis[2]?.value : undefined).toBe("unsupported");
    expect(alerts.type).toBe("alerts");
    expect(alerts.type === "alerts" ? alerts.alerts.some((item) => item.message.includes("unsupported")) : false).toBe(
      true
    );
    expect(report.dataCompleteness?.issues[0]?.code).toBe("unsupported_feature");
  });

  it("does not propagate ROI-only equity-history unsupported issue into risk data completeness", async () => {
    const roiOnlyAccountService: AccountDataService = {
      getWalletSnapshot: async () => ({
        source: "bybit",
        exchange: "bybit",
        category: "linear",
        capturedAt: new Date().toISOString(),
        totalEquityUsd: 8_000,
        walletBalanceUsd: 8_000,
        availableBalanceUsd: 8_000,
        unrealizedPnlUsd: 0,
        balances: [{ asset: "USDT", walletBalance: 8_000, availableBalance: 8_000, usdValue: 8_000 }],
        dataCompleteness: degradedDataCompleteness([
          buildUnsupportedFeatureIssue({
            scope: "equity_history",
            message: "ROI and capital efficiency are unsupported: historical equity source is unavailable."
          })
        ])
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

    const report = await new RiskReportGenerator(roiOnlyAccountService, linearPositionService).generate({
      ...context,
      category: "linear"
    });

    const overview = getSection(report, "risk.overview");
    expect(overview.type).toBe("kpi");
    expect(overview.type === "kpi" ? overview.kpis[0]?.value : undefined).not.toBe("unsupported");
    expect(report.dataCompleteness?.state).toBe("complete");
    expect(report.dataCompleteness?.issues).toHaveLength(0);
  });

  it("renders summary report with unsupported exposure/risk instead of zero metrics", async () => {
    const report = await new SummaryReportGenerator(accountService, executionService, positionService, botService).generate(
      context
    );

    const overview = getSection(report, "summary.overview");
    const risk = getSection(report, "summary.risk");
    const alerts = getSection(report, "summary.alerts");
    const openPositions = getSection(report, "summary.open_positions");

    expect(overview.type).toBe("kpi");
    expect(overview.type === "kpi" ? overview.kpis[4]?.value : undefined).toBe("unsupported");
    expect(risk.type).toBe("kpi");
    expect(risk.type === "kpi" ? risk.kpis[0]?.value : undefined).toBe("unsupported");
    expect(alerts.type).toBe("alerts");
    expect(alerts.type === "alerts" ? alerts.alerts.some((item) => item.message.includes("unsupported")) : false).toBe(
      true
    );
    expect(openPositions.type).toBe("table");
    expect(openPositions.type === "table" ? openPositions.table.headers : []).toEqual([
      "Symbol",
      "Side",
      "Notional",
      "UPnL",
      "Leverage",
      "Price Source"
    ]);
    expect(openPositions.type === "table" ? openPositions.table.rows : []).toHaveLength(0);
    expect(openPositions.type === "table" ? openPositions.table.emptyMessage : undefined).toContain("unsupported");
    expect(openPositions.type === "table" ? openPositions.table.emptyMode : undefined).toBeUndefined();
    expect(report.dataCompleteness?.issues.some((issue) => issue.code === "unsupported_feature")).toBe(false);
  });
});
