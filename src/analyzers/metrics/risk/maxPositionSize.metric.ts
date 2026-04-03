import type { MaxPositionSize, Position } from "../../../types/domain.types";

export function calculateMaxPositionSize(positions: Position[], totalEquityUsd: number): MaxPositionSize {
  if (positions.length === 0) {
    return {
      symbol: "N/A",
      notionalUsd: 0,
      pctOfEquity: 0
    };
  }

  const largest = [...positions].sort(
    (left, right) => Math.abs(right.notionalUsd) - Math.abs(left.notionalUsd)
  )[0] ?? {
    symbol: "N/A",
    notionalUsd: 0
  };

  return {
    symbol: largest.symbol,
    notionalUsd: Math.abs(largest.notionalUsd),
    pctOfEquity: totalEquityUsd > 0 ? (Math.abs(largest.notionalUsd) / totalEquityUsd) * 100 : 0
  };
}
