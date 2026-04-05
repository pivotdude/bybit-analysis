import { describe, expect, it } from "bun:test";
import type { Position } from "../../types/domain.types";
import { PositionsAnalyzer } from "./PositionsAnalyzer";

function position(args: {
  symbol: string;
  notionalUsd: number;
  side?: Position["side"];
  priceSource?: Position["priceSource"];
  updatedAt?: string;
}): Position {
  const side = args.side ?? "long";
  const symbol = args.symbol;
  return {
    source: "bybit",
    exchange: "bybit",
    category: "linear",
    symbol,
    baseAsset: symbol.replace("USDT", ""),
    quoteAsset: "USDT",
    side,
    marginMode: "cross",
    quantity: 1,
    entryPrice: 100,
    valuationPrice: 100,
    priceSource: args.priceSource ?? "mark",
    notionalUsd: args.notionalUsd,
    leverage: 2,
    unrealizedPnlUsd: 0,
    updatedAt: args.updatedAt ?? "2026-01-01T00:00:00.000Z"
  };
}

describe("PositionsAnalyzer", () => {
  it("uses deterministic ordering for same-size positions", () => {
    const analyzer = new PositionsAnalyzer();
    const tiedA = position({ symbol: "ALPHAUSDT", notionalUsd: 100, side: "long", priceSource: "mark" });
    const tiedB = position({ symbol: "BETAUSDT", notionalUsd: -100, side: "short", priceSource: "last" });
    const largest = position({ symbol: "GAMMAUSDT", notionalUsd: 200, side: "long", priceSource: "index" });

    const analysisA = analyzer.analyze([tiedB, largest, tiedA]);
    const analysisB = analyzer.analyze([tiedA, largest, tiedB]);

    expect(analysisA.positions.map((item) => item.symbol)).toEqual(["GAMMAUSDT", "ALPHAUSDT", "BETAUSDT"]);
    expect(analysisB.positions.map((item) => item.symbol)).toEqual(["GAMMAUSDT", "ALPHAUSDT", "BETAUSDT"]);
    expect(analysisA.positions.map((item) => item.symbol)).toEqual(analysisB.positions.map((item) => item.symbol));
    expect(analysisA.priceSourceAlert).toBe("Mixed valuation price sources detected: index, last, mark");
    expect(analysisB.priceSourceAlert).toBe("Mixed valuation price sources detected: index, last, mark");
  });
});
