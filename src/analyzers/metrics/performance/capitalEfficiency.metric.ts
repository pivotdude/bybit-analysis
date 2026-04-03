import type { EquitySnapshot } from "../../../types/domain.types";

export interface CapitalEfficiency {
  avgDeployedCapitalUsd: number;
  capitalEfficiencyPct: number;
}

export function calculateCapitalEfficiency(periodRealizedPnlUsd: number, equityHistory: EquitySnapshot[] = []): CapitalEfficiency {
  const exposures = equityHistory
    .map((snapshot) => snapshot.grossExposureUsd)
    .filter((value) => Number.isFinite(value) && value > 0);

  const avgDeployedCapitalUsd =
    exposures.length > 0
      ? exposures.reduce((sum, value) => sum + value, 0) / exposures.length
      : 0;

  const capitalEfficiencyPct = avgDeployedCapitalUsd > 0
    ? (periodRealizedPnlUsd / avgDeployedCapitalUsd) * 100
    : 0;

  return {
    avgDeployedCapitalUsd,
    capitalEfficiencyPct
  };
}
