import type { LeverageUsage, Position } from "../../../types/domain.types";

export function calculateLeverageUsage(positions: Position[], totalEquityUsd: number): LeverageUsage {
  const absoluteNotional = positions.map((position) => Math.abs(position.notionalUsd));
  const grossExposureUsd = absoluteNotional.reduce((sum, value) => sum + value, 0);

  const weightedLeverageNumerator = positions.reduce(
    (sum, position) => sum + Math.abs(position.notionalUsd) * position.leverage,
    0
  );

  return {
    weightedAvgLeverage: grossExposureUsd > 0 ? weightedLeverageNumerator / grossExposureUsd : 0,
    maxLeverageUsed: positions.reduce((max, position) => Math.max(max, position.leverage), 0),
    notionalToEquityPct: totalEquityUsd > 0 ? (grossExposureUsd / totalEquityUsd) * 100 : 0
  };
}
