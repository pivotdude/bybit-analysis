import type { PnLReport, SymbolPnL } from "../../types/domain.types";

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

const STABLE_QUOTES = new Set(["USD", "USDT", "USDC", "USDE", "FDUSD", "DAI", "TUSD", "USDD"]);

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
    unrealizedPnlUsd: 0,
    netPnlUsd: 0,
    tradesCount: 0
  };
}

export function normalizeSpotPnlReport(
  input: unknown,
  periodFrom: string,
  periodTo: string,
  equityStartUsd?: number,
  equityEndUsd?: number
): PnLReport {
  const payload = input as { list?: Array<Record<string, unknown>> } | undefined;
  const rows = (payload?.list ?? []) as SpotExecutionRow[];

  const sortedRows = [...rows].sort((left, right) => toTimestamp(left.execTime) - toTimestamp(right.execTime));
  const inventoryBySymbol = new Map<string, InventoryState>();
  const bySymbolMap = new Map<string, SymbolPnL>();
  const feesBySymbol = new Map<string, number>();

  let realizedPnlUsd = 0;
  let tradingFeesUsd = 0;

  for (const row of sortedRows) {
    const execType = String(row.execType ?? "Trade");
    if (execType !== "Trade") {
      continue;
    }

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
      state.quantity += qty;
      state.costUsd += execValue;
    } else {
      const heldQty = state.quantity;
      const avgCost = heldQty > 0 ? state.costUsd / heldQty : price;
      const coveredQty = Math.min(heldQty, qty);
      const uncoveredQty = Math.max(0, qty - heldQty);
      const coveredCost = coveredQty * avgCost;
      // If the sold amount exceeds tracked inventory for this window,
      // anchor uncovered cost at execution price to avoid artificial gains.
      const uncoveredCost = uncoveredQty * price;
      const grossPnl = execValue - (coveredCost + uncoveredCost);

      realizedPnlUsd += grossPnl;
      symbolPnl.realizedPnlUsd += grossPnl;

      state.quantity = Math.max(0, heldQty - qty);
      state.costUsd = Math.max(0, state.costUsd - coveredCost);
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
    .sort((left, right) => right.netPnlUsd - left.netPnlUsd);

  const netPnlUsd = realizedPnlUsd - tradingFeesUsd;
  const roiPct =
    equityStartUsd && equityStartUsd > 0 && typeof equityEndUsd === "number"
      ? ((equityEndUsd - equityStartUsd) / equityStartUsd) * 100
      : undefined;

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
    roiPct,
    bySymbol,
    bestSymbols: bySymbol.slice(0, 5),
    worstSymbols: [...bySymbol].reverse().slice(0, 5),
    dataCompleteness: {
      partial: false,
      warnings: []
    }
  };
}
