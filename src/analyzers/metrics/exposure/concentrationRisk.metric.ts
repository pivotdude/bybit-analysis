import type { AssetExposure, ConcentrationRisk, RiskBand } from "../../../types/domain.types";
import { dec, toFiniteNumber } from "../../../services/math/decimal";

function toBand(top1Pct: number, top3Pct: number, hhi: number): RiskBand {
  if (top1Pct >= 45 || top3Pct >= 80 || hhi >= 0.30) {
    return "high";
  }
  if (top1Pct >= 25 || top3Pct >= 60 || hhi >= 0.18) {
    return "medium";
  }
  return "low";
}

export function calculateConcentrationRisk(perAsset: AssetExposure[]): ConcentrationRisk {
  if (perAsset.length === 0) {
    return {
      top1Asset: "N/A",
      top1Pct: 0,
      top3Pct: 0,
      hhi: 0,
      band: "low"
    };
  }

  const sorted = [...perAsset].sort(
    (left, right) => right.exposurePct - left.exposurePct || left.asset.localeCompare(right.asset)
  );
  const top1 = sorted[0] ?? {
    asset: "N/A",
    exposurePct: 0
  };
  const top3Pct = sorted.slice(0, 3).reduce((sum, item) => sum.plus(dec(item.exposurePct)), dec(0));
  const hhi = sorted.reduce((sum, item) => {
    const share = dec(item.exposurePct).div(100);
    return sum.plus(share.mul(share));
  }, dec(0));
  const top1Pct = dec(top1.exposurePct);
  const top3PctNumber = toFiniteNumber(top3Pct);
  const hhiNumber = toFiniteNumber(hhi);

  return {
    top1Asset: top1.asset,
    top1Pct: toFiniteNumber(top1Pct),
    top3Pct: top3PctNumber,
    hhi: hhiNumber,
    band: toBand(toFiniteNumber(top1Pct), top3PctNumber, hhiNumber)
  };
}
