import type { MaxPositionSize, Position } from "../../../types/domain.types";

function comparePositionsByAbsNotionalDesc(left: Position, right: Position): number {
  return (
    Math.abs(right.notionalUsd) - Math.abs(left.notionalUsd) ||
    left.symbol.localeCompare(right.symbol) ||
    left.side.localeCompare(right.side) ||
    left.updatedAt.localeCompare(right.updatedAt) ||
    left.quantity - right.quantity
  );
}

export function calculateMaxPositionSize(positions: Position[], totalEquityUsd: number): MaxPositionSize {
  if (positions.length === 0) {
    return {
      symbol: "N/A",
      notionalUsd: 0,
      pctOfEquity: 0
    };
  }

  const largest = [...positions].sort(comparePositionsByAbsNotionalDesc)[0] ?? {
    symbol: "N/A",
    notionalUsd: 0
  };

  return {
    symbol: largest.symbol,
    notionalUsd: Math.abs(largest.notionalUsd),
    pctOfEquity: totalEquityUsd > 0 ? (Math.abs(largest.notionalUsd) / totalEquityUsd) * 100 : 0
  };
}
