import type { EquitySnapshot } from "../../../types/domain.types";

export interface CapitalEfficiency {
  status: "supported" | "unsupported";
  avgDeployedCapitalUsd?: number;
  capitalEfficiencyPct?: number;
  reason?: string;
}

export function calculateCapitalEfficiency(periodRealizedPnlUsd: number, equityHistory: EquitySnapshot[] = []): CapitalEfficiency {
  const exposures = equityHistory
    .map((snapshot) => snapshot.grossExposureUsd)
    .filter((value) => Number.isFinite(value) && value > 0);

  if (exposures.length === 0) {
    return {
      status: "unsupported",
      reason: "equity history is unavailable"
    };
  }

  const avgDeployedCapitalUsd = exposures.reduce((sum, value) => sum + value, 0) / exposures.length;

  const capitalEfficiencyPct = (periodRealizedPnlUsd / avgDeployedCapitalUsd) * 100;

  return {
    status: "supported",
    avgDeployedCapitalUsd,
    capitalEfficiencyPct
  };
}
