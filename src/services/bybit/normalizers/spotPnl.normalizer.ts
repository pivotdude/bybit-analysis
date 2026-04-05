import type Decimal from "decimal.js";
import type { PnLReport, RoiUnsupportedReasonCode, SymbolPnL } from "../../../types/domain.types";
import { dec, decUnknown, safeDiv, toFiniteNumber } from "../../math/decimal";
import { completeDataCompleteness, degradedDataCompleteness } from "../../reliability/dataCompleteness";
import { normalizeRoi } from "../../normalizers/roi.normalizer";

interface SymbolParts {
  baseAsset: string;
  quoteAsset: string;
}

interface SpotExecutionRow {
  symbol?: unknown;
  side?: unknown;
  execQty?: unknown;
  execValue?: unknown;
  execPrice?: unknown;
  execFee?: unknown;
  feeCurrency?: unknown;
  execType?: unknown;
  execTime?: unknown;
}

interface InventoryState {
  quantity: Decimal;
  costUsd: Decimal;
}

interface SymbolPnlAccumulator {
  symbol: string;
  realizedPnlUsd: Decimal;
  tradesCount: number;
}

export type SpotInventoryCostMethod = "weighted_average";

export interface SpotPnlNormalizationOptions {
  openingExecutions?: unknown;
  inventoryCostMethod?: SpotInventoryCostMethod;
}

const STABLE_QUOTES = new Set(["USD", "USDT", "USDC", "USDE", "FDUSD", "DAI", "TUSD", "USDD"]);
const DEFAULT_INVENTORY_COST_METHOD: SpotInventoryCostMethod = "weighted_average";

function toTimestamp(input: unknown): number {
  const value = Number(input);
  return Number.isFinite(value) ? value : 0;
}

function inferSymbolParts(symbol: string): SymbolParts {
  const quoteCandidates = ["USDT", "USDC", "USD", "BTC", "ETH", "EUR", "BRL"];
  for (const quote of quoteCandidates) {
    if (symbol.endsWith(quote) && symbol.length > quote.length) {
      return {
        baseAsset: symbol.slice(0, -quote.length),
        quoteAsset: quote
      };
    }
  }

  return {
    baseAsset: symbol,
    quoteAsset: "USD"
  };
}

function estimateFeeUsd(
  fee: Decimal,
  feeCurrencyRaw: string,
  symbolParts: SymbolParts,
  execPrice: Decimal
): Decimal {
  if (fee.lte(0)) {
    return dec(0);
  }

  const feeCurrency = feeCurrencyRaw.toUpperCase();
  const quote = symbolParts.quoteAsset.toUpperCase();
  const base = symbolParts.baseAsset.toUpperCase();

  if (feeCurrency === quote) {
    return fee;
  }

  if (feeCurrency === base) {
    return fee.mul(execPrice);
  }

  if (STABLE_QUOTES.has(feeCurrency) && STABLE_QUOTES.has(quote)) {
    return fee;
  }

  return dec(0);
}

function isTradeRow(row: SpotExecutionRow): boolean {
  return String(row.execType ?? "Trade") === "Trade";
}

function normalizeExecutionRows(input: unknown): SpotExecutionRow[] {
  const payload = input as { list?: Array<Record<string, unknown>> } | undefined;
  return (payload?.list ?? []) as SpotExecutionRow[];
}

function compareExecutionRows(left: SpotExecutionRow, right: SpotExecutionRow): number {
  const byTime = toTimestamp(left.execTime) - toTimestamp(right.execTime);
  if (byTime !== 0) {
    return byTime;
  }

  // Cost basis is order-sensitive within the same symbol+timestamp; preserve API order there.
  const leftSymbol = String(left.symbol ?? "UNKNOWN");
  const rightSymbol = String(right.symbol ?? "UNKNOWN");
  return leftSymbol.localeCompare(rightSymbol);
}

function applyBuy(state: InventoryState, qty: Decimal, execValue: Decimal): void {
  state.quantity = state.quantity.plus(qty);
  state.costUsd = state.costUsd.plus(execValue);
}

function applySell(state: InventoryState, qty: Decimal): { coveredQty: Decimal; coveredCostUsd: Decimal } {
  const heldQty = state.quantity;
  const coveredQty = heldQty.lt(qty) ? heldQty : qty;
  const avgCost = heldQty.gt(0) ? state.costUsd.div(heldQty) : dec(0);
  const coveredCostUsd = coveredQty.mul(avgCost);

  state.quantity = heldQty.minus(qty);
  if (state.quantity.lt(0)) {
    state.quantity = dec(0);
  }

  state.costUsd = state.costUsd.minus(coveredCostUsd);
  if (state.costUsd.lt(0)) {
    state.costUsd = dec(0);
  }

  return { coveredQty, coveredCostUsd };
}

