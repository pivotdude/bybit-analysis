import type {
  AccountSnapshot,
  AssetBalance,
  DataCompleteness,
  EquitySnapshot,
  MarketCategory,
  Position
} from "../../../types/domain.types";
import { completeDataCompleteness } from "../../reliability/dataCompleteness";

function toNumber(input: unknown): number {
  const value = Number(input);
  return Number.isFinite(value) ? value : 0;
}

function normalizeBalances(input: unknown): AssetBalance[] {
  const wallet = input as { list?: Array<{ coin?: Array<Record<string, unknown>> }> } | undefined;
  const account = wallet?.list?.[0];
  const coins = account?.coin ?? [];

  return coins
    .map((coin): AssetBalance => ({
      asset: String(coin.coin ?? "UNKNOWN"),
      walletBalance: toNumber(coin.walletBalance),
      availableBalance: toNumber(coin.availableToWithdraw ?? coin.free),
      usdValue: toNumber(coin.usdValue ?? coin.equity)
    }))
    .sort((left, right) => right.usdValue - left.usdValue);
}

function normalizeTimestamp(input: unknown): string | undefined {
  if (typeof input !== "string" && typeof input !== "number") {
    return undefined;
  }

  const date = new Date(input);
  if (Number.isNaN(date.getTime())) {
    return undefined;
  }

  return date.toISOString();
}

function normalizeEquityHistory(input: unknown): EquitySnapshot[] | undefined {
  if (!Array.isArray(input)) {
    return undefined;
  }

  const history = input
    .map((item): EquitySnapshot | undefined => {
      if (typeof item !== "object" || item === null) {
        return undefined;
      }

      const row = item as Record<string, unknown>;
      const timestamp = normalizeTimestamp(row.timestamp ?? row.capturedAt ?? row.time ?? row.ts);

      if (!timestamp) {
        return undefined;
      }

      return {
        timestamp,
        totalEquityUsd: toNumber(row.totalEquityUsd ?? row.totalEquity ?? row.equityUsd ?? row.equity),
        totalExposureUsd: toNumber(row.totalExposureUsd ?? row.totalExposure ?? row.exposureUsd),
        grossExposureUsd: toNumber(row.grossExposureUsd ?? row.grossExposure ?? row.totalExposureUsd ?? row.totalExposure),
        netExposureUsd: toNumber(row.netExposureUsd ?? row.netExposure)
      };
    })
    .filter((item): item is EquitySnapshot => item !== undefined)
    .sort((left, right) => new Date(left.timestamp).getTime() - new Date(right.timestamp).getTime());

  return history.length > 0 ? history : undefined;
}

export function normalizeAccountSnapshot(
  input: unknown,
  category: MarketCategory,
  positions: Position[],
  dataCompleteness: DataCompleteness = completeDataCompleteness()
): AccountSnapshot {
  const wallet = input as { list?: Array<Record<string, unknown>>; equityHistory?: unknown } | undefined;
  const row = wallet?.list?.[0] ?? {};
  const balances = normalizeBalances(input);
  const equityHistory = normalizeEquityHistory(wallet?.equityHistory ?? row.equityHistory);

  return {
    source: "bybit",
    exchange: "bybit",
    category,
    capturedAt: new Date().toISOString(),
    accountId: row.accountType ? String(row.accountType) : undefined,
    totalEquityUsd: toNumber(row.totalEquity),
    walletBalanceUsd: toNumber(row.totalWalletBalance),
    availableBalanceUsd: toNumber(row.totalAvailableBalance),
    marginBalanceUsd: toNumber(row.totalMarginBalance) || undefined,
    totalInitialMarginUsd: toNumber(row.totalInitialMargin) || undefined,
    totalMaintenanceMarginUsd: toNumber(row.totalMaintenanceMargin) || undefined,
    unrealizedPnlUsd: toNumber(row.totalPerpUPL),
    equityHistory,
    positions,
    balances,
    dataCompleteness
  };
}
