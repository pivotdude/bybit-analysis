import type { MarketCategory, Position, PriceSource } from "../../../types/domain.types";
import { dec, decUnknown, toFiniteNumber } from "../../math/decimal";

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
  if (decUnknown(entry.markPrice).gt(0)) {
    return "mark";
  }
  if (decUnknown(entry.lastPriceOnCreated).gt(0) || decUnknown(entry.lastPrice).gt(0)) {
    return "last";
  }
  return "index";
}

export function normalizePositions(input: unknown, category: MarketCategory): Position[] {
  const payload = input as { list?: Array<Record<string, unknown>> } | undefined;
  const rows = payload?.list ?? [];

  return rows
    .map((entry): Position | null => {
      const qty = decUnknown(entry.size).abs();
      if (qty.eq(0)) {
        return null;
      }

      const symbol = String(entry.symbol ?? "UNKNOWN");
      const sideRaw = String(entry.side ?? "Buy").toLowerCase();
      const side = sideRaw === "sell" ? "short" : "long";
      const parts = inferSymbolParts(symbol);

      const markPrice = decUnknown(entry.markPrice);
      const lastPrice = decUnknown(entry.lastPrice);
      const indexPrice = decUnknown(entry.indexPrice);
      const valuationPrice = markPrice.gt(0) ? markPrice : lastPrice.gt(0) ? lastPrice : indexPrice;
      const positionValueRaw = decUnknown(entry.positionValue);
      const positionValue = positionValueRaw.gt(0) ? positionValueRaw : qty.mul(valuationPrice);
      const absoluteNotional = positionValue.abs();
      const signedNotional = side === "short" ? absoluteNotional.neg() : absoluteNotional;

      const marginModeRaw = decUnknown(entry.tradeMode);
      const marginMode = marginModeRaw.eq(1) ? "isolated" : "cross";
      const leverage = decUnknown(entry.leverage);
      const leverageValue = leverage.lt(1) ? dec(1) : leverage;

      return {
        source: "bybit",
        exchange: "bybit",
        category,
        symbol,
        baseAsset: parts.baseAsset,
        quoteAsset: parts.quoteAsset,
        side,
        marginMode,
        quantity: toFiniteNumber(qty),
        entryPrice: toFiniteNumber(decUnknown(entry.avgPrice)),
        valuationPrice: toFiniteNumber(valuationPrice),
        priceSource: detectPriceSource(entry),
        notionalUsd: toFiniteNumber(signedNotional),
        leverage: toFiniteNumber(leverageValue),
        liquidationPrice: toFiniteNumber(decUnknown(entry.liqPrice)) || undefined,
        unrealizedPnlUsd: toFiniteNumber(decUnknown(entry.unrealisedPnl)),
        initialMarginUsd: toFiniteNumber(decUnknown(entry.positionIM)) || undefined,
        maintenanceMarginUsd: toFiniteNumber(decUnknown(entry.positionMM)) || undefined,
        openedAt: entry.createdTime ? new Date(toFiniteNumber(decUnknown(entry.createdTime))).toISOString() : undefined,
        updatedAt: entry.updatedTime
          ? new Date(toFiniteNumber(decUnknown(entry.updatedTime))).toISOString()
          : new Date().toISOString()
      };
    })
    .filter((position): position is Position => position !== null);
}
