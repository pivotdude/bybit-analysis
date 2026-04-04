import { PerformanceAnalyzer } from "../analyzers/orchestrators/PerformanceAnalyzer";
import type { ExecutionDataService } from "../services/contracts/ExecutionDataService";
import type { AccountDataService, ServiceRequestContext } from "../services/contracts/AccountDataService";
import type { ReportDocument } from "../types/report.types";
import { fmtIso, fmtPct, fmtUsd } from "./formatters";

export class PerformanceReportGenerator {
  private readonly analyzer = new PerformanceAnalyzer();

  constructor(
    private readonly accountService: AccountDataService,
    private readonly executionService: ExecutionDataService
  ) {}

  async generate(context: ServiceRequestContext): Promise<ReportDocument> {
    const account = await this.accountService.getAccountSnapshot(context);
    const pnl = await this.executionService.getPnlReport(context, undefined, account.totalEquityUsd);
    const analysis = this.analyzer.analyze(account, pnl);
    const capitalEfficiency =
      analysis.capitalEfficiencyStatus === "supported" && typeof analysis.capitalEfficiencyPct === "number"
        ? fmtPct(analysis.capitalEfficiencyPct)
        : "unsupported";
    const avgDeployedCapital =
      analysis.capitalEfficiencyStatus === "supported" && typeof analysis.avgDeployedCapitalUsd === "number"
        ? fmtUsd(analysis.avgDeployedCapitalUsd)
        : "unsupported";
    const sections: ReportDocument["sections"] = [
      {
        title: "Performance Overview",
        type: "text",
        text: [`From: ${fmtIso(analysis.periodFrom)}`, `To: ${fmtIso(analysis.periodTo)}`]
      },
      {
        title: "ROI",
        type: "kpi",
        kpis: [
          { label: "Period Net PnL", value: fmtUsd(analysis.periodNetPnlUsd) },
          { label: "ROI", value: fmtPct(analysis.roiPct) }
        ]
      },
      {
        title: "Capital Efficiency",
        type: "kpi",
        kpis: [
          { label: "Capital Efficiency", value: capitalEfficiency },
          { label: "Avg Deployed Capital", value: avgDeployedCapital }
        ]
      },
      {
        title: "Interpretation",
        type: "text",
        text: [
          `Interpretation: ${analysis.interpretation}`,
          analysis.capitalEfficiencyStatus === "unsupported"
            ? `Capital efficiency status: unsupported (${analysis.capitalEfficiencyReason ?? "equity history is unavailable"})`
            : "Capital efficiency status: supported"
        ]
      }
    ];

    const completenessWarnings = Array.from(
      new Set([
        ...(account.dataCompleteness.partial ? account.dataCompleteness.warnings : []),
        ...(pnl.dataCompleteness.partial ? pnl.dataCompleteness.warnings : [])
      ])
    );

    if (completenessWarnings.length > 0) {
      sections.push({
        title: "Data Completeness",
        type: "alerts",
        alerts: completenessWarnings.map((message) => ({ severity: "warning", message }))
      });
    }

    return {
      command: "performance",
      title: "Performance Analytics",
      generatedAt: new Date().toISOString(),
      sections
    };
  }
}
