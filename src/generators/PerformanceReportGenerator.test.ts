import { describe, expect, it } from "bun:test";
import { PerformanceReportGenerator } from "./PerformanceReportGenerator";
import type { AccountDataService, ServiceRequestContext } from "../services/contracts/AccountDataService";
import type { ExecutionDataService } from "../services/contracts/ExecutionDataService";

const context: ServiceRequestContext = {
  category: "linear",
  futuresGridBotIds: [],
  spotGridBotIds: [],
  from: "2026-01-01T00:00:00.000Z",
  to: "2026-01-31T00:00:00.000Z",
  timeoutMs: 5_000
};

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
    roiStatus: "unsupported",
    roiUnsupportedReason: "starting equity is unavailable for the requested period window",
    roiStartEquityUsd: undefined,
    roiEndEquityUsd: 1_000,
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

describe("PerformanceReportGenerator", () => {
  it("marks capital efficiency as unsupported when equity history is missing", async () => {
    const accountService: AccountDataService = {
      getAccountSnapshot: async () => ({
        source: "bybit",
        exchange: "bybit",
        category: "linear",
        capturedAt: new Date().toISOString(),
        totalEquityUsd: 1_000,
        walletBalanceUsd: 1_000,
        availableBalanceUsd: 1_000,
        unrealizedPnlUsd: 0,
        positions: [],
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

    expect(section?.kpis?.[0]?.value).toBe("unsupported");
    expect(section?.kpis?.[1]?.value).toBe("unsupported");
  });
});
