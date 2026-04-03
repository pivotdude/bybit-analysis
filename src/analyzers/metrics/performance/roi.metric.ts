export function calculateRoiPct(periodStartEquityUsd: number, periodEndEquityUsd: number): number {
  if (!Number.isFinite(periodStartEquityUsd) || periodStartEquityUsd <= 0) {
    return 0;
  }
  return ((periodEndEquityUsd - periodStartEquityUsd) / periodStartEquityUsd) * 100;
}
