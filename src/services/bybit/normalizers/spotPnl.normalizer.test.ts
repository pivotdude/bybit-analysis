import { describe, expect, it } from "bun:test";
import { normalizeSpotPnlReport } from "./spotPnl.normalizer";

const periodFrom = "2026-01-01T00:00:00.000Z";
const periodTo = "2026-01-02T00:00:00.000Z";

function trade(args: {
  symbol?: string;
  side: "Buy" | "Sell";
  qty: number;
  price: number;
  time: number;
  fee?: number;
  feeCurrency?: string;
}): Record<string, unknown> {
  const symbol = args.symbol ?? "BTCUSDT";
  const value = args.qty * args.price;

  return {
    symbol,
    side: args.side,
    execQty: String(args.qty),
    execValue: String(value),
    execPrice: String(args.price),
    execFee: String(args.fee ?? 0),
    feeCurrency: args.feeCurrency ?? "USDT",
    execType: "Trade",
    execTime: String(args.time)
  };
}

describe("normalizeSpotPnlReport", () => {
  it("returns supported ROI contract when both equity bounds are provided", () => {
    const report = normalizeSpotPnlReport(
      {
        list: [trade({ side: "Buy", qty: 1, price: 100, time: 1 })]
      },
      periodFrom,
      periodTo,
      1_000,
      1_100
    );

    expect(report.roiStatus).toBe("supported");
    expect(report.roiPct).toBeCloseTo(10);
    expect(report.roiUnsupportedReason).toBeUndefined();
  });

  it("uses opening inventory from executions before period boundary", () => {
    const report = normalizeSpotPnlReport(
      {
        list: [trade({ side: "Sell", qty: 1, price: 150, time: 2 })]
      },
      periodFrom,
      periodTo,
      undefined,
      undefined,
      {
        openingExecutions: {
          list: [trade({ side: "Buy", qty: 2, price: 100, time: 1 })]
        }
      }
    );

    expect(report.realizedPnlUsd).toBeCloseTo(50);
    expect(report.netPnlUsd).toBeCloseTo(50);
    expect(report.roiStatus).toBe("unsupported");
    expect(report.roiUnsupportedReason).toContain("starting equity is unavailable");
    expect(report.dataCompleteness.partial).toBe(false);
    expect(report.bySymbol[0]?.realizedPnlUsd).toBeCloseTo(50);
  });

  it("marks report partial and excludes unmatched quantity from realized pnl", () => {
    const report = normalizeSpotPnlReport(
      {
        list: [trade({ side: "Sell", qty: 2, price: 150, time: 2 })]
      },
      periodFrom,
      periodTo,
      undefined,
      undefined,
      {
        openingExecutions: {
          list: [trade({ side: "Buy", qty: 1, price: 100, time: 1 })]
        }
      }
    );

    expect(report.realizedPnlUsd).toBeCloseTo(50);
    expect(report.dataCompleteness.partial).toBe(true);
    expect(report.dataCompleteness.warnings[0]).toContain("Unable to reconstruct full spot cost basis for BTCUSDT");
    expect(report.dataCompleteness.warnings[0]).toContain("1.00000000");
  });

  it("calculates weighted-average cost across multiple opening lots", () => {
    const report = normalizeSpotPnlReport(
      {
        list: [trade({ side: "Sell", qty: 1.5, price: 180, time: 3 })]
      },
      periodFrom,
      periodTo,
      undefined,
      undefined,
      {
        openingExecutions: {
          list: [
            trade({ side: "Buy", qty: 1, price: 100, time: 1 }),
            trade({ side: "Buy", qty: 1, price: 200, time: 2 })
          ]
        }
      }
    );

    expect(report.realizedPnlUsd).toBeCloseTo(45);
    expect(report.dataCompleteness.partial).toBe(false);
  });

  it("marks zero-opening-inventory sells as partial instead of using execution price fallback", () => {
    const report = normalizeSpotPnlReport(
      {
        list: [trade({ side: "Sell", qty: 1, price: 100, time: 1 })]
      },
      periodFrom,
      periodTo
    );

    expect(report.realizedPnlUsd).toBeCloseTo(0);
    expect(report.bySymbol[0]?.realizedPnlUsd).toBeCloseTo(0);
    expect(report.dataCompleteness.partial).toBe(true);
    expect(report.dataCompleteness.warnings[0]).toContain("unmatched by opening inventory");
  });
});
