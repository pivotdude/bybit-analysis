import type { SummaryAnalysis } from "../../analyzers/orchestrators/SummaryAnalyzer"
import type { ServiceRequestContext } from "../../services/contracts/AccountDataService"
import type { ExecutionDataService } from "../../services/contracts/ExecutionDataService"
import type { BotReport, DataCompleteness } from "../../types/domain.types"

export interface HoldingSnapshot {
  asset: string;
  usdValue: number;
}

export type SummaryPnlReport = Awaited<ReturnType<ExecutionDataService["getPnlReport"]>>

export interface SummarySectionArgs {
  context: ServiceRequestContext;
  summary: SummaryAnalysis;
  pnl: SummaryPnlReport;
  accountCapturedAt: string;
  holdings: HoldingSnapshot[];
  stableValueUsd: number;
  nonStableValueUsd: number;
  stableSharePct: number;
  nonStableSharePct: number;
  largestHolding?: HoldingSnapshot;
  largestHoldingSharePct: number;
  capitalEfficiency: string;
  unsupportedExposureRiskReason: string | undefined;
  botReport: BotReport | undefined;
  botFailureReason?: string;
  summaryDataCompleteness: DataCompleteness;
  roiValue: string;
  roiNarrativeLines: string[];
}
