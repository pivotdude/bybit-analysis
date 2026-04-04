import type { RoiContract, RoiUnsupportedReasonCode } from "../../types/domain.types";

export interface NormalizeRoiInput {
  equityStartUsd?: number;
  equityEndUsd?: number;
  missingStartReason?: string;
  missingStartReasonCode?: RoiUnsupportedReasonCode;
}

export type NormalizedRoi = Pick<
  RoiContract,
  "roiStatus" | "roiUnsupportedReason" | "roiUnsupportedReasonCode" | "roiStartEquityUsd" | "roiEndEquityUsd" | "roiPct"
>;

const DEFAULT_MISSING_START_REASON = "starting equity is unavailable for the requested period window";
const DEFAULT_MISSING_START_REASON_CODE: RoiUnsupportedReasonCode = "starting_equity_unavailable";

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function normalizeRoi({
  equityStartUsd,
  equityEndUsd,
  missingStartReason = DEFAULT_MISSING_START_REASON,
  missingStartReasonCode = DEFAULT_MISSING_START_REASON_CODE
}: NormalizeRoiInput): NormalizedRoi {
  const roiStartEquityUsd = isFiniteNumber(equityStartUsd) ? equityStartUsd : undefined;
  const roiEndEquityUsd = isFiniteNumber(equityEndUsd) ? equityEndUsd : undefined;

  if (!isFiniteNumber(equityStartUsd)) {
    return {
      roiStatus: "unsupported",
      roiUnsupportedReason: missingStartReason,
      roiUnsupportedReasonCode: missingStartReasonCode,
      roiStartEquityUsd,
      roiEndEquityUsd
    };
  }

  if (equityStartUsd <= 0) {
    return {
      roiStatus: "unsupported",
      roiUnsupportedReason: "starting equity must be greater than zero",
      roiUnsupportedReasonCode: "starting_equity_non_positive",
      roiStartEquityUsd,
      roiEndEquityUsd
    };
  }

  if (!isFiniteNumber(equityEndUsd)) {
    return {
      roiStatus: "unsupported",
      roiUnsupportedReason: "ending equity is unavailable for the requested period window",
      roiUnsupportedReasonCode: "ending_equity_unavailable",
      roiStartEquityUsd,
      roiEndEquityUsd
    };
  }

  return {
    roiStatus: "supported",
    roiUnsupportedReason: undefined,
    roiUnsupportedReasonCode: undefined,
    roiStartEquityUsd,
    roiEndEquityUsd,
    roiPct: ((equityEndUsd - equityStartUsd) / equityStartUsd) * 100
  };
}
