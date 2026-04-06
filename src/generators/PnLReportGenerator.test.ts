import { describe, expect, it } from "bun:test";
import { PnLReportGenerator } from "./PnLReportGenerator";
import { normalizeRoi } from "../services/normalizers/roi.normalizer";
import type { AccountDataService, ServiceRequestContext } from "../services/contracts/AccountDataService";
import type { ExecutionDataService } from "../services/contracts/ExecutionDataService";

const context: ServiceRequestContext = {
  category: "linear",
  sourceMode: "market",
  providerContext: { bybit: { botStrategyIds: { futuresGridBotIds: [], spotGridBotIds: [] } } },
  from: "2026-01-01T00:00:00.000Z",
  to: "2026-01-31T00:00:00.000Z",
  timeoutMs: 5_000
};

function createAccountService(overrides: Partial<Awaited<ReturnType<AccountDataService["getWalletSnapshot"]>>> = {}): AccountDataService {
  return {
    getWalletSnapshot: async () => ({
      source: "bybit",
      exchange: "bybit",
      category: "linear",
      capturedAt: new Date().toISOString(),
      totalEquityUsd: 1_100,
      walletBalanceUsd: 1_100,
      availableBalanceUsd: 1_100,
      unrealizedPnlUsd: 0,
      equityHistory: [
        {
          timestamp: "2025-12-31T00:00:00.000Z",
          totalEquityUsd: 900,
          totalExposureUsd: 900,
          grossExposureUsd: 900,
          netExposureUsd: 900
        },
        {
          timestamp: "2026-01-01T00:00:00.000Z",
          totalEquityUsd: 1_000,
          totalExposureUsd: 1_000,
          grossExposureUsd: 1_000,
          netExposureUsd: 1_000
        }
      ],
      balances: [],
      dataCompleteness: {
        state: "complete",
        partial: false,
        warnings: [],
        issues: []
      },
      ...overrides
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

describe("PnLReportGenerator", () => {
  it("does not use live wallet state as the historical period end-state", async () => {
    let passedStartEquity: number | undefined;
    let passedEndingState = undefined as Parameters<ExecutionDataService["getPnlReport"]>[0]["endingState"];

    const executionService: ExecutionDataService = {
      getPnlReport: async (request) => {
        passedStartEquity = request.equityStartUsd;
        passedEndingState = request.endingState;

        return {
          source: "bybit",
          generatedAt: new Date().toISOString(),
          periodFrom: context.from,
          periodTo: context.to,
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

    const generator = new PnLReportGenerator(executionService, createAccountService());
    const report = await generator.generate(context);
    const summary = report.sections.find((section) => section.title === "PnL Summary");
    const roiStatus = report.sections.find((section) => section.title === "ROI Status");

    expect(passedStartEquity).toBe(1_000);
    expect(passedEndingState).toBeUndefined();
    expect(summary?.type).toBe("kpi");
    expect(summary && summary.type === "kpi" ? summary.kpis.find((kpi) => kpi.label === "ROI") : undefined).toBeUndefined();
    expect(roiStatus).toBeUndefined();
  });

  it("renders unsupported ROI with explicit reason when starting equity is unavailable", async () => {
    let passedStartEquity: number | undefined;
    let passedEndingState = undefined as Parameters<ExecutionDataService["getPnlReport"]>[0]["endingState"];

    const executionService: ExecutionDataService = {
      getPnlReport: async (request) => {
        passedStartEquity = request.equityStartUsd;
        passedEndingState = request.endingState;

        return {
          source: "bybit",
          generatedAt: new Date().toISOString(),
          periodFrom: context.from,
          periodTo: context.to,
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

    const accountService = createAccountService({ equityHistory: undefined });
    const generator = new PnLReportGenerator(executionService, accountService);
    const report = await generator.generate(context);
    const summary = report.sections.find((section) => section.title === "PnL Summary");
    const roiStatus = report.sections.find((section) => section.title === "ROI Status");

    expect(passedStartEquity).toBeUndefined();
    expect(passedEndingState).toBeUndefined();
    expect(summary?.type).toBe("kpi");
    expect(summary && summary.type === "kpi" ? summary.kpis.find((kpi) => kpi.label === "ROI") : undefined).toBeUndefined();
    expect(roiStatus).toBeUndefined();
  });

  it("does not propagate spot exposure/risk unsupported issue into pnl data completeness", async () => {
    const executionService: ExecutionDataService = {
      getPnlReport: async () => ({
        source: "bybit",
        generatedAt: new Date().toISOString(),
        periodFrom: context.from,
        periodTo: context.to,
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
          equityStartUsd: 1_000,
          equityEndUsd: undefined
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
      })
    };

    const accountService = createAccountService({
      category: "spot",
      dataCompleteness: {
        state: "unsupported",
        partial: true,
        warnings: ["Spot market exposure/risk is unsupported."],
        issues: [
          {
            code: "unsupported_feature",
            scope: "positions",
            severity: "critical",
            criticality: "critical",
            message: "Spot market exposure/risk is unsupported."
          }
        ]
      }
    });

    const report = await new PnLReportGenerator(executionService, accountService).generate({
      ...context,
      category: "spot"
    });

    expect(report.dataCompleteness?.state).toBe("complete");
    expect(report.dataCompleteness?.issues).toHaveLength(0);
  });

  it("uses realized-only symbol columns in market mode and buckets winners/losers truthfully", async () => {
    const executionService: ExecutionDataService = {
      getPnlReport: async () => ({
        source: "bybit",
        generatedAt: new Date().toISOString(),
        periodFrom: context.from,
        periodTo: context.to,
        realizedPnlUsd: -30,
        unrealizedPnlUsd: 0,
        fees: {
          tradingFeesUsd: 0,
          fundingFeesUsd: 0
        },
        netPnlUsd: -30,
        endStateStatus: "unsupported",
        endStateUnsupportedReason: "Historical period end-state is unavailable",
        endStateUnsupportedReasonCode: "historical_end_state_unavailable",
        ...normalizeRoi({
          equityStartUsd: 1_000,
          equityEndUsd: undefined
        }),
        bySymbol: [
          {
            symbol: "SOLUSDT",
            realizedPnlUsd: -10,
            netPnlUsd: -10,
            tradesCount: 2
          },
          {
            symbol: "BTCUSDT",
            realizedPnlUsd: -20,
            netPnlUsd: -20,
            tradesCount: 4
          }
        ],
        bestSymbols: [
          {
            symbol: "SOLUSDT",
            realizedPnlUsd: -10,
            netPnlUsd: -10,
            tradesCount: 2
          }
        ],
        worstSymbols: [
          {
            symbol: "BTCUSDT",
            realizedPnlUsd: -20,
            netPnlUsd: -20,
            tradesCount: 4
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

    const report = await new PnLReportGenerator(executionService, createAccountService()).generate(context);
    const symbolBreakdown = report.sections.find((section) => section.id === "pnl.symbol_breakdown");
    const winnersLosers = report.sections.find((section) => section.id === "pnl.winners_losers");

    expect(symbolBreakdown?.type).toBe("table");
    expect(symbolBreakdown && symbolBreakdown.type === "table" ? symbolBreakdown.table.headers : []).toEqual([
      "Symbol",
      "Realized",
      "Realized Net",
      "Trades"
    ]);
    expect(winnersLosers?.type).toBe("table");
    expect(winnersLosers && winnersLosers.type === "table" ? winnersLosers.table.headers[2] : undefined).toBe(
      "Realized Net PnL"
    );
    expect(winnersLosers && winnersLosers.type === "table" ? winnersLosers.table.rows[0] : []).toEqual([
      "Winner",
      "-",
      "No winning symbols in period"
    ]);
    expect(winnersLosers && winnersLosers.type === "table" ? winnersLosers.table.rows[1] : []).toEqual([
      "Loser",
      "BTCUSDT",
      "-$20.00"
    ]);
  });
});
