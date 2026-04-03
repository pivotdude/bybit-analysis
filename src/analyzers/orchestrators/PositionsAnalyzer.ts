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

export class PositionsAnalyzer {
  analyze(positions: Position[]): PositionsAnalysis {
    const longCount = positions.filter((position) => position.side === "long").length;
    const shortCount = positions.filter((position) => position.side === "short").length;

    const sources = new Set(positions.map((position) => position.priceSource));
    const priceSourceAlert =
      sources.size > 1
        ? `Mixed valuation price sources detected: ${Array.from(sources).join(", ")}`
        : undefined;

    return {
      totalPositions: positions.length,
      longCount,
      shortCount,
      totalNotionalUsd: positions.reduce((sum, position) => sum + Math.abs(position.notionalUsd), 0),
      positions: [...positions].sort((left, right) => Math.abs(right.notionalUsd) - Math.abs(left.notionalUsd)),
      largestPositions: [...positions]
        .sort((left, right) => Math.abs(right.notionalUsd) - Math.abs(left.notionalUsd))
        .slice(0, 5),
      priceSourceAlert
    };
  }
}
