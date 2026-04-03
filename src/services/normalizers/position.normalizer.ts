import type { MarketCategory, Position, PriceSource } from "../../types/domain.types";

function toNumber(input: unknown): number {
  const value = Number(input);
  return Number.isFinite(value) ? value : 0;
}

function inferSymbolParts(symbol: string): { baseAsset: string; quoteAsset: string } {
  const quoteCandidates = ["USDT", "USDC", "USD", "BTC", "ETH"];
  for (const quote of quoteCandidates) {
    if (symbol.endsWith(quote) && symbol.length > quote.length) {
      return {
        baseAsset: symbol.slice(0, -quote.length),
        quoteAsset: quote
      };
    }
  }
  return { baseAsset: symbol, quoteAsset: "USD" };
}

function detectPriceSource(entry: Record<string, unknown>): PriceSource {
  if (toNumber(entry.markPrice) > 0) {
    return "mark";
  }
  if (toNumber(entry.lastPriceOnCreated) > 0 || toNumber(entry.lastPrice) > 0) {
    return "last";
  }
  return "index";
}

export function normalizePositions(input: unknown, category: MarketCategory): Position[] {
  const payload = input as { list?: Array<Record<string, unknown>> } | undefined;
  const rows = payload?.list ?? [];

  return rows
    .map((entry): Position | null => {
      const qty = Math.abs(toNumber(entry.size));
      if (qty === 0) {
        return null;
      }

      const symbol = String(entry.symbol ?? "UNKNOWN");
      const sideRaw = String(entry.side ?? "Buy").toLowerCase();
      const side = sideRaw === "sell" ? "short" : "long";
      const parts = inferSymbolParts(symbol);

      const valuationPrice = toNumber(entry.markPrice) || toNumber(entry.lastPrice) || toNumber(entry.indexPrice);
      const positionValue = toNumber(entry.positionValue) || qty * valuationPrice;
      const signedNotional = side === "short" ? -Math.abs(positionValue) : Math.abs(positionValue);

      const marginModeRaw = toNumber(entry.tradeMode);
      const marginMode = marginModeRaw === 1 ? "isolated" : "cross";

      return {
        source: "bybit",
        exchange: "bybit",
        category,
        symbol,
        baseAsset: parts.baseAsset,
        quoteAsset: parts.quoteAsset,
        side,
        marginMode,
        quantity: qty,
        entryPrice: toNumber(entry.avgPrice),
        valuationPrice,
        priceSource: detectPriceSource(entry),
        notionalUsd: signedNotional,
        leverage: Math.max(1, toNumber(entry.leverage)),
        liquidationPrice: toNumber(entry.liqPrice) || undefined,
        unrealizedPnlUsd: toNumber(entry.unrealisedPnl),
        initialMarginUsd: toNumber(entry.positionIM) || undefined,
        maintenanceMarginUsd: toNumber(entry.positionMM) || undefined,
        openedAt: entry.createdTime ? new Date(toNumber(entry.createdTime)).toISOString() : undefined,
        updatedAt: entry.updatedTime ? new Date(toNumber(entry.updatedTime)).toISOString() : new Date().toISOString()
      };
    })
    .filter((position): position is Position => position !== null);
}
