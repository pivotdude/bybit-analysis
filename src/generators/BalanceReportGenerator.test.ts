import { describe, expect, it } from "bun:test";
import { BalanceReportGenerator } from "./BalanceReportGenerator";
import type { AccountDataService, ServiceRequestContext } from "../services/contracts/AccountDataService";

const botContext: ServiceRequestContext = {
  category: "linear",
  sourceMode: "bot",
  providerContext: { bybit: { botStrategyIds: { futuresGridBotIds: ["fgrid-1"], spotGridBotIds: [] } } },
  from: "2026-01-01T00:00:00.000Z",
  to: "2026-01-31T00:00:00.000Z",
  timeoutMs: 5_000
};

const spotContext: ServiceRequestContext = {
  category: "spot",
  sourceMode: "market",
  providerContext: { bybit: { botStrategyIds: { futuresGridBotIds: [], spotGridBotIds: [] } } },
  from: "2026-01-01T00:00:00.000Z",
  to: "2026-01-31T00:00:00.000Z",
  timeoutMs: 5_000
};

describe("BalanceReportGenerator", () => {
  it("renders bot capital in USD fields instead of asset quantity fields", async () => {
    const accountService: AccountDataService = {
      getAccountSnapshot: async () => ({
        source: "bybit",
        exchange: "bybit",
        category: "linear",
        capturedAt: "2026-01-31T00:00:00.000Z",
        totalEquityUsd: 2_450,
        walletBalanceUsd: 2_400,
        availableBalanceUsd: 2_100,
        unrealizedPnlUsd: 50,
        positions: [],
        balances: [],
        botCapital: [
          {
            asset: "USDT",
            allocatedCapitalUsd: 2_400,
            availableBalanceUsd: 2_100,
            equityUsd: 2_450
          }
        ],
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

    const report = await new BalanceReportGenerator(accountService).generate(botContext);
    const assets = report.sections.find((section) => section.id === "balance.asset_balances");

    expect(assets?.type).toBe("table");
    expect(assets && assets.type === "table" ? assets.table.headers : []).toEqual([
      "Asset",
      "Allocated Capital (USD)",
      "Available Capital (USD)",
      "Equity (USD)"
    ]);
    expect(assets && assets.type === "table" ? assets.table.rows[0] : []).toEqual([
      "USDT",
      "$2,400.00",
      "$2,100.00",
      "$2,450.00"
    ]);
  });

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

    const report = await new BalanceReportGenerator(accountService).generate(spotContext);
    expect(report.dataCompleteness?.state).toBe("complete");
    expect(report.dataCompleteness?.issues).toHaveLength(0);
  });
});
