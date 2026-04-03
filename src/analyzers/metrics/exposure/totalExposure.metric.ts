import type { Position } from "../../../types/domain.types";

export interface ExposureTotals {
  longExposureUsd: number;
  shortExposureUsd: number;
  grossExposureUsd: number;
  netExposureUsd: number;
  totalExposureUsd: number;
}

export function calculateExposureTotals(positions: Position[]): ExposureTotals {
  const longExposureUsd = positions
    .map((position) => Math.max(position.notionalUsd, 0))
    .reduce((sum, value) => sum + value, 0);

  const shortExposureUsd = positions
    .map((position) => Math.abs(Math.min(position.notionalUsd, 0)))
    .reduce((sum, value) => sum + value, 0);

  const grossExposureUsd = longExposureUsd + shortExposureUsd;
  const netExposureUsd = longExposureUsd - shortExposureUsd;

  return {
    longExposureUsd,
    shortExposureUsd,
    grossExposureUsd,
    netExposureUsd,
    totalExposureUsd: grossExposureUsd
  };
}
