import { calculateCapitalEfficiency } from "../metrics/performance/capitalEfficiency.metric";
import { calculateRoiPct } from "../metrics/performance/roi.metric";
import type { AccountSnapshot, PnLReport } from "../../types/domain.types";

export interface PerformanceAnalysis {
  periodFrom: string;
  periodTo: string;
  periodNetPnlUsd: number;
  roiPct: number;
  capitalEfficiencyStatus: "supported" | "unsupported";
  capitalEfficiencyReason?: string;
  capitalEfficiencyPct?: number;
  avgDeployedCapitalUsd?: number;
  interpretation: "positive" | "neutral" | "negative";
}

export class PerformanceAnalyzer {
  analyze(account: AccountSnapshot, pnl: PnLReport): PerformanceAnalysis {
    const totalFeesUsd = pnl.fees.tradingFeesUsd + pnl.fees.fundingFeesUsd + (pnl.fees.otherFeesUsd ?? 0);
    const periodNetPnlUsd = pnl.realizedPnlUsd + pnl.unrealizedPnlUsd - totalFeesUsd;

    const periodStartEquityUsd =
      account.equityHistory?.[0]?.totalEquityUsd ?? Math.max(account.totalEquityUsd - periodNetPnlUsd, 0);
    const roiPct = calculateRoiPct(periodStartEquityUsd, account.totalEquityUsd);

    const efficiency = calculateCapitalEfficiency(pnl.realizedPnlUsd, account.equityHistory);
    const capitalEfficiencyPct = efficiency.capitalEfficiencyPct;
    const hasCapitalEfficiency = typeof capitalEfficiencyPct === "number";

    const interpretation =
      roiPct > 2 && (!hasCapitalEfficiency || capitalEfficiencyPct > 1)
        ? "positive"
        : roiPct < -2 || (hasCapitalEfficiency && capitalEfficiencyPct < -1)
          ? "negative"
          : "neutral";

    return {
      periodFrom: pnl.periodFrom,
      periodTo: pnl.periodTo,
      periodNetPnlUsd,
      roiPct,
      capitalEfficiencyStatus: efficiency.status,
      capitalEfficiencyReason: efficiency.reason,
      capitalEfficiencyPct,
      avgDeployedCapitalUsd: efficiency.avgDeployedCapitalUsd,
      interpretation
    };
  }
}
