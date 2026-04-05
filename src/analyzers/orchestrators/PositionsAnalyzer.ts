import type { Position } from "../../types/domain.types";

export interface PositionsAnalysis {
  totalPositions: number;
  longCount: number;
  shortCount: number;
  totalNotionalUsd: number;
  positions: Position[];
  largestPositions: Position[];
  priceSourceAlert?: string;
}

function comparePositionsByAbsNotionalDesc(left: Position, right: Position): number {
  return (
    Math.abs(right.notionalUsd) - Math.abs(left.notionalUsd) ||
    left.symbol.localeCompare(right.symbol) ||
    left.side.localeCompare(right.side) ||
    left.marginMode.localeCompare(right.marginMode) ||
    left.updatedAt.localeCompare(right.updatedAt) ||
    (left.openedAt ?? "").localeCompare(right.openedAt ?? "") ||
    left.quantity - right.quantity ||
    left.entryPrice - right.entryPrice
  );
}

export class PositionsAnalyzer {
  analyze(positions: Position[]): PositionsAnalysis {
    const longCount = positions.filter((position) => position.side === "long").length;
    const shortCount = positions.filter((position) => position.side === "short").length;

    const sources = new Set(positions.map((position) => position.priceSource));
    const priceSourceAlert =
      sources.size > 1
        ? `Mixed valuation price sources detected: ${Array.from(sources).sort((left, right) => left.localeCompare(right)).join(", ")}`
        : undefined;

    return {
      totalPositions: positions.length,
      longCount,
      shortCount,
      totalNotionalUsd: positions.reduce((sum, position) => sum + Math.abs(position.notionalUsd), 0),
      positions: [...positions].sort(comparePositionsByAbsNotionalDesc),
      largestPositions: [...positions]
        .sort(comparePositionsByAbsNotionalDesc)
        .slice(0, 5),
      priceSourceAlert
    };
  }
}
