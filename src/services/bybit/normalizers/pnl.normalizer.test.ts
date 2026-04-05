import { describe, expect, it } from "bun:test";
import { normalizePnlReport } from "./pnl.normalizer";

describe("normalizePnlReport", () => {
  it("sorts tied net pnl symbols deterministically", () => {
    const reportA = normalizePnlReport(
      {
        list: [
          { symbol: "ZETAUSDT", closedPnl: "10", openFee: "0", closeFee: "0" },
          { symbol: "ALPHAUSDT", closedPnl: "10", openFee: "0", closeFee: "0" }
        ]
      },
      "2026-01-01T00:00:00.000Z",
      "2026-01-02T00:00:00.000Z",
      0
    );
    const reportB = normalizePnlReport(
      {
        list: [
          { symbol: "ALPHAUSDT", closedPnl: "10", openFee: "0", closeFee: "0" },
          { symbol: "ZETAUSDT", closedPnl: "10", openFee: "0", closeFee: "0" }
        ]
      },
      "2026-01-01T00:00:00.000Z",
      "2026-01-02T00:00:00.000Z",
      0
    );

    expect(reportA.bySymbol.map((item) => item.symbol)).toEqual(["ALPHAUSDT", "ZETAUSDT"]);
    expect(reportB.bySymbol.map((item) => item.symbol)).toEqual(["ALPHAUSDT", "ZETAUSDT"]);
  });

  it("keeps symbol-level market pnl realized-only", () => {
    const report = normalizePnlReport(
      {
        list: [{ symbol: "BTCUSDT", closedPnl: "12", openFee: "1", closeFee: "2" }]
      },
      "2026-01-01T00:00:00.000Z",
      "2026-01-02T00:00:00.000Z",
      7
    );

    expect(report.bySymbol[0]).toEqual({
      symbol: "BTCUSDT",
      realizedPnlUsd: 12,
      netPnlUsd: 9,
      tradesCount: 1
    });
  });
});
