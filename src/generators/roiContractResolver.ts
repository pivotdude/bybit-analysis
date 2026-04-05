import type { RoiContract, RoiUnsupportedReasonCode } from "../types/domain.types";
import { fmtPct, fmtUsd } from "./formatters";

type RoiLike = Pick<
  RoiContract,
  "roiStatus" | "roiPct" | "roiStartEquityUsd" | "roiEndEquityUsd" | "roiUnsupportedReasonCode" | "roiUnsupportedReason"
>;

export interface ResolvedRoiContract {
  roiStatus: RoiContract["roiStatus"];
  roiKpiValue: string;
  pnlStatusLines: string[];
  narrativeLines: string[];
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function resolveUnsupportedReason(roi: RoiLike): { code: RoiUnsupportedReasonCode; reason: string } {
  if (!roi.roiUnsupportedReasonCode || !roi.roiUnsupportedReason) {
    throw new Error("Unsupported ROI contract must include roiUnsupportedReasonCode and roiUnsupportedReason");
  }

  return {
    code: roi.roiUnsupportedReasonCode,
    reason: roi.roiUnsupportedReason
  };
}

export function resolveRoiContract(roi: RoiLike): ResolvedRoiContract {
  if (roi.roiStatus === "supported") {
    if (!isFiniteNumber(roi.roiPct)) {
      throw new Error("Supported ROI contract must include a finite roiPct");
    }

    return {
      roiStatus: "supported",
      roiKpiValue: fmtPct(roi.roiPct),
      pnlStatusLines: [
        "Status: supported",
        ...(isFiniteNumber(roi.roiStartEquityUsd) ? [`Start equity: ${fmtUsd(roi.roiStartEquityUsd)}`] : []),
        ...(isFiniteNumber(roi.roiEndEquityUsd) ? [`End equity: ${fmtUsd(roi.roiEndEquityUsd)}`] : [])
      ],
      narrativeLines: ["ROI status: supported"]
    };
  }

  const { code, reason } = resolveUnsupportedReason(roi);
  return {
    roiStatus: "unsupported",
    roiKpiValue: "unsupported",
    pnlStatusLines: ["Status: unsupported", `Code: ${code}`, `Reason: ${reason}`],
    narrativeLines: ["ROI status: unsupported", `ROI unsupported code: ${code}`, `ROI unsupported reason: ${reason}`]
  };
}
