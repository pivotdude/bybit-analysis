import type { Position, UnrealizedLossRisk } from "../../../types/domain.types";

export function calculateUnrealizedLossRisk(positions: Position[], totalEquityUsd: number): UnrealizedLossRisk {
  const losses = positions.filter((position) => position.unrealizedPnlUsd < 0);
  const unrealizedLossUsd = losses.reduce((sum, position) => sum + Math.abs(position.unrealizedPnlUsd), 0);
  const worst = [...losses].sort(
    (left, right) =>
      left.unrealizedPnlUsd - right.unrealizedPnlUsd ||
      left.symbol.localeCompare(right.symbol) ||
      left.side.localeCompare(right.side) ||
      left.updatedAt.localeCompare(right.updatedAt) ||
      left.notionalUsd - right.notionalUsd
  )[0];

  return {
    unrealizedLossUsd,
    unrealizedLossToEquityPct: totalEquityUsd > 0 ? (unrealizedLossUsd / totalEquityUsd) * 100 : 0,
    worstPositionSymbol: worst?.symbol,
    worstPositionLossUsd: worst ? Math.abs(worst.unrealizedPnlUsd) : undefined
  };
}
