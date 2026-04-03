import type { BotSummary } from "../../types/domain.types";

interface FuturesGridDetailEnvelope {
  detail?: Record<string, unknown>;
}

interface SpotGridDetailEnvelope {
  detail?: Record<string, unknown>;
}

function toNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toString(value: unknown): string {
  return typeof value === "string" ? value : "";
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

function normalizeRatioToPct(value: number): number | undefined {
  if (!Number.isFinite(value)) {
    return undefined;
  }
  if (Math.abs(value) <= 1) {
    return value * 100;
  }
  return value;
}

function safeNet(realized: number, unrealized: number): number {
  if (!Number.isFinite(realized) || !Number.isFinite(unrealized)) {
    return 0;
  }
  return realized + unrealized;
}

export function normalizeFuturesGridBotSummary(botId: string, result: unknown): BotSummary {
  const payload = result as FuturesGridDetailEnvelope | undefined;
  const detail = payload?.detail ?? {};

  const symbol = toString(detail.symbol);
  const quantity = Math.abs(toNumber(detail.current_position));
  const markPrice = toNumber(detail.mark_price) || toNumber(detail.last_price);
  const totalValue = Math.abs(toNumber(detail.total_value));

  const unrealizedPnlUsd = toNumber(detail.unrealised_pnl);
  const realizedPnlUsd = toNumber(detail.realised_pnl);
  const allocatedCapitalUsd = toNumber(detail.total_investment);
  const exposureFromQty = quantity > 0 && markPrice > 0 ? quantity * markPrice : 0;
  const exposureUsd = totalValue > 0 ? totalValue : exposureFromQty;
  const equityUsd = toNumber(detail.equity);
  const availableBalanceUsd = toNumber(detail.available_balance);
  const pnlPer = normalizeRatioToPct(toNumber(detail.pnl_per));

  const side = normalizeSide(`${toString(detail.grid_mode)} ${toString(detail.futures_pos_side)}`);

  return {
    botId,
    name: symbol ? `${symbol} futures-grid` : `futures-grid:${botId}`,
    botType: "futures_grid",
    symbol: symbol || undefined,
    baseAsset: toString(detail.base_token) || undefined,
    quoteAsset: toString(detail.quote_token) || undefined,
    status: normalizeStatus(toString(detail.status)),
    side,
    entryPrice: toNumber(detail.entry_price) || undefined,
    markPrice: markPrice || undefined,
    quantity: quantity || undefined,
    leverage: toNumber(detail.real_leverage) || toNumber(detail.leverage) || undefined,
    liquidationPrice: toNumber(detail.liquidation_price) || undefined,
    allocatedCapitalUsd: allocatedCapitalUsd || undefined,
    exposureUsd: exposureUsd || undefined,
    realizedPnlUsd,
    unrealizedPnlUsd,
    gridProfitUsd: toNumber(detail.grid_profit) || undefined,
    availableBalanceUsd: availableBalanceUsd || undefined,
    equityUsd: equityUsd || undefined,
    closeReason: toString(detail.close_reason) || undefined,
    botCloseCode: toString(detail.bot_close_code) || undefined,
    roiPct: pnlPer,
    openPositions: quantity > 0 ? 1 : 0
  };
}

export function normalizeSpotGridBotSummary(botId: string, result: unknown): BotSummary {
  const payload = result as SpotGridDetailEnvelope | undefined;
  const detail = payload?.detail ?? {};

  const symbol = toString(detail.symbol);
  const allocatedCapitalUsd = toNumber(detail.total_investment);
  const totalProfit = toNumber(detail.total_profit);
  const currentProfit = toNumber(detail.current_profit);
  const realizedPnlUsd = totalProfit - currentProfit;
  const unrealizedPnlUsd = currentProfit;
  const equityUsd = toNumber(detail.equity);
  const roiFromCurrent = normalizeRatioToPct(toNumber(detail.current_per));
  const roiFromProfit =
    allocatedCapitalUsd > 0 ? ((safeNet(realizedPnlUsd, unrealizedPnlUsd) / allocatedCapitalUsd) * 100) : undefined;

  return {
    botId,
    name: symbol ? `${symbol} spot-grid` : `spot-grid:${botId}`,
    botType: "spot_grid",
    symbol: symbol || undefined,
    baseAsset: toString(detail.base_token) || undefined,
    quoteAsset: toString(detail.quote_token) || undefined,
    status: normalizeStatus(toString(detail.status)),
    side: "long",
    entryPrice: toNumber(detail.entry_price) || undefined,
    markPrice: toNumber(detail.current_price) || undefined,
    quantity: undefined,
    leverage: 1,
    liquidationPrice: undefined,
    allocatedCapitalUsd: allocatedCapitalUsd || undefined,
    exposureUsd: equityUsd || allocatedCapitalUsd || undefined,
    realizedPnlUsd,
    unrealizedPnlUsd,
    gridProfitUsd: toNumber(detail.grid_profit) || undefined,
    availableBalanceUsd: undefined,
    equityUsd: equityUsd || undefined,
    closeReason: toString(detail.close_reason) || undefined,
    botCloseCode: toString(detail.bot_close_code) || undefined,
    roiPct: typeof roiFromCurrent === "number" ? roiFromCurrent : roiFromProfit,
    openPositions: 0
  };
}
