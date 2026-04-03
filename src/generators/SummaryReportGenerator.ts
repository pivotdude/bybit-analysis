import { SummaryAnalyzer } from "../analyzers/orchestrators/SummaryAnalyzer";
import type { AccountDataService, ServiceRequestContext } from "../services/contracts/AccountDataService";
import type { ExecutionDataService } from "../services/contracts/ExecutionDataService";
import type { BotDataService } from "../services/contracts/BotDataService";
import type { ReportDocument } from "../types/report.types";
import { fmtPct, fmtUsd } from "./formatters";

export class SummaryReportGenerator {
  private readonly analyzer = new SummaryAnalyzer();

  constructor(
    private readonly accountService: AccountDataService,
    private readonly executionService: ExecutionDataService,
    private readonly botService: BotDataService
  ) {}

  async generate(context: ServiceRequestContext): Promise<ReportDocument> {
    const account = await this.accountService.getAccountSnapshot(context);
    const pnl = await this.executionService.getPnlReport(context, undefined, account.totalEquityUsd);

    let botReport: Awaited<ReturnType<BotDataService["getBotReport"]>> | undefined;
    try {
      botReport = await this.botService.getBotReport(context);
    } catch {
      botReport = undefined;
    }

    const summary = this.analyzer.analyze(account, pnl, botReport);
    const alertRows = summary.risk.alerts.map((alert) => [alert.severity, alert.message]);

    return {
      command: "summary",
      title: "Account Summary",
      generatedAt: summary.generatedAt,
      sections: [
        {
          title: "Executive Summary",
          type: "kpi",
          kpis: [
            { label: "Total Equity", value: fmtUsd(summary.balance.snapshot.totalEquityUsd) },
            { label: "Net PnL", value: fmtUsd(summary.pnl.netPnlUsd) },
            { label: "Gross Exposure", value: fmtUsd(summary.exposure.grossExposureUsd) },
            { label: "ROI", value: fmtPct(summary.performance.roiPct) },
            { label: "Risk Alerts", value: String(summary.risk.alerts.length) }
          ]
        },
        {
          title: "Exposure",
          type: "kpi",
          kpis: [
            { label: "Long", value: fmtUsd(summary.exposure.longExposureUsd) },
            { label: "Short", value: fmtUsd(summary.exposure.shortExposureUsd) },
            { label: "Net", value: fmtUsd(summary.exposure.netExposureUsd) },
            { label: "Concentration Band", value: summary.exposure.concentration.band }
          ]
        },
        {
          title: "Performance",
          type: "kpi",
          kpis: [
            { label: "Period Net PnL", value: fmtUsd(summary.performance.periodNetPnlUsd) },
            { label: "ROI", value: fmtPct(summary.performance.roiPct) },
            { label: "Capital Efficiency", value: fmtPct(summary.performance.capitalEfficiencyPct) },
            { label: "Interpretation", value: summary.performance.interpretation }
          ]
        },
        {
          title: "Risk",
          type: "kpi",
          kpis: [
            { label: "Weighted Avg Leverage", value: `${summary.risk.leverageUsage.weightedAvgLeverage.toFixed(2)}x` },
            { label: "Max Leverage", value: `${summary.risk.leverageUsage.maxLeverageUsed.toFixed(2)}x` },
            { label: "Notional / Equity", value: fmtPct(summary.risk.leverageUsage.notionalToEquityPct) },
            { label: "Unrealized Loss / Equity", value: fmtPct(summary.risk.unrealizedLossRisk.unrealizedLossToEquityPct) }
          ]
        },
        {
          title: "Open Positions",
          type: "table",
          table: {
            headers: ["Symbol", "Side", "Notional", "UPnL", "Leverage", "Price Source"],
            rows: summary.positions.largestPositions.map((position) => [
              position.symbol,
              position.side,
              fmtUsd(position.notionalUsd),
              fmtUsd(position.unrealizedPnlUsd),
              `${position.leverage.toFixed(2)}x`,
              position.priceSource
            ])
          }
        },
        {
          title: "Alerts",
          type: alertRows.length > 0 ? "table" : "alerts",
          table:
            alertRows.length > 0
              ? {
                  headers: ["Severity", "Message"],
                  rows: alertRows
                }
              : undefined,
          alerts:
            alertRows.length === 0
              ? [{ severity: "info", message: "No active alerts" }]
              : undefined
        }
      ]
    };
  }
}
