import { describe, expect, it } from "bun:test";
import { PerformanceAnalyzer } from "./PerformanceAnalyzer";
import type { AccountSnapshot, PnLReport } from "../../types/domain.types";

const baseAccount: AccountSnapshot = {
  source: "bybit",
  exchange: "bybit",
  category: "linear",
  capturedAt: "2026-01-31T00:00:00.000Z",
  totalEquityUsd: 1_200,
  walletBalanceUsd: 1_150,
  availableBalanceUsd: 900,
  unrealizedPnlUsd: 50,
  positions: [],
  balances: [],
  dataCompleteness: {
    state: "complete",
    partial: false,
    warnings: [],
    issues: []
  }
};

const basePnl: PnLReport = {
  source: "bybit",
  generatedAt: "2026-01-31T00:00:00.000Z",
  periodFrom: "2026-01-01T00:00:00.000Z",
  periodTo: "2026-01-31T00:00:00.000Z",
  realizedPnlUsd: 200,
  unrealizedPnlUsd: 0,
  fees: {
    tradingFeesUsd: 0,
    fundingFeesUsd: 0
  },
  netPnlUsd: 200,
  endStateStatus: "unsupported",
  endStateUnsupportedReason: "Historical period end-state is unavailable",
  endStateUnsupportedReasonCode: "historical_end_state_unavailable",
  roiStatus: "unsupported",
  roiUnsupportedReason: "starting equity is unavailable for the requested period window",
  roiUnsupportedReasonCode: "starting_equity_unavailable",
  roiStartEquityUsd: undefined,
  roiEndEquityUsd: 1_200,
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

describe("PerformanceAnalyzer", () => {
  it("computes capital efficiency when equity history is populated", () => {
    const analyzer = new PerformanceAnalyzer();

    const analysis = analyzer.analyze(
      {
        ...baseAccount,
        equityHistory: [
          {
            timestamp: "2026-01-01T00:00:00.000Z",
            totalEquityUsd: 1_000,
            totalExposureUsd: 1_000,
            grossExposureUsd: 1_000,
            netExposureUsd: 500
          },
          {
            timestamp: "2026-01-15T00:00:00.000Z",
            totalEquityUsd: 1_100,
            totalExposureUsd: 3_000,
            grossExposureUsd: 3_000,
            netExposureUsd: 1_500
          }
        ]
      },
      basePnl
    );

    expect(analysis.capitalEfficiencyStatus).toBe("supported");
    expect(analysis.avgDeployedCapitalUsd).toBe(2_000);
    expect(analysis.capitalEfficiencyPct).toBe(10);
  });

  it("marks capital efficiency as unsupported without equity history", () => {
    const analyzer = new PerformanceAnalyzer();
    const analysis = analyzer.analyze(baseAccount, basePnl);

    expect(analysis.capitalEfficiencyStatus).toBe("unsupported");
    expect(analysis.capitalEfficiencyPct).toBeUndefined();
    expect(analysis.avgDeployedCapitalUsd).toBeUndefined();
  });
});
