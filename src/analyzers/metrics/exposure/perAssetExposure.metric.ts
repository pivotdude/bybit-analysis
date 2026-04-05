import type { AssetExposure, Position } from "../../../types/domain.types";
import type Decimal from "decimal.js";
import { dec, safePct, toFiniteNumber } from "../../../services/math/decimal";

interface AggregateExposure {
  exposureUsd: Decimal;
  longExposureUsd: Decimal;
  shortExposureUsd: Decimal;
  symbols: Set<string>;
}

export function calculatePerAssetExposure(positions: Position[], grossExposureUsd: number): AssetExposure[] {
  const byAsset = new Map<string, AggregateExposure>();
  const grossExposureUsdDecimal = dec(grossExposureUsd);

  for (const position of positions) {
    const current = byAsset.get(position.baseAsset) ?? {
      exposureUsd: dec(0),
      longExposureUsd: dec(0),
      shortExposureUsd: dec(0),
      symbols: new Set<string>()
    };

    const notional = dec(position.notionalUsd);
    const absolute = notional.abs();
    current.exposureUsd = current.exposureUsd.plus(absolute);

    if (notional.gte(0)) {
      current.longExposureUsd = current.longExposureUsd.plus(notional);
    } else {
      current.shortExposureUsd = current.shortExposureUsd.plus(notional.abs());
    }

    current.symbols.add(position.symbol);
    byAsset.set(position.baseAsset, current);
  }

  return Array.from(byAsset.entries())
    .map(([asset, aggregate]): AssetExposure => ({
      asset,
      exposureUsd: toFiniteNumber(aggregate.exposureUsd),
      exposurePct: toFiniteNumber(safePct(aggregate.exposureUsd, grossExposureUsdDecimal)),
      longExposureUsd: toFiniteNumber(aggregate.longExposureUsd),
      shortExposureUsd: toFiniteNumber(aggregate.shortExposureUsd),
      symbols: Array.from(aggregate.symbols).sort((left, right) => left.localeCompare(right))
    }))
    .sort((left, right) => right.exposureUsd - left.exposureUsd || left.asset.localeCompare(right.asset));
}
