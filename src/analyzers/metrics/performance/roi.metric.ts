import { dec, safePct, toFiniteNumber } from "../../../services/math/decimal";

export function calculateRoiPct(periodStartEquityUsd: number, periodEndEquityUsd: number): number {
  const start = dec(periodStartEquityUsd);
  if (start.lte(0)) {
    return 0;
  }

  const change = dec(periodEndEquityUsd).minus(start);
  return toFiniteNumber(safePct(change, start));
}
