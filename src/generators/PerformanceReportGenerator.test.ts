import { describe, expect, it } from "bun:test";
import { PerformanceReportGenerator } from "./PerformanceReportGenerator";
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

describe("PerformanceReportGenerator", () => {
  it("marks capital efficiency as unsupported when equity history is missing", async () => {
    let pnlRequest: Parameters<ExecutionDataService["getPnlReport"]>[0] | undefined;
    const executionService: ExecutionDataService = {
      getPnlReport: async (request) => {
        pnlRequest = request;
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
        roiStatus: "unsupported",
        roiUnsupportedReason: "starting equity is unavailable for the requested period window",
        roiUnsupportedReasonCode: "starting_equity_unavailable",
        roiStartEquityUsd: undefined,
        roiEndEquityUsd: undefined,
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

    const accountService: AccountDataService = {
      getWalletSnapshot: async () => ({
        source: "bybit",
        exchange: "bybit",
        category: "linear",
        capturedAt: new Date().toISOString(),
        totalEquityUsd: 1_000,
        walletBalanceUsd: 1_000,
        availableBalanceUsd: 1_000,
        unrealizedPnlUsd: 17,
        balances: [],
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

    const generator = new PerformanceReportGenerator(accountService, executionService);
    const report = await generator.generate(context);
    const section = report.sections.find((item) => item.title === "Capital Efficiency");

    expect(section?.type).toBe("kpi");
    expect(section && section.type === "kpi" ? section.kpis[0]?.value : undefined).toBe("unsupported");
    expect(section && section.type === "kpi" ? section.kpis[1]?.value : undefined).toBe("unsupported");
    expect(pnlRequest?.endingState).toBeUndefined();
    expect(pnlRequest?.equityStartUsd).toBeUndefined();
    expect(pnlRequest?.roiMissingStartReason).toBe("equity history is unavailable");
    expect(pnlRequest?.roiMissingStartReasonCode).toBe("equity_history_unavailable");
    expect(pnlRequest?.context).toEqual(context);
  });

  it("does not propagate spot exposure/risk unsupported issue into performance data completeness", async () => {
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
        roiStatus: "unsupported",
        roiUnsupportedReason: "ending equity is unavailable for the requested period window",
        roiUnsupportedReasonCode: "ending_equity_unavailable",
        roiStartEquityUsd: 1_000,
        roiEndEquityUsd: undefined,
        roiPct: undefined,
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

    const accountService: AccountDataService = {
      getWalletSnapshot: async () => ({
        source: "bybit",
        exchange: "bybit",
        category: "spot",
        capturedAt: new Date().toISOString(),
        totalEquityUsd: 1_100,
        walletBalanceUsd: 1_100,
        availableBalanceUsd: 1_100,
        unrealizedPnlUsd: 0,
        balances: [],
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

    const report = await new PerformanceReportGenerator(accountService, executionService).generate({
      ...context,
      category: "spot"
    });

    expect(report.dataCompleteness?.state).toBe("complete");
    expect(report.dataCompleteness?.issues).toHaveLength(0);
  });
});
