import type { PnLReport } from "../../types/domain.types";

interface NormalizeRoiInput {
  equityStartUsd?: number;
  equityEndUsd?: number;
  missingStartReason?: string;
}

type NormalizedRoi = Pick<
  PnLReport,
  "roiStatus" | "roiUnsupportedReason" | "roiStartEquityUsd" | "roiEndEquityUsd" | "roiPct"
>;

const DEFAULT_MISSING_START_REASON = "starting equity is unavailable for the requested period window";

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function normalizeRoi({
  equityStartUsd,
  equityEndUsd,
  missingStartReason = DEFAULT_MISSING_START_REASON
}: NormalizeRoiInput): NormalizedRoi {
  const roiStartEquityUsd = isFiniteNumber(equityStartUsd) ? equityStartUsd : undefined;
  const roiEndEquityUsd = isFiniteNumber(equityEndUsd) ? equityEndUsd : undefined;

  if (!isFiniteNumber(equityStartUsd)) {
    return {
      roiStatus: "unsupported",
      roiUnsupportedReason: missingStartReason,
      roiStartEquityUsd,
      roiEndEquityUsd
    };
  }

  if (equityStartUsd <= 0) {
    return {
      roiStatus: "unsupported",
      roiUnsupportedReason: "starting equity must be greater than zero",
      roiStartEquityUsd,
      roiEndEquityUsd
    };
  }

  if (!isFiniteNumber(equityEndUsd)) {
    return {
      roiStatus: "unsupported",
      roiUnsupportedReason: "ending equity is unavailable for the requested period window",
      roiStartEquityUsd,
      roiEndEquityUsd
    };
  }

  return {
    roiStatus: "supported",
    roiUnsupportedReason: undefined,
    roiStartEquityUsd,
    roiEndEquityUsd,
    roiPct: ((equityEndUsd - equityStartUsd) / equityStartUsd) * 100
  };
}
