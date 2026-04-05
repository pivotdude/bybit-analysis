import type {
  DataCompletenessIssue,
  MarketCategory,
  Position,
  PriceSource
} from "../../../types/domain.types";
import { dec, decUnknown, toFiniteNumber } from "../../math/decimal";

export interface PositionNormalizationResult {
  positions: Position[];
  issues: DataCompletenessIssue[];
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

function detectPriceSource(entry: Record<string, unknown>): PriceSource | undefined {
  if (decUnknown(entry.markPrice).gt(0)) {
    return "mark";
  }
  if (decUnknown(entry.lastPriceOnCreated).gt(0) || decUnknown(entry.lastPrice).gt(0)) {
    return "last";
  }
  if (decUnknown(entry.indexPrice).gt(0)) {
    return "index";
  }
  return undefined;
}

function toTimestamp(input: unknown): string | undefined {
  const value = Number(input);
  if (!Number.isFinite(value) || value <= 0) {
    return undefined;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

export function normalizePositions(input: unknown, category: MarketCategory): PositionNormalizationResult {
  const payload = input as { list?: Array<Record<string, unknown>> } | undefined;
  const rows = payload?.list ?? [];
  const issues: DataCompletenessIssue[] = [];
  const positions = rows
    .map((entry, index): Position | null => {
      const qty = decUnknown(entry.size).abs();
      if (qty.eq(0)) {
        return null;
      }

      const symbol = typeof entry.symbol === "string" ? entry.symbol.trim() : "";
      const updatedAt = toTimestamp(entry.updatedTime);
      const openedAt = toTimestamp(entry.createdTime);
      const sideRaw = String(entry.side ?? "").toLowerCase();
      const priceSource = detectPriceSource(entry);
      const markPrice = decUnknown(entry.markPrice);
      const lastPrice = decUnknown(entry.lastPrice);
      const indexPrice = decUnknown(entry.indexPrice);
      const valuationPrice = markPrice.gt(0) ? markPrice : lastPrice.gt(0) ? lastPrice : indexPrice;

      if (!symbol || (sideRaw !== "buy" && sideRaw !== "sell") || !priceSource || valuationPrice.lte(0) || !updatedAt) {
        issues.push({
          code: "invalid_payload_row",
          scope: "positions",
          severity: "critical",
          criticality: "critical",
          message: `Position row ${index + 1} is malformed and was excluded from exposure/risk analytics.`
        });
        return null;
      }

      const parts = inferSymbolParts(symbol);
      const side = sideRaw === "sell" ? "short" : "long";
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
        priceSource,
        notionalUsd: toFiniteNumber(signedNotional),
        leverage: toFiniteNumber(leverageValue),
        liquidationPrice: toFiniteNumber(decUnknown(entry.liqPrice)) || undefined,
        unrealizedPnlUsd: toFiniteNumber(decUnknown(entry.unrealisedPnl)),
        initialMarginUsd: toFiniteNumber(decUnknown(entry.positionIM)) || undefined,
        maintenanceMarginUsd: toFiniteNumber(decUnknown(entry.positionMM)) || undefined,
        openedAt,
        updatedAt
      };
    })
    .filter((position): position is Position => position !== null);

  return {
    positions,
    issues
  };
}
