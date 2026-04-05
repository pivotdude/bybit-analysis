import type { LeverageUsage, Position } from "../../../types/domain.types";
import { dec, safePct, safeDiv, sumDecimals, toFiniteNumber } from "../../../services/math/decimal";

export function calculateLeverageUsage(positions: Position[], totalEquityUsd: number): LeverageUsage {
  const absoluteNotional = positions.map((position) => dec(position.notionalUsd).abs());
  const grossExposureUsd = sumDecimals(absoluteNotional);

  const weightedLeverageNumerator = positions.reduce(
    (sum, position) => sum.plus(dec(position.notionalUsd).abs().mul(dec(position.leverage))),
    dec(0)
  );

  return {
    weightedAvgLeverage: toFiniteNumber(safeDiv(weightedLeverageNumerator, grossExposureUsd)),
    maxLeverageUsed: positions.reduce((max, position) => Math.max(max, position.leverage), 0),
    notionalToEquityPct: toFiniteNumber(safePct(grossExposureUsd, dec(totalEquityUsd)))
  };
}
