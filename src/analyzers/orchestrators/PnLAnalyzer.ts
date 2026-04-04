import type { PnLReport } from "../../types/domain.types";

export interface PnLAnalysis {
  periodFrom: string;
  periodTo: string;
  realizedPnlUsd: number;
  unrealizedPnlUsd: number;
  totalFeesUsd: number;
  netPnlUsd: number;
  roiStatus: PnLReport["roiStatus"];
  roiUnsupportedReason?: PnLReport["roiUnsupportedReason"];
  roiUnsupportedReasonCode?: PnLReport["roiUnsupportedReasonCode"];
  roiStartEquityUsd?: PnLReport["roiStartEquityUsd"];
  roiEndEquityUsd?: PnLReport["roiEndEquityUsd"];
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
      roiStatus: report.roiStatus,
      roiUnsupportedReason: report.roiUnsupportedReason,
      roiUnsupportedReasonCode: report.roiUnsupportedReasonCode,
      roiStartEquityUsd: report.roiStartEquityUsd,
      roiEndEquityUsd: report.roiEndEquityUsd,
      roiPct: report.roiPct,
      bySymbol: report.bySymbol,
      bestSymbols: report.bestSymbols,
      worstSymbols: report.worstSymbols
    };
  }
}
