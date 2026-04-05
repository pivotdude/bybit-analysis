import type { PnLReport, RoiUnsupportedReasonCode, SymbolPnL } from "../../../types/domain.types";
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
  quantity: number;
  costUsd: number;
}

export type SpotInventoryCostMethod = "weighted_average";

export interface SpotPnlNormalizationOptions {
  openingExecutions?: unknown;
  inventoryCostMethod?: SpotInventoryCostMethod;
}

const STABLE_QUOTES = new Set(["USD", "USDT", "USDC", "USDE", "FDUSD", "DAI", "TUSD", "USDD"]);
const DEFAULT_INVENTORY_COST_METHOD: SpotInventoryCostMethod = "weighted_average";

function toNumber(input: unknown): number {
  const value = Number(input);
  return Number.isFinite(value) ? value : 0;
}

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
  fee: number,
  feeCurrencyRaw: string,
  symbolParts: SymbolParts,
  execPrice: number
): number {
  if (fee <= 0) {
    return 0;
  }

  const feeCurrency = feeCurrencyRaw.toUpperCase();
  const quote = symbolParts.quoteAsset.toUpperCase();
  const base = symbolParts.baseAsset.toUpperCase();

  if (feeCurrency === quote) {
    return fee;
  }

  if (feeCurrency === base) {
    return fee * execPrice;
  }

  if (STABLE_QUOTES.has(feeCurrency) && STABLE_QUOTES.has(quote)) {
    return fee;
  }

  return 0;
}

function createDefaultSymbolPnL(symbol: string): SymbolPnL {
  return {
    symbol,
    realizedPnlUsd: 0,
    netPnlUsd: 0,
    tradesCount: 0
  };
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

function applyBuy(state: InventoryState, qty: number, execValue: number): void {
  state.quantity += qty;
  state.costUsd += execValue;
}

function applySell(state: InventoryState, qty: number): { coveredQty: number; coveredCostUsd: number } {
  const heldQty = state.quantity;
  const coveredQty = Math.min(heldQty, qty);
  const avgCost = heldQty > 0 ? state.costUsd / heldQty : 0;
  const coveredCostUsd = coveredQty * avgCost;

  state.quantity = Math.max(0, heldQty - qty);
  state.costUsd = Math.max(0, state.costUsd - coveredCostUsd);

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
  const bySymbolMap = new Map<string, SymbolPnL>();
  const feesBySymbol = new Map<string, number>();
  const uncoveredSellQtyBySymbol = new Map<string, number>();

  let realizedPnlUsd = 0;
  let tradingFeesUsd = 0;

  for (const row of sortedOpeningRows) {
    const symbol = String(row.symbol ?? "UNKNOWN").toUpperCase();
    const side = String(row.side ?? "").toLowerCase();
    const qty = toNumber(row.execQty);
    const execValue = toNumber(row.execValue);

    if (qty <= 0 || execValue <= 0 || (side !== "buy" && side !== "sell")) {
      continue;
    }

    const state = inventoryBySymbol.get(symbol) ?? { quantity: 0, costUsd: 0 };
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
    const qty = toNumber(row.execQty);
    const execValue = toNumber(row.execValue);
    const price = toNumber(row.execPrice) || (qty > 0 ? execValue / qty : 0);
    const fee = toNumber(row.execFee);
    const feeCurrency = String(row.feeCurrency ?? "");

    if (qty <= 0 || execValue <= 0 || price <= 0 || (side !== "buy" && side !== "sell")) {
      continue;
    }

    const parts = inferSymbolParts(symbol);
    const feeEstimate = estimateFeeUsd(fee, feeCurrency, parts, price);

    tradingFeesUsd += feeEstimate;
    feesBySymbol.set(symbol, (feesBySymbol.get(symbol) ?? 0) + feeEstimate);

    const symbolPnl = bySymbolMap.get(symbol) ?? createDefaultSymbolPnL(symbol);
    symbolPnl.tradesCount = (symbolPnl.tradesCount ?? 0) + 1;

    const state = inventoryBySymbol.get(symbol) ?? { quantity: 0, costUsd: 0 };

    if (side === "buy") {
      applyBuy(state, qty, execValue);
    } else {
      if (inventoryCostMethod !== "weighted_average") {
        throw new Error(`Unsupported spot inventory cost method: ${String(inventoryCostMethod)}`);
      }

      // Realized PnL is computed only for quantity with known weighted-average cost basis.
      const { coveredQty, coveredCostUsd } = applySell(state, qty);
      const uncoveredQty = Math.max(0, qty - coveredQty);
      const unitProceedsUsd = qty > 0 ? execValue / qty : 0;
      const coveredProceedsUsd = coveredQty * unitProceedsUsd;
      const grossPnl = coveredProceedsUsd - coveredCostUsd;

      realizedPnlUsd += grossPnl;
      symbolPnl.realizedPnlUsd += grossPnl;

      if (uncoveredQty > 0) {
        uncoveredSellQtyBySymbol.set(symbol, (uncoveredSellQtyBySymbol.get(symbol) ?? 0) + uncoveredQty);
      }
    }

    inventoryBySymbol.set(symbol, state);
    bySymbolMap.set(symbol, symbolPnl);
  }

  const bySymbol = Array.from(bySymbolMap.values())
    .map((item) => {
      const fee = feesBySymbol.get(item.symbol) ?? 0;
      return {
        ...item,
        netPnlUsd: item.realizedPnlUsd - fee
      };
    })
    .sort((left, right) => right.netPnlUsd - left.netPnlUsd || left.symbol.localeCompare(right.symbol));

  const netPnlUsd = realizedPnlUsd - tradingFeesUsd;
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
    realizedPnlUsd,
    unrealizedPnlUsd: 0,
    fees: {
      tradingFeesUsd,
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
