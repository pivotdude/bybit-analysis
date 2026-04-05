import type { AssetExposure, ConcentrationRisk, RiskBand } from "../../../types/domain.types";

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
  const top3Pct = sorted.slice(0, 3).reduce((sum, item) => sum + item.exposurePct, 0);
  const hhi = sorted.reduce((sum, item) => {
    const share = item.exposurePct / 100;
    return sum + share * share;
  }, 0);

  return {
    top1Asset: top1.asset,
    top1Pct: top1.exposurePct,
    top3Pct,
    hhi,
    band: toBand(top1.exposurePct, top3Pct, hhi)
  };
}
