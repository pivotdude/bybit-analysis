import type { EquitySnapshot } from "../../../types/domain.types";
import { dec, safePct, sumDecimals, toFiniteNumber } from "../../../services/math/decimal";

export interface CapitalEfficiency {
  status: "supported" | "unsupported";
  avgDeployedCapitalUsd?: number;
  capitalEfficiencyPct?: number;
  reason?: string;
}

export function calculateCapitalEfficiency(periodRealizedPnlUsd: number, equityHistory: EquitySnapshot[] = []): CapitalEfficiency {
  const exposures = equityHistory
    .map((snapshot) => dec(snapshot.grossExposureUsd))
    .filter((value) => value.gt(0));

  if (exposures.length === 0) {
    return {
      status: "unsupported",
      reason: "equity history is unavailable"
    };
  }

  const avgDeployedCapitalUsdDecimal = sumDecimals(exposures).div(exposures.length);
  const capitalEfficiencyPctDecimal = safePct(dec(periodRealizedPnlUsd), avgDeployedCapitalUsdDecimal);

  return {
    status: "supported",
    avgDeployedCapitalUsd: toFiniteNumber(avgDeployedCapitalUsdDecimal),
    capitalEfficiencyPct: toFiniteNumber(capitalEfficiencyPctDecimal)
  };
}
