import { calculateCapitalEfficiency } from "../metrics/performance/capitalEfficiency.metric";
import type { AccountSnapshot, PnLReport, RoiContract } from "../../types/domain.types";
import { dec, toFiniteNumber } from "../../services/math/decimal";

export interface PerformanceAnalysis {
  periodFrom: string;
  periodTo: string;
  periodNetPnlUsd: number;
  roiStatus: RoiContract["roiStatus"];
  roiUnsupportedReason?: RoiContract["roiUnsupportedReason"];
  roiUnsupportedReasonCode?: RoiContract["roiUnsupportedReasonCode"];
  roiStartEquityUsd?: RoiContract["roiStartEquityUsd"];
  roiEndEquityUsd?: RoiContract["roiEndEquityUsd"];
  roiPct?: number;
  capitalEfficiencyStatus: "supported" | "unsupported";
  capitalEfficiencyReason?: string;
  capitalEfficiencyPct?: number;
  avgDeployedCapitalUsd?: number;
  interpretation: "positive" | "neutral" | "negative";
}

export class PerformanceAnalyzer {
  analyze(account: AccountSnapshot, pnl: PnLReport): PerformanceAnalysis {
    const totalFeesUsd = dec(pnl.fees.tradingFeesUsd).plus(pnl.fees.fundingFeesUsd).plus(pnl.fees.otherFeesUsd ?? 0);
    const periodNetPnlUsd = toFiniteNumber(dec(pnl.realizedPnlUsd).plus(pnl.unrealizedPnlUsd).minus(totalFeesUsd));
    const roiPct = pnl.roiStatus === "supported" && typeof pnl.roiPct === "number" ? pnl.roiPct : undefined;

    const efficiency = calculateCapitalEfficiency(pnl.realizedPnlUsd, account.equityHistory);
    const capitalEfficiencyPct = efficiency.capitalEfficiencyPct;
    const hasCapitalEfficiency = typeof capitalEfficiencyPct === "number";

    const interpretation =
      typeof roiPct === "number" && roiPct > 2 && (!hasCapitalEfficiency || capitalEfficiencyPct > 1)
        ? "positive"
        : (typeof roiPct === "number" && roiPct < -2) || (hasCapitalEfficiency && capitalEfficiencyPct < -1)
          ? "negative"
          : "neutral";

    return {
      periodFrom: pnl.periodFrom,
      periodTo: pnl.periodTo,
      periodNetPnlUsd,
      roiStatus: pnl.roiStatus,
      roiUnsupportedReason: pnl.roiUnsupportedReason,
      roiUnsupportedReasonCode: pnl.roiUnsupportedReasonCode,
      roiStartEquityUsd: pnl.roiStartEquityUsd,
      roiEndEquityUsd: pnl.roiEndEquityUsd,
      roiPct,
      capitalEfficiencyStatus: efficiency.status,
      capitalEfficiencyReason: efficiency.reason,
      capitalEfficiencyPct,
      avgDeployedCapitalUsd: efficiency.avgDeployedCapitalUsd,
      interpretation
    };
  }
}
