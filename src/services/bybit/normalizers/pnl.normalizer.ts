import type { PnLReport, RoiUnsupportedReasonCode, SymbolPnL } from "../../../types/domain.types";
import { completeDataCompleteness } from "../../reliability/dataCompleteness";
import { normalizeRoi } from "../../normalizers/roi.normalizer";

function toNumber(input: unknown): number {
  const value = Number(input);
  return Number.isFinite(value) ? value : 0;
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

  const bySymbolMap = new Map<string, SymbolPnL>();
  let realizedPnlUsd = 0;
  let tradingFeesUsd = 0;

  for (const row of rows) {
    const symbol = String(row.symbol ?? "UNKNOWN");
    const closedPnl = toNumber(row.closedPnl);
    const openFee = toNumber(row.openFee);
    const closeFee = toNumber(row.closeFee);
    const totalFee = Math.abs(openFee) + Math.abs(closeFee);

    realizedPnlUsd += closedPnl;
    tradingFeesUsd += totalFee;

    const current = bySymbolMap.get(symbol) ?? {
      symbol,
      realizedPnlUsd: 0,
      netPnlUsd: 0,
      tradesCount: 0
    };

    current.realizedPnlUsd += closedPnl;
    current.netPnlUsd += closedPnl - totalFee;
    current.tradesCount = (current.tradesCount ?? 0) + 1;

    bySymbolMap.set(symbol, current);
  }

  const bySymbol = Array.from(bySymbolMap.values()).sort(
    (left, right) => right.netPnlUsd - left.netPnlUsd || left.symbol.localeCompare(right.symbol)
  );
  const totalFeesUsd = tradingFeesUsd;
  const netPnlUsd = realizedPnlUsd + unrealizedPnlUsd - totalFeesUsd;
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
    realizedPnlUsd,
    unrealizedPnlUsd,
    fees: {
      tradingFeesUsd,
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
