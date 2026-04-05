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

function createAccountService(overrides: Partial<Awaited<ReturnType<AccountDataService["getAccountSnapshot"]>>> = {}): AccountDataService {
  return {
    getAccountSnapshot: async () => ({
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
      positions: [],
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
  it("passes starting equity from account equity history and renders supported ROI", async () => {
    let passedStartEquity: number | undefined;
    let passedEndEquity: number | undefined;

    const executionService: ExecutionDataService = {
      getPnlReport: async (request) => {
        passedStartEquity = request.equityStartUsd;
        passedEndEquity = request.equityEndUsd;

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
          ...normalizeRoi({
            equityStartUsd: request.equityStartUsd,
            equityEndUsd: request.equityEndUsd,
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
    expect(passedEndEquity).toBe(1_100);
    expect(summary?.type).toBe("kpi");
    expect(summary && summary.type === "kpi" ? summary.kpis.find((kpi) => kpi.label === "ROI")?.value : undefined).toBe(
      "10.00%"
    );
    expect(roiStatus?.type).toBe("text");
    expect(roiStatus && roiStatus.type === "text" ? roiStatus.text[0] : undefined).toBe("Status: supported");
  });

  it("renders unsupported ROI with explicit reason when starting equity is unavailable", async () => {
    let passedStartEquity: number | undefined;
    let passedEndEquity: number | undefined;

    const executionService: ExecutionDataService = {
      getPnlReport: async (request) => {
        passedStartEquity = request.equityStartUsd;
        passedEndEquity = request.equityEndUsd;

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
          ...normalizeRoi({
            equityStartUsd: request.equityStartUsd,
            equityEndUsd: request.equityEndUsd,
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
    expect(passedEndEquity).toBe(1_100);
    expect(summary?.type).toBe("kpi");
    expect(summary && summary.type === "kpi" ? summary.kpis.find((kpi) => kpi.label === "ROI")?.value : undefined).toBe(
      "unsupported"
    );
    expect(roiStatus?.type).toBe("text");
    expect(roiStatus && roiStatus.type === "text" ? roiStatus.text[0] : undefined).toBe("Status: unsupported");
    expect(roiStatus && roiStatus.type === "text" ? roiStatus.text[1] : undefined).toBe("Code: equity_history_unavailable");
    expect(roiStatus && roiStatus.type === "text" ? roiStatus.text[2] : undefined).toContain("equity history is unavailable");
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
        ...normalizeRoi({
          equityStartUsd: 1_000,
          equityEndUsd: 1_100
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
        state: "degraded",
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
});
