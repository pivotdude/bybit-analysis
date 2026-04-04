import type {
  AccountSnapshot,
  AssetBalance,
  DataCompleteness,
  MarketCategory,
  Position
} from "../../types/domain.types";

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

export function normalizeAccountSnapshot(
  input: unknown,
  category: MarketCategory,
  positions: Position[],
  dataCompleteness: DataCompleteness = { partial: false, warnings: [] }
): AccountSnapshot {
  const wallet = input as { list?: Array<Record<string, unknown>> } | undefined;
  const row = wallet?.list?.[0] ?? {};
  const balances = normalizeBalances(input);

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
    positions,
    balances,
    dataCompleteness
  };
}
