import type { AccountSnapshot, RoiUnsupportedReasonCode } from "../../types/domain.types";

export interface StartingEquityResolution {
  equityStartUsd?: number;
  missingStartReason?: string;
  missingStartReasonCode?: RoiUnsupportedReasonCode;
}

function unsupported(
  missingStartReasonCode: RoiUnsupportedReasonCode,
  missingStartReason: string
): StartingEquityResolution {
  return {
    missingStartReasonCode,
    missingStartReason
  };
}

export function resolveStartingEquity(account: Pick<AccountSnapshot, "equityHistory">, periodFrom: string): StartingEquityResolution {
  const history = account.equityHistory;
  if (!history || history.length === 0) {
    return unsupported("equity_history_unavailable", "equity history is unavailable");
  }

  const periodFromMs = new Date(periodFrom).getTime();
  if (!Number.isFinite(periodFromMs)) {
    return unsupported("invalid_period_start_boundary", "invalid period start boundary");
  }

  let matchingSample: NonNullable<AccountSnapshot["equityHistory"]>[number] | undefined;
  for (const sample of history) {
    const sampleTsMs = new Date(sample.timestamp).getTime();
    if (!Number.isFinite(sampleTsMs)) {
      continue;
    }

    if (sampleTsMs <= periodFromMs) {
      matchingSample = sample;
      continue;
    }

    break;
  }

  if (!matchingSample) {
    return unsupported(
      "no_equity_sample_at_or_before_period_start",
      "no equity sample found at or before period start"
    );
  }

  if (!Number.isFinite(matchingSample.totalEquityUsd)) {
    return unsupported("starting_equity_sample_invalid", "starting equity sample is invalid");
  }

  return { equityStartUsd: matchingSample.totalEquityUsd };
}
