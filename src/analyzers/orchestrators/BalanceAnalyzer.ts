import type { AccountSnapshot } from "../../types/domain.types";

export interface BalanceAnalysis {
  snapshot: {
    totalEquityUsd: number;
    walletBalanceUsd: number;
    availableBalanceUsd: number;
    unrealizedPnlUsd: number;
  };
  marginState: {
    initialMarginUsd: number;
    maintenanceMarginUsd: number;
    marginBalanceUsd: number;
  };
  balances: AccountSnapshot["balances"];
}

export class BalanceAnalyzer {
  analyze(account: AccountSnapshot): BalanceAnalysis {
    return {
      snapshot: {
        totalEquityUsd: account.totalEquityUsd,
        walletBalanceUsd: account.walletBalanceUsd,
        availableBalanceUsd: account.availableBalanceUsd,
        unrealizedPnlUsd: account.unrealizedPnlUsd
      },
      marginState: {
        initialMarginUsd: account.totalInitialMarginUsd ?? 0,
        maintenanceMarginUsd: account.totalMaintenanceMarginUsd ?? 0,
        marginBalanceUsd: account.marginBalanceUsd ?? 0
      },
      balances: account.balances
    };
  }
}
