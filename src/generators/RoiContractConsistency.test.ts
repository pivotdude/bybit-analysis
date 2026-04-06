import { describe, expect, it } from "bun:test";
import { normalizeRoi } from "../services/normalizers/roi.normalizer";
import { PnLReportGenerator } from "./PnLReportGenerator";
import { PerformanceReportGenerator } from "./PerformanceReportGenerator";
import { SummaryReportGenerator } from "./SummaryReportGenerator";
import type { AccountDataService, ServiceRequestContext } from "../services/contracts/AccountDataService";
import type { ExecutionDataService, GetPnlReportRequest } from "../services/contracts/ExecutionDataService";
import type { BotDataService } from "../services/contracts/BotDataService";
import type { PositionDataService } from "../services/contracts/PositionDataService";
import type { ReportDocument } from "../types/report.types";

const context: ServiceRequestContext = {
  category: "linear",
  sourceMode: "market",
  providerContext: { bybit: { botStrategyIds: { futuresGridBotIds: [], spotGridBotIds: [] } } },
  from: "2026-01-01T00:00:00.000Z",
  to: "2026-01-31T00:00:00.000Z",
  timeoutMs: 5_000
};

function createAccountService(withHistory: boolean): AccountDataService {
  return {
    getWalletSnapshot: async () => ({
      source: "bybit",
      exchange: "bybit",
      category: "linear",
      capturedAt: "2026-01-31T00:00:00.000Z",
      totalEquityUsd: 1_100,
      walletBalanceUsd: 1_100,
      availableBalanceUsd: 1_100,
      unrealizedPnlUsd: 0,
      equityHistory: withHistory
        ? [
            {
              timestamp: "2025-12-31T00:00:00.000Z",
              totalEquityUsd: 950,
              totalExposureUsd: 950,
              grossExposureUsd: 950,
              netExposureUsd: 950
            },
            {
              timestamp: "2026-01-01T00:00:00.000Z",
              totalEquityUsd: 1_000,
              totalExposureUsd: 1_000,
              grossExposureUsd: 1_000,
              netExposureUsd: 1_000
            }
          ]
        : undefined,
      balances: [{ asset: "USDT", walletBalance: 1_100, availableBalance: 1_100, usdValue: 1_100 }],
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
}

const botService: BotDataService = {
  getBotReport: async () => ({
    source: "bybit",
    generatedAt: "2026-01-31T00:00:00.000Z",
    availability: "not_available",
    availabilityReason: "Not requested",
    bots: [],
    dataCompleteness: {
      state: "complete",
      partial: false,
      warnings: [],
      issues: []
    }
  })
};

const positionService: PositionDataService = {
  getOpenPositions: async () => ({
    source: "bybit",
    exchange: "bybit",
    capturedAt: "2026-01-31T00:00:00.000Z",
    positions: [],
    dataCompleteness: {
      state: "complete",
      partial: false,
      warnings: [],
      issues: []
    }
  })
};

function createExecutionService(requests: GetPnlReportRequest[]): ExecutionDataService {
  return {
    getPnlReport: async (request) => {
      requests.push(request);
      return {
        source: "bybit",
        generatedAt: "2026-01-31T00:00:00.000Z",
        periodFrom: request.context.from,
        periodTo: request.context.to,
        realizedPnlUsd: 100,
        unrealizedPnlUsd: 0,
        fees: {
          tradingFeesUsd: 0,
          fundingFeesUsd: 0
        },
        netPnlUsd: 100,
        endStateStatus: "unsupported",
        endStateUnsupportedReason: "Historical period end-state is unavailable",
        endStateUnsupportedReasonCode: "historical_end_state_unavailable",
        ...normalizeRoi({
          equityStartUsd: request.equityStartUsd,
          equityEndUsd: request.endingState?.totalEquityUsd,
          missingStartReason: request.roiMissingStartReason,
          missingStartReasonCode: request.roiMissingStartReasonCode
        }),
        bySymbol: [],
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
  };
}

function findKpi(report: ReportDocument, sectionTitle: string, label: string): string | undefined {
  const section = report.sections.find((item) => item.title === sectionTitle);
  if (!section || section.type !== "kpi") {
    return undefined;
  }

  return section.kpis.find((kpi) => kpi.label === label)?.value;
}

describe("ROI contract consistency across commands", () => {
  it("keeps ROI unsupported and equal across pnl, performance, summary when end-state is unavailable", async () => {
    const requests: GetPnlReportRequest[] = [];
    const executionService = createExecutionService(requests);
    const accountService = createAccountService(true);

    const pnlReport = await new PnLReportGenerator(executionService, accountService).generate(context);
    const performanceReport = await new PerformanceReportGenerator(accountService, executionService).generate(context);
    const summaryReport = await new SummaryReportGenerator(accountService, executionService, positionService, botService).generate(
      context
    );

    const pnlRoi = findKpi(pnlReport, "PnL Summary", "ROI");
    const perfRoi = findKpi(performanceReport, "ROI", "ROI");
    const summaryRoi = findKpi(summaryReport, "Overview", "ROI");

    expect(requests).toHaveLength(3);
    expect(requests.map((request) => request.equityStartUsd)).toEqual([1_000, 1_000, 1_000]);
    expect(requests.map((request) => request.endingState)).toEqual([undefined, undefined, undefined]);
    expect(pnlRoi).toBeUndefined();
    expect(perfRoi).toBeUndefined();
    expect(summaryRoi).toBe("unsupported");
  });

  it("keeps ROI unsupported and equal across pnl, performance, summary", async () => {
    const requests: GetPnlReportRequest[] = [];
    const executionService = createExecutionService(requests);
    const accountService = createAccountService(false);

    const pnlReport = await new PnLReportGenerator(executionService, accountService).generate(context);
    const performanceReport = await new PerformanceReportGenerator(accountService, executionService).generate(context);
    const summaryReport = await new SummaryReportGenerator(accountService, executionService, positionService, botService).generate(
      context
    );

    const pnlRoi = findKpi(pnlReport, "PnL Summary", "ROI");
    const perfRoi = findKpi(performanceReport, "ROI", "ROI");
    const summaryRoi = findKpi(summaryReport, "Overview", "ROI");

    expect(requests).toHaveLength(3);
    expect(requests.map((request) => request.equityStartUsd)).toEqual([undefined, undefined, undefined]);
    expect(requests.map((request) => request.roiMissingStartReasonCode)).toEqual([
      "equity_history_unavailable",
      "equity_history_unavailable",
      "equity_history_unavailable"
    ]);
    expect(pnlRoi).toBeUndefined();
    expect(perfRoi).toBeUndefined();
    expect(summaryRoi).toBe("unsupported");

    const perfInterpretation = performanceReport.sections.find((section) => section.title === "Interpretation");
    const summaryContract = summaryReport.sections.find((section) => section.title === "Summary Contract");

    // PnL no longer shows ROI status when unsupported
    const pnlRoiStatusSection = pnlReport.sections.find((section) => section.title === "ROI Status");
    expect(pnlRoiStatusSection).toBeUndefined();

    expect(perfInterpretation?.type).toBe("text");
    expect(perfInterpretation && perfInterpretation.type === "text" ? perfInterpretation.text : []).toContain(
      "ROI status: unsupported"
    );
    expect(perfInterpretation && perfInterpretation.type === "text" ? perfInterpretation.text : []).toContain(
      "ROI unsupported code: equity_history_unavailable"
    );

    expect(summaryContract?.type).toBe("text");
    expect(summaryContract && summaryContract.type === "text" ? summaryContract.text : []).toContain(
      "ROI status: unsupported"
    );
    expect(summaryContract && summaryContract.type === "text" ? summaryContract.text : []).toContain(
      "ROI unsupported code: equity_history_unavailable"
    );
  });
});