export function normalizeSpotPnlReport(
  input: unknown,
  periodFrom: string,
  periodTo: string,
  equityStartUsd?: number,
  equityEndUsd?: number,
  options: SpotPnlNormalizationOptions = {},
  roiMissingStartReason?: string,
  roiMissingStartReasonCode?: RoiUnsupportedReasonCode
): PnLReport {
  const inventoryCostMethod = options.inventoryCostMethod ?? DEFAULT_INVENTORY_COST_METHOD;
  const rows = normalizeExecutionRows(input);
  const openingRows = normalizeExecutionRows(options.openingExecutions);

  const sortedOpeningRows = [...openingRows]
    .filter((row) => isTradeRow(row))
    .sort(compareExecutionRows);
  const sortedRows = [...rows]
    .filter((row) => isTradeRow(row))
    .sort(compareExecutionRows);

  const inventoryBySymbol = new Map<string, InventoryState>();
  const bySymbolMap = new Map<string, SymbolPnlAccumulator>();
  const feesBySymbol = new Map<string, Decimal>();
  const uncoveredSellQtyBySymbol = new Map<string, Decimal>();

  let realizedPnlUsd = dec(0);
  let tradingFeesUsd = dec(0);

  for (const row of sortedOpeningRows) {
    const symbol = String(row.symbol ?? "UNKNOWN").toUpperCase();
    const side = String(row.side ?? "").toLowerCase();
    const qty = decUnknown(row.execQty);
    const execValue = decUnknown(row.execValue);

    if (qty.lte(0) || execValue.lte(0) || (side !== "buy" && side !== "sell")) {
      continue;
    }

    const state = inventoryBySymbol.get(symbol) ?? { quantity: dec(0), costUsd: dec(0) };
    if (side === "buy") {
      applyBuy(state, qty, execValue);
    } else {
      applySell(state, qty);
    }
    inventoryBySymbol.set(symbol, state);
  }

  for (const row of sortedRows) {
    const symbol = String(row.symbol ?? "UNKNOWN").toUpperCase();
    const side = String(row.side ?? "").toLowerCase();
    const qty = decUnknown(row.execQty);
    const execValue = decUnknown(row.execValue);
    const rawPrice = decUnknown(row.execPrice);
    const price = rawPrice.gt(0) ? rawPrice : qty.gt(0) ? safeDiv(execValue, qty) : dec(0);
    const fee = decUnknown(row.execFee);
    const feeCurrency = String(row.feeCurrency ?? "");

    if (qty.lte(0) || execValue.lte(0) || price.lte(0) || (side !== "buy" && side !== "sell")) {
      continue;
    }

    const parts = inferSymbolParts(symbol);
    const feeEstimate = estimateFeeUsd(fee, feeCurrency, parts, price);

    tradingFeesUsd = tradingFeesUsd.plus(feeEstimate);
    feesBySymbol.set(symbol, (feesBySymbol.get(symbol) ?? dec(0)).plus(feeEstimate));

    const symbolPnl = bySymbolMap.get(symbol) ?? {
      symbol,
      realizedPnlUsd: dec(0),
      tradesCount: 0
    };
    symbolPnl.tradesCount = (symbolPnl.tradesCount ?? 0) + 1;

    const state = inventoryBySymbol.get(symbol) ?? { quantity: dec(0), costUsd: dec(0) };

    if (side === "buy") {
      applyBuy(state, qty, execValue);
    } else {
      if (inventoryCostMethod !== "weighted_average") {
        throw new Error(`Unsupported spot inventory cost method: ${String(inventoryCostMethod)}`);
      }

      // Realized PnL is computed only for quantity with known weighted-average cost basis.
      const { coveredQty, coveredCostUsd } = applySell(state, qty);
      const uncoveredQty = qty.minus(coveredQty);
      const unitProceedsUsd = safeDiv(execValue, qty);
      const coveredProceedsUsd = coveredQty.mul(unitProceedsUsd);
      const grossPnl = coveredProceedsUsd.minus(coveredCostUsd);

      realizedPnlUsd = realizedPnlUsd.plus(grossPnl);
      symbolPnl.realizedPnlUsd = symbolPnl.realizedPnlUsd.plus(grossPnl);

      if (uncoveredQty.gt(0)) {
        uncoveredSellQtyBySymbol.set(symbol, (uncoveredSellQtyBySymbol.get(symbol) ?? dec(0)).plus(uncoveredQty));
      }
    }

    inventoryBySymbol.set(symbol, state);
    bySymbolMap.set(symbol, symbolPnl);
  }

  const bySymbol: SymbolPnL[] = Array.from(bySymbolMap.values())
    .map((item) => {
      const fee = feesBySymbol.get(item.symbol) ?? dec(0);
      return {
        symbol: item.symbol,
        realizedPnlUsd: toFiniteNumber(item.realizedPnlUsd),
        netPnlUsd: toFiniteNumber(item.realizedPnlUsd.minus(fee)),
        tradesCount: item.tradesCount
      };
    })
    .sort((left, right) => right.netPnlUsd - left.netPnlUsd || left.symbol.localeCompare(right.symbol));

  const netPnlUsd = toFiniteNumber(realizedPnlUsd.minus(tradingFeesUsd));
  const roi = normalizeRoi({
    equityStartUsd,
    equityEndUsd,
    missingStartReason: roiMissingStartReason,
    missingStartReasonCode: roiMissingStartReasonCode
  });
  const warnings = Array.from(uncoveredSellQtyBySymbol.entries()).map(
    ([symbol, unmatchedQty]) =>
      `Unable to reconstruct full spot cost basis for ${symbol}: ${unmatchedQty.toFixed(8)} quantity sold in the period was unmatched by opening inventory. Realized PnL excludes unmatched quantity.`
  );
  const issues = warnings.map((message) => ({
    code: "spot_cost_basis_incomplete" as const,
    scope: "opening_inventory" as const,
    severity: "warning" as const,
    criticality: "optional" as const,
    message
  }));

  return {
    source: "bybit",
    generatedAt: new Date().toISOString(),
    periodFrom,
    periodTo,
    realizedPnlUsd: toFiniteNumber(realizedPnlUsd),
    unrealizedPnlUsd: 0,
    fees: {
      tradingFeesUsd: toFiniteNumber(tradingFeesUsd),
      fundingFeesUsd: 0
    },
    netPnlUsd,
    ...roi,
    bySymbol,
    bestSymbols: bySymbol.slice(0, 5),
    worstSymbols: [...bySymbol].reverse().slice(0, 5),
    dataCompleteness: issues.length > 0 ? degradedDataCompleteness(issues) : completeDataCompleteness()
  };
}
