import type { ExposureReport, Position } from "../../types/domain.types";
import { calculateConcentrationRisk } from "../metrics/exposure/concentrationRisk.metric";
import { calculatePerAssetExposure } from "../metrics/exposure/perAssetExposure.metric";
import { calculateExposureTotals } from "../metrics/exposure/totalExposure.metric";

export class ExposureAnalyzer {
  analyze(positions: Position[]): ExposureReport {
    const totals = calculateExposureTotals(positions);
    const perAsset = calculatePerAssetExposure(positions, totals.grossExposureUsd);
    const concentration = calculateConcentrationRisk(perAsset);

    return {
      source: "bybit",
      asOf: new Date().toISOString(),
      totalExposureUsd: totals.totalExposureUsd,
      grossExposureUsd: totals.grossExposureUsd,
      netExposureUsd: totals.netExposureUsd,
      longExposureUsd: totals.longExposureUsd,
      shortExposureUsd: totals.shortExposureUsd,
      perAsset,
      concentration
    };
  }
}
