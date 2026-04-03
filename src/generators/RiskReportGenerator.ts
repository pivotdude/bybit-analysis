import { RiskAnalyzer } from "../analyzers/orchestrators/RiskAnalyzer";
import type { AccountDataService, ServiceRequestContext } from "../services/contracts/AccountDataService";
import type { ReportDocument } from "../types/report.types";
import { fmtPct, fmtUsd } from "./formatters";

export class RiskReportGenerator {
  private readonly analyzer = new RiskAnalyzer();

  constructor(private readonly accountService: AccountDataService) {}

  async generate(context: ServiceRequestContext): Promise<ReportDocument> {
    const account = await this.accountService.getAccountSnapshot(context);
    const report = this.analyzer.analyze(account, account.positions);

    return {
      command: "risk",
      title: "Risk Analytics",
      generatedAt: new Date().toISOString(),
      sections: [
        {
          title: "Risk Overview",
          type: "kpi",
          kpis: [
            { label: "Weighted Avg Leverage", value: `${report.leverageUsage.weightedAvgLeverage.toFixed(2)}x` },
            { label: "Max Leverage Used", value: `${report.leverageUsage.maxLeverageUsed.toFixed(2)}x` },
            { label: "Notional / Equity", value: fmtPct(report.leverageUsage.notionalToEquityPct) }
          ]
        },
        {
          title: "Position Sizing Risk",
          type: "kpi",
          kpis: [
            { label: "Largest Position", value: report.maxPositionSize.symbol },
            { label: "Largest Position Notional", value: fmtUsd(report.maxPositionSize.notionalUsd) },
            { label: "Largest Position % Equity", value: fmtPct(report.maxPositionSize.pctOfEquity) }
          ]
        },
        {
          title: "Unrealized Loss Risk",
          type: "kpi",
          kpis: [
            { label: "Unrealized Loss", value: fmtUsd(report.unrealizedLossRisk.unrealizedLossUsd) },
            { label: "Loss / Equity", value: fmtPct(report.unrealizedLossRisk.unrealizedLossToEquityPct) },
            { label: "Worst Position", value: report.unrealizedLossRisk.worstPositionSymbol ?? "N/A" },
            { label: "Worst Position Loss", value: fmtUsd(report.unrealizedLossRisk.worstPositionLossUsd ?? 0) }
          ]
        },
        {
          title: "Alerts",
          type: "alerts",
          alerts:
            report.alerts.length > 0
              ? report.alerts.map((alert) => ({ severity: alert.severity, message: alert.message }))
              : [{ severity: "info", message: "No active risk alerts" }]
        }
      ]
    };
  }
}
