import type { SummaryAnalysis } from "../../analyzers/orchestrators/SummaryAnalyzer"
import type { ServiceRequestContext } from "../../services/contracts/AccountDataService"
import {
  filterDataCompletenessIssues,
  isSpotPositionsUnsupportedIssue
} from "../../services/reliability/dataCompleteness"
import type { BotReport, DataCompleteness } from "../../types/domain.types"
import type { MarkdownAlert } from "../../types/report.types"
import { buildDataCompletenessAlerts } from "../reportContract"

function isCategoryIntrinsicSpotPositionsIssue(
  context: ServiceRequestContext,
  issue: DataCompleteness["issues"][number]
): boolean {
  return context.category === "spot" && isSpotPositionsUnsupportedIssue(issue)
}

export function buildSpotLimitationMessage(reason: string): string {
  return `Spot limitation: ${reason}`
}

function buildSummaryAlertMessage(reason: string): MarkdownAlert {
  return {
    severity: "critical",
    message: reason
  }
}

function buildEmptyStateMessage(message: string): string {
  return message
}

export function buildBotTableEmptyMessage(botReport: BotReport | undefined, failureReason?: string): string {
  if (!botReport) {
    return buildEmptyStateMessage(
      failureReason ? `Bot metrics unavailable: ${failureReason}` : "Bot metrics unavailable"
    )
  }

  return buildEmptyStateMessage("No tracked bots")
}

export function buildPositionsEmptyMessage(unsupportedExposureRiskReason: string | undefined): string {
  if (unsupportedExposureRiskReason) {
    return buildEmptyStateMessage(buildSpotLimitationMessage(unsupportedExposureRiskReason))
  }

  return buildEmptyStateMessage("No open positions")
}

export function buildDataCompletenessForSummary(
  context: ServiceRequestContext,
  dataCompleteness: DataCompleteness
): DataCompleteness {
  return filterDataCompletenessIssues(dataCompleteness, (issue) => !isCategoryIntrinsicSpotPositionsIssue(context, issue))
}

export function buildDataCompletenessAlertsForSummary(dataCompleteness: DataCompleteness): MarkdownAlert[] {
  return buildDataCompletenessAlerts(dataCompleteness)
}

export function buildSummaryAlerts(
  summary: SummaryAnalysis,
  context: ServiceRequestContext,
  unsupportedExposureRiskReason: string | undefined,
  botReport: BotReport | undefined,
  botFailureReason?: string
): MarkdownAlert[] {
  const alerts: MarkdownAlert[] = summary.risk.alerts.map((alert) => ({
    severity: alert.severity,
    message: alert.message
  }))

  if (unsupportedExposureRiskReason && context.category !== "spot") {
    alerts.push(buildSummaryAlertMessage(unsupportedExposureRiskReason))
  }

  if (!botReport) {
    alerts.push({
      severity: "warning",
      message: botFailureReason
        ? `Bot metrics unavailable: ${botFailureReason}`
        : "Bot metrics unavailable due to optional enrichment failure."
    })
  }

  if (alerts.length === 0) {
    alerts.push({
      severity: "info",
      message: "No active alerts"
    })
  }

  return alerts
}
