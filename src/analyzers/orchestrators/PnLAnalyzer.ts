import type { PnLReport } from "../../types/domain.types";

export interface PnLAnalysis {
  periodFrom: string;
  periodTo: string;
  realizedPnlUsd: number;
  unrealizedPnlUsd: number;
  totalFeesUsd: number;
  netPnlUsd: number;
  roiPct?: number;
  bySymbol: PnLReport["bySymbol"];
  bestSymbols: PnLReport["bestSymbols"];
  worstSymbols: PnLReport["worstSymbols"];
}

export class PnLAnalyzer {
  analyze(report: PnLReport): PnLAnalysis {
    return {
      periodFrom: report.periodFrom,
      periodTo: report.periodTo,
      realizedPnlUsd: report.realizedPnlUsd,
      unrealizedPnlUsd: report.unrealizedPnlUsd,
      totalFeesUsd: report.fees.tradingFeesUsd + report.fees.fundingFeesUsd + (report.fees.otherFeesUsd ?? 0),
      netPnlUsd: report.netPnlUsd,
      roiPct: report.roiPct,
      bySymbol: report.bySymbol,
      bestSymbols: report.bestSymbols,
      worstSymbols: report.worstSymbols
    };
  }
}
