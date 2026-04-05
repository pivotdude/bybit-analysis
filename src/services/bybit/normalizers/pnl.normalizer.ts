import type Decimal from "decimal.js";
import type {
  DataCompletenessIssue,
  HistoricalBoundaryState,
  PnLReport,
  RoiUnsupportedReasonCode,
  SymbolPnL
} from "../../../types/domain.types";
import { completeDataCompleteness, degradedDataCompleteness } from "../../reliability/dataCompleteness";
import { normalizeRoi } from "../../normalizers/roi.normalizer";
import { dec, toFiniteNumber } from "../../math/decimal";

interface SymbolPnlAccumulator {
  symbol: string;
  realizedPnlUsd: Decimal;
  netPnlUsd: Decimal;
  tradesCount: number;
}

function parseRequiredNumber(input: unknown): number | undefined {
  if (input === null || input === undefined) {
    return undefined;
  }
  if (typeof input === "string" && input.trim().length === 0) {
    return undefined;
  }
  const value = Number(input);
  return Number.isFinite(value) ? value : undefined;
}

export function normalizePnlReport(
  input: unknown,
  periodFrom: string,
  periodTo: string,
  unrealizedPnlUsd: number,
  equityStartUsd?: number,
  endingState?: HistoricalBoundaryState,
  roiMissingStartReason?: string,
  roiMissingStartReasonCode?: RoiUnsupportedReasonCode
): PnLReport {
  const payload = input as { list?: Array<Record<string, unknown>> } | undefined;
  const rows = payload?.list ?? [];
  const issues: DataCompletenessIssue[] = [];

  const bySymbolMap = new Map<string, SymbolPnlAccumulator>();
  let realizedPnlUsdTotal = dec(0);
  let tradingFeesUsd = dec(0);

  for (const [index, row] of rows.entries()) {
    const symbol = typeof row.symbol === "string" ? row.symbol.trim() : "";
    const closedPnl = parseRequiredNumber(row.closedPnl);
    const openFee = parseRequiredNumber(row.openFee);
    const closeFee = parseRequiredNumber(row.closeFee);

    if (!symbol || closedPnl === undefined || openFee === undefined || closeFee === undefined) {
      issues.push({
        code: "invalid_payload_row",
        scope: "closed_pnl",
        severity: "critical",
        criticality: "critical",
        message: `Closed PnL row ${index + 1} is malformed and was excluded from period totals.`
      });
      continue;
    }

    const closedPnlDecimal = dec(closedPnl);
    const totalFee = dec(openFee).abs().plus(dec(closeFee).abs());

    realizedPnlUsdTotal = realizedPnlUsdTotal.plus(closedPnlDecimal);
    tradingFeesUsd = tradingFeesUsd.plus(totalFee);

    const current = bySymbolMap.get(symbol) ?? {
      symbol,
      realizedPnlUsd: dec(0),
      netPnlUsd: dec(0),
      tradesCount: 0
    };

    current.realizedPnlUsd = current.realizedPnlUsd.plus(closedPnlDecimal);
    current.netPnlUsd = current.netPnlUsd.plus(closedPnlDecimal.minus(totalFee));
    current.tradesCount += 1;
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
  const netPnlUsd = toFiniteNumber(realizedPnlUsdTotal.plus(dec(unrealizedPnlUsd)).minus(tradingFeesUsd));
  const roi = normalizeRoi({
    equityStartUsd,
    equityEndUsd: endingState?.totalEquityUsd,
    missingStartReason: roiMissingStartReason,
    missingStartReasonCode: roiMissingStartReasonCode
  });

  return {
    source: "bybit",
    generatedAt: new Date().toISOString(),
    periodFrom,
    periodTo,
    realizedPnlUsd: toFiniteNumber(realizedPnlUsdTotal),
    unrealizedPnlUsd,
    fees: {
      tradingFeesUsd: totalFeesUsd,
      fundingFeesUsd: 0
    },
    netPnlUsd,
    endStateStatus: endingState ? "supported" : "unsupported",
    endState: endingState,
    endStateUnsupportedReason: endingState
      ? undefined
      : "Historical period end-state is unavailable: period end unrealized PnL and ending-equity metrics are unsupported.",
    endStateUnsupportedReasonCode: endingState ? undefined : "historical_end_state_unavailable",
    ...roi,
    bySymbol,
    bestSymbols: bySymbol.slice(0, 5),
    worstSymbols: [...bySymbol].reverse().slice(0, 5),
    dataCompleteness: issues.length > 0 ? degradedDataCompleteness(issues) : completeDataCompleteness()
  };
}
