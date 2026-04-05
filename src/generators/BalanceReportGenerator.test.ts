import { describe, expect, it } from "bun:test";
import { BalanceReportGenerator } from "./BalanceReportGenerator";
import type { AccountDataService, ServiceRequestContext } from "../services/contracts/AccountDataService";

const context: ServiceRequestContext = {
  category: "linear",
  sourceMode: "bot",
  providerContext: { bybit: { botStrategyIds: { futuresGridBotIds: ["fgrid-1"], spotGridBotIds: [] } } },
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

    const report = await new BalanceReportGenerator(accountService).generate(context);
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
});
