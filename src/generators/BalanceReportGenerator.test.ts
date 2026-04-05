import { describe, expect, it } from "bun:test";
import { BalanceReportGenerator } from "./BalanceReportGenerator";
import type { AccountDataService, ServiceRequestContext } from "../services/contracts/AccountDataService";

const context: ServiceRequestContext = {
  category: "spot",
  sourceMode: "market",
  providerContext: { bybit: { botStrategyIds: { futuresGridBotIds: [], spotGridBotIds: [] } } },
  from: "2026-01-01T00:00:00.000Z",
  to: "2026-01-31T00:00:00.000Z",
  timeoutMs: 5_000
};

describe("BalanceReportGenerator", () => {
  it("does not propagate spot exposure/risk unsupported issue into balance data completeness", async () => {
    const accountService: AccountDataService = {
      getAccountSnapshot: async () => ({
        source: "bybit",
        exchange: "bybit",
        category: "spot",
        capturedAt: new Date().toISOString(),
        totalEquityUsd: 1_000,
        walletBalanceUsd: 1_000,
        availableBalanceUsd: 1_000,
        unrealizedPnlUsd: 0,
        positions: [],
        balances: [{ asset: "USDT", walletBalance: 1_000, availableBalance: 1_000, usdValue: 1_000 }],
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

    const report = await new BalanceReportGenerator(accountService).generate(context);
    expect(report.dataCompleteness?.state).toBe("complete");
    expect(report.dataCompleteness?.issues).toHaveLength(0);
  });
});
