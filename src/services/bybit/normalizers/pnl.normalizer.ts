import type Decimal from "decimal.js";
import type { PnLReport, RoiUnsupportedReasonCode, SymbolPnL } from "../../../types/domain.types";
import { completeDataCompleteness } from "../../reliability/dataCompleteness";
import { normalizeRoi } from "../../normalizers/roi.normalizer";
import { dec, decUnknown, toFiniteNumber } from "../../math/decimal";

interface SymbolPnlAccumulator {
  symbol: string;
  realizedPnlUsd: Decimal;
  netPnlUsd: Decimal;
  tradesCount: number;
}

export function normalizePnlReport(
  input: unknown,
  periodFrom: string,
  periodTo: string,
  unrealizedPnlUsd: number,
  equityStartUsd?: number,
  equityEndUsd?: number,
  roiMissingStartReason?: string,
  roiMissingStartReasonCode?: RoiUnsupportedReasonCode
): PnLReport {
  const payload = input as { list?: Array<Record<string, unknown>> } | undefined;
  const rows = payload?.list ?? [];

  const bySymbolMap = new Map<string, SymbolPnlAccumulator>();
  let realizedPnlUsd = dec(0);
  let tradingFeesUsd = dec(0);

  for (const row of rows) {
    const symbol = String(row.symbol ?? "UNKNOWN");
    const closedPnl = decUnknown(row.closedPnl);
    const openFee = decUnknown(row.openFee).abs();
    const closeFee = decUnknown(row.closeFee).abs();
    const totalFee = openFee.plus(closeFee);

    realizedPnlUsd = realizedPnlUsd.plus(closedPnl);
    tradingFeesUsd = tradingFeesUsd.plus(totalFee);

    const current = bySymbolMap.get(symbol) ?? {
      symbol,
      realizedPnlUsd: dec(0),
      netPnlUsd: dec(0),
      tradesCount: 0
    };

    current.realizedPnlUsd = current.realizedPnlUsd.plus(closedPnl);
    current.netPnlUsd = current.netPnlUsd.plus(closedPnl.minus(totalFee));
    current.tradesCount = (current.tradesCount ?? 0) + 1;

    bySymbolMap.set(symbol, current);
  }

  const bySymbol: SymbolPnL[] = Array.from(bySymbolMap.values())
    .map((item) => ({
      symbol: item.symbol,
      realizedPnlUsd: toFiniteNumber(item.realizedPnlUsd),
      netPnlUsd: toFiniteNumber(item.netPnlUsd),
      tradesCount: item.tradesCount
    }))
    .sort((left, right) => right.netPnlUsd - left.netPnlUsd || left.symbol.localeCompare(right.symbol));
  const totalFeesUsd = toFiniteNumber(tradingFeesUsd);
  const netPnlUsd = toFiniteNumber(realizedPnlUsd.plus(dec(unrealizedPnlUsd)).minus(tradingFeesUsd));
  const roi = normalizeRoi({
    equityStartUsd,
    equityEndUsd,
    missingStartReason: roiMissingStartReason,
    missingStartReasonCode: roiMissingStartReasonCode
  });

  return {
    source: "bybit",
    generatedAt: new Date().toISOString(),
    periodFrom,
    periodTo,
    realizedPnlUsd: toFiniteNumber(realizedPnlUsd),
    unrealizedPnlUsd,
    fees: {
      tradingFeesUsd: totalFeesUsd,
      fundingFeesUsd: 0
    },
    netPnlUsd,
    ...roi,
    bySymbol,
    bestSymbols: bySymbol.slice(0, 5),
    worstSymbols: [...bySymbol].reverse().slice(0, 5),
    dataCompleteness: completeDataCompleteness()
  };
}
