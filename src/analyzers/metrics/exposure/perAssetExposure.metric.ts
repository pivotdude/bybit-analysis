import type { AssetExposure, Position } from "../../../types/domain.types";

interface AggregateExposure {
  exposureUsd: number;
  longExposureUsd: number;
  shortExposureUsd: number;
  symbols: Set<string>;
}

export function calculatePerAssetExposure(positions: Position[], grossExposureUsd: number): AssetExposure[] {
  const byAsset = new Map<string, AggregateExposure>();

  for (const position of positions) {
    const current = byAsset.get(position.baseAsset) ?? {
      exposureUsd: 0,
      longExposureUsd: 0,
      shortExposureUsd: 0,
      symbols: new Set<string>()
    };

    const absolute = Math.abs(position.notionalUsd);
    current.exposureUsd += absolute;

    if (position.notionalUsd >= 0) {
      current.longExposureUsd += position.notionalUsd;
    } else {
      current.shortExposureUsd += Math.abs(position.notionalUsd);
    }

    current.symbols.add(position.symbol);
    byAsset.set(position.baseAsset, current);
  }

  return Array.from(byAsset.entries())
    .map(([asset, aggregate]): AssetExposure => ({
      asset,
      exposureUsd: aggregate.exposureUsd,
      exposurePct: grossExposureUsd > 0 ? (aggregate.exposureUsd / grossExposureUsd) * 100 : 0,
      longExposureUsd: aggregate.longExposureUsd,
      shortExposureUsd: aggregate.shortExposureUsd,
      symbols: Array.from(aggregate.symbols).sort((left, right) => left.localeCompare(right))
    }))
    .sort((left, right) => right.exposureUsd - left.exposureUsd);
}
