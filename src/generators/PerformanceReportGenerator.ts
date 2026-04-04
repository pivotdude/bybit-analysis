import { PerformanceAnalyzer } from "../analyzers/orchestrators/PerformanceAnalyzer";
import type { ExecutionDataService } from "../services/contracts/ExecutionDataService";
import type { AccountDataService, ServiceRequestContext } from "../services/contracts/AccountDataService";
import type { ReportDocument } from "../types/report.types";
import { fmtIso, fmtPct, fmtUsd } from "./formatters";
import { mergeDataCompleteness } from "../services/reliability/dataCompleteness";
import { pushDataCompletenessSections } from "./dataCompleteness";

export class PerformanceReportGenerator {
  private readonly analyzer = new PerformanceAnalyzer();

  constructor(
    private readonly accountService: AccountDataService,
    private readonly executionService: ExecutionDataService
  ) {}

  async generate(context: ServiceRequestContext): Promise<ReportDocument> {
    const account = await this.accountService.getAccountSnapshot(context);
    const pnl = await this.executionService.getPnlReport({
      context,
      equityEndUsd: account.totalEquityUsd,
      accountSnapshot: { unrealizedPnlUsd: account.unrealizedPnlUsd }
    });
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

    const dataCompleteness = mergeDataCompleteness(account.dataCompleteness, pnl.dataCompleteness);
    pushDataCompletenessSections(sections, dataCompleteness);

    return {
      command: "performance",
      title: "Performance Analytics",
      generatedAt: new Date().toISOString(),
      sections,
      dataCompleteness
    };
  }
}
