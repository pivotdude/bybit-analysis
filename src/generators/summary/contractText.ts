import type { SummaryAnalysis } from "../../analyzers/orchestrators/SummaryAnalyzer"
import type { ServiceRequestContext } from "../../services/contracts/AccountDataService"
import type { BotReport } from "../../types/domain.types"
import { buildSpotLimitationMessage } from "./policy"
import type { SummaryPnlReport } from "./types"

function buildContractContextLines(
  context: ServiceRequestContext,
  accountCapturedAt: string,
  unsupportedExposureRiskReason: string | undefined,
  botReport: BotReport | undefined
): string[] {
  return [
    `Context: ${context.category} / ${context.sourceMode}`,
    `Live snapshot as of: ${accountCapturedAt}`,
    `Coverage: ${buildContractPeriodMetricsLine(context.sourceMode)}`,
    ...(context.sourceMode === "bot" && botReport
      ? ["Note: wallet equity may exclude capital currently managed inside bot allocations."]
      : []),
    ...(unsupportedExposureRiskReason && context.category === "spot"
      ? [buildSpotLimitationMessage(unsupportedExposureRiskReason)]
      : unsupportedExposureRiskReason
        ? [`Exposure/risk status: unsupported (${unsupportedExposureRiskReason})`]
        : [])
  ]
}

function buildEndStateLine(summary: SummaryAnalysis): string {
  return summary.pnl.endStateStatus === "supported"
    ? "Period end-state: supported"
    : `Period end-state: unsupported${summary.pnl.endStateUnsupportedReason ? ` — ${summary.pnl.endStateUnsupportedReason}` : ""}`
}

function buildRoiContractLines(roiNarrativeLines: string[]): string[] {
  const statusLine = roiNarrativeLines.find((line) => line.startsWith("ROI status:"))
  const reasonLine = roiNarrativeLines.find((line) => line.startsWith("ROI unsupported reason:"))

  return [
    statusLine ?? "ROI status: unknown",
    ...(reasonLine ? [reasonLine] : [])
  ]
}

function buildContractSummaryLine(context: ServiceRequestContext): string {
  return context.sourceMode === "bot"
    ? "This summary emphasizes bot capital, bot PnL, and wallet context."
    : "This summary emphasizes account equity, trading activity, and period PnL."
}

function buildPeriodLine(pnl: SummaryPnlReport): string {
  return `Period: ${pnl.periodFrom} -> ${pnl.periodTo}`
}

function buildMetricCoverageLine(context: ServiceRequestContext): string {
  return context.sourceMode === "bot"
    ? "Live metrics: wallet balances, holdings, bot exposure, and bot status."
    : "Live metrics: balances, holdings, exposure, risk, and open positions."
}

function buildCoverageNarrative(sourceMode: ServiceRequestContext["sourceMode"]): string {
  return sourceMode === "bot"
    ? "bot performance and account PnL over the requested window"
    : "trading activity and account PnL over the requested window"
}

function buildContractPeriodMetricsLine(sourceMode: ServiceRequestContext["sourceMode"]): string {
  return buildCoverageNarrative(sourceMode)
}

function buildContractIntro(context: ServiceRequestContext): string {
  return context.sourceMode === "bot" ? "Summary scope: bot-oriented account review." : "Summary scope: market activity account review."
}

export function buildContractText(args: {
  context: ServiceRequestContext;
  pnl: SummaryPnlReport;
  accountCapturedAt: string;
  roiNarrativeLines: string[];
  summary: SummaryAnalysis;
  unsupportedExposureRiskReason: string | undefined;
  botReport: BotReport | undefined;
}): string[] {
  return [
    buildContractIntro(args.context),
    ...buildContractContextLines(
      args.context,
      args.accountCapturedAt,
      args.unsupportedExposureRiskReason,
      args.botReport
    ),
    buildMetricCoverageLine(args.context),
    buildPeriodLine(args.pnl),
    buildEndStateLine(args.summary),
    ...buildRoiContractLines(args.roiNarrativeLines),
    buildContractSummaryLine(args.context)
  ]
}
