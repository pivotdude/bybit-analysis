import type Decimal from "decimal.js";
import type { BotSummary } from "../../../types/domain.types";
import { dec, decUnknown, safePct, toFiniteNumber } from "../../math/decimal";

interface FuturesGridDetailEnvelope {
  detail?: Record<string, unknown>;
}

interface SpotGridDetailEnvelope {
  detail?: Record<string, unknown>;
}

function toString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function toOptionalNumber(value: Decimal): number | undefined {
  const numberValue = toFiniteNumber(value);
  return numberValue !== 0 ? numberValue : undefined;
}

function normalizeStatus(value: string): BotSummary["status"] {
  const normalized = value.toUpperCase();
  if (normalized.includes("RUNNING") || normalized.includes("INITIALIZING") || normalized.includes("NEW")) {
    return "running";
  }
  if (
    normalized.includes("COMPLETED") ||
    normalized.includes("CANCEL") ||
    normalized.includes("STOP") ||
    normalized.includes("CLOSE") ||
    normalized.includes("REJECT")
  ) {
    return "stopped";
  }
  return "unknown";
}

function normalizeSide(value: string): BotSummary["side"] {
  const normalized = value.toUpperCase();
  if (normalized.includes("LONG")) {
    return "long";
  }
  if (normalized.includes("SHORT")) {
    return "short";
  }
  if (normalized.includes("NEUTRAL")) {
    return "neutral";
  }
  return "unknown";
}

function normalizeRatioToPct(value: Decimal): number | undefined {
  if (!value.isFinite()) {
    return undefined;
  }

  return value.abs().lte(1) ? toFiniteNumber(value.mul(100)) : toFiniteNumber(value);
}

function safeNet(realized: Decimal, unrealized: Decimal): Decimal {
  if (!realized.isFinite() || !unrealized.isFinite()) {
    return dec(0);
  }
  return realized.plus(unrealized);
}

export function normalizeFuturesGridBotSummary(botId: string, result: unknown): BotSummary {
  const payload = result as FuturesGridDetailEnvelope | undefined;
  const detail = payload?.detail ?? {};

  const symbol = toString(detail.symbol);
  const quantity = decUnknown(detail.current_position).abs();
  const markPriceRaw = decUnknown(detail.mark_price);
  const markPrice = markPriceRaw.gt(0) ? markPriceRaw : decUnknown(detail.last_price);
  const totalValue = decUnknown(detail.total_value).abs();

  const unrealizedPnlUsd = decUnknown(detail.unrealised_pnl);
  const realizedPnlUsd = decUnknown(detail.realised_pnl);
  const allocatedCapitalUsd = decUnknown(detail.total_investment);
  const exposureFromQty = quantity.gt(0) && markPrice.gt(0) ? quantity.mul(markPrice) : dec(0);
  const exposureUsd = totalValue.gt(0) ? totalValue : exposureFromQty;
  const equityUsd = decUnknown(detail.equity);
  const availableBalanceUsd = decUnknown(detail.available_balance);
  const pnlPer = normalizeRatioToPct(decUnknown(detail.pnl_per));
  const realLeverage = decUnknown(detail.real_leverage);
  const leverage = realLeverage.gt(0) ? realLeverage : decUnknown(detail.leverage);

  const side = normalizeSide(`${toString(detail.grid_mode)} ${toString(detail.futures_pos_side)}`);

  return {
    botId,
    name: symbol ? `${symbol} futures-grid` : `futures-grid:${botId}`,
    strategyType: "futures_grid",
    symbol: symbol || undefined,
    baseAsset: toString(detail.base_token) || undefined,
    quoteAsset: toString(detail.quote_token) || undefined,
    status: normalizeStatus(toString(detail.status)),
    side,
    entryPrice: toOptionalNumber(decUnknown(detail.entry_price)),
    markPrice: toOptionalNumber(markPrice),
    quantity: toOptionalNumber(quantity),
    leverage: toOptionalNumber(leverage),
    liquidationPrice: toOptionalNumber(decUnknown(detail.liquidation_price)),
    allocatedCapitalUsd: toOptionalNumber(allocatedCapitalUsd),
    exposureUsd: toOptionalNumber(exposureUsd),
    realizedPnlUsd: toFiniteNumber(realizedPnlUsd),
    unrealizedPnlUsd: toFiniteNumber(unrealizedPnlUsd),
    strategyProfitUsd: toOptionalNumber(decUnknown(detail.grid_profit)),
    availableCapitalUsd: toOptionalNumber(availableBalanceUsd),
    equityUsd: toOptionalNumber(equityUsd),
    closeReason: toString(detail.close_reason) || undefined,
    closeCode: toString(detail.bot_close_code) || undefined,
    roiPct: pnlPer,
    activePositionCount: quantity.gt(0) ? 1 : 0
  };
}

export function normalizeSpotGridBotSummary(botId: string, result: unknown): BotSummary {
  const payload = result as SpotGridDetailEnvelope | undefined;
  const detail = payload?.detail ?? {};

  const symbol = toString(detail.symbol);
  const allocatedCapitalUsd = decUnknown(detail.total_investment);
  const totalProfit = decUnknown(detail.total_profit);
  const currentProfit = decUnknown(detail.current_profit);
  const realizedPnlUsd = totalProfit.minus(currentProfit);
  const unrealizedPnlUsd = currentProfit;
  const equityUsd = decUnknown(detail.equity);
  const roiFromCurrent = normalizeRatioToPct(decUnknown(detail.current_per));
  const roiFromProfit = allocatedCapitalUsd.gt(0)
    ? toFiniteNumber(safePct(safeNet(realizedPnlUsd, unrealizedPnlUsd), allocatedCapitalUsd))
    : undefined;

  return {
    botId,
    name: symbol ? `${symbol} spot-grid` : `spot-grid:${botId}`,
    strategyType: "spot_grid",
    symbol: symbol || undefined,
    baseAsset: toString(detail.base_token) || undefined,
    quoteAsset: toString(detail.quote_token) || undefined,
    status: normalizeStatus(toString(detail.status)),
    side: "long",
    entryPrice: toOptionalNumber(decUnknown(detail.entry_price)),
    markPrice: toOptionalNumber(decUnknown(detail.current_price)),
    quantity: undefined,
    leverage: 1,
    liquidationPrice: undefined,
    allocatedCapitalUsd: toOptionalNumber(allocatedCapitalUsd),
    exposureUsd: toOptionalNumber(equityUsd) ?? toOptionalNumber(allocatedCapitalUsd),
    realizedPnlUsd: toFiniteNumber(realizedPnlUsd),
    unrealizedPnlUsd: toFiniteNumber(unrealizedPnlUsd),
    strategyProfitUsd: toOptionalNumber(decUnknown(detail.grid_profit)),
    availableCapitalUsd: undefined,
    equityUsd: toOptionalNumber(equityUsd),
    closeReason: toString(detail.close_reason) || undefined,
    closeCode: toString(detail.bot_close_code) || undefined,
    roiPct: typeof roiFromCurrent === "number" ? roiFromCurrent : roiFromProfit,
    activePositionCount: 0
  };
}
