import type { Position, UnrealizedLossRisk } from "../../../types/domain.types";
import { dec, safePct, sumDecimals, toFiniteNumber } from "../../../services/math/decimal";

export function calculateUnrealizedLossRisk(positions: Position[], totalEquityUsd: number): UnrealizedLossRisk {
  const losses = positions.filter((position) => position.unrealizedPnlUsd < 0);
  const unrealizedLossUsdDecimal = sumDecimals(losses.map((position) => dec(position.unrealizedPnlUsd).abs()));
  const worst = [...losses].sort(
    (left, right) =>
      left.unrealizedPnlUsd - right.unrealizedPnlUsd ||
      left.symbol.localeCompare(right.symbol) ||
      left.side.localeCompare(right.side) ||
      left.updatedAt.localeCompare(right.updatedAt) ||
      left.notionalUsd - right.notionalUsd
  )[0];

  return {
    unrealizedLossUsd: toFiniteNumber(unrealizedLossUsdDecimal),
    unrealizedLossToEquityPct: toFiniteNumber(safePct(unrealizedLossUsdDecimal, dec(totalEquityUsd))),
    worstPositionSymbol: worst?.symbol,
    worstPositionLossUsd: worst ? toFiniteNumber(dec(worst.unrealizedPnlUsd).abs()) : undefined
  };
}
