import type { Position } from "../../../types/domain.types";
import { dec, sumDecimals, toFiniteNumber } from "../../../services/math/decimal";

export interface ExposureTotals {
  longExposureUsd: number;
  shortExposureUsd: number;
  grossExposureUsd: number;
  netExposureUsd: number;
  totalExposureUsd: number;
}

export function calculateExposureTotals(positions: Position[]): ExposureTotals {
  const longExposureUsdDecimal = sumDecimals(
    positions.map((position) => {
      const notional = dec(position.notionalUsd);
      return notional.gt(0) ? notional : dec(0);
    })
  );

  const shortExposureUsdDecimal = sumDecimals(
    positions.map((position) => {
      const notional = dec(position.notionalUsd);
      return notional.lt(0) ? notional.abs() : dec(0);
    })
  );

  const grossExposureUsdDecimal = longExposureUsdDecimal.plus(shortExposureUsdDecimal);
  const netExposureUsdDecimal = longExposureUsdDecimal.minus(shortExposureUsdDecimal);
  const longExposureUsd = toFiniteNumber(longExposureUsdDecimal);
  const shortExposureUsd = toFiniteNumber(shortExposureUsdDecimal);
  const grossExposureUsd = toFiniteNumber(grossExposureUsdDecimal);
  const netExposureUsd = toFiniteNumber(netExposureUsdDecimal);

  return {
    longExposureUsd,
    shortExposureUsd,
    grossExposureUsd,
    netExposureUsd,
    totalExposureUsd: grossExposureUsd
  };
}
