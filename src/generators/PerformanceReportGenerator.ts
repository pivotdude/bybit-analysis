import { PerformanceAnalyzer } from "../analyzers/orchestrators/PerformanceAnalyzer";
import type { ExecutionDataService } from "../services/contracts/ExecutionDataService";
import type { AccountDataService, ServiceRequestContext } from "../services/contracts/AccountDataService";
import type { ReportDocument } from "../types/report.types";
import type { ReportSectionType } from "../types/report.types";
import { fmtIso, fmtPct, fmtUsd } from "./formatters";
import { filterDataCompletenessIssues, mergeDataCompleteness } from "../services/reliability/dataCompleteness";
import { buildDataCompletenessAlerts, createSectionBuilder } from "./reportContract";
import { resolveStartingEquity } from "../services/roi/startingEquityResolver";

export const PERFORMANCE_SCHEMA_VERSION = "performance-markdown-v1";

export const PERFORMANCE_SECTION_CONTRACT = {
  overview: { id: "performance.overview", title: "Performance Overview", type: "text" },
  roi: { id: "performance.roi", title: "ROI", type: "kpi" },
  capitalEfficiency: { id: "performance.capital_efficiency", title: "Capital Efficiency", type: "kpi" },
  interpretation: { id: "performance.interpretation", title: "Interpretation", type: "text" },
  dataCompleteness: { id: "performance.data_completeness", title: "Data Completeness", type: "alerts" }
} as const satisfies Record<string, { id: string; title: string; type: ReportSectionType }>;

export const PERFORMANCE_SECTION_ORDER = [
  "overview",
  "roi",
  "capitalEfficiency",
  "interpretation",
  "dataCompleteness"
] as const satisfies readonly (keyof typeof PERFORMANCE_SECTION_CONTRACT)[];

const section = createSectionBuilder(PERFORMANCE_SECTION_CONTRACT);

export class PerformanceReportGenerator {
  private readonly analyzer = new PerformanceAnalyzer();

  constructor(
    private readonly accountService: AccountDataService,
    private readonly executionService: ExecutionDataService
  ) {}

  async generate(context: ServiceRequestContext): Promise<ReportDocument> {
    const account = await this.accountService.getAccountSnapshot(context);
    const startingEquity = resolveStartingEquity(account, context.from);
    const pnl = await this.executionService.getPnlReport({
      context,
      equityStartUsd: startingEquity.equityStartUsd,
      equityEndUsd: account.totalEquityUsd,
      roiMissingStartReason: startingEquity.missingStartReason,
      roiMissingStartReasonCode: startingEquity.missingStartReasonCode,
      accountSnapshot: { unrealizedPnlUsd: account.unrealizedPnlUsd }
    });
    const analysis = this.analyzer.analyze(account, pnl);
    const roi =
      analysis.roiStatus === "supported" && typeof analysis.roiPct === "number" ? fmtPct(analysis.roiPct) : "unsupported";
    const capitalEfficiency =
      analysis.capitalEfficiencyStatus === "supported" && typeof analysis.capitalEfficiencyPct === "number"
        ? fmtPct(analysis.capitalEfficiencyPct)
        : "unsupported";
    const avgDeployedCapital =
      analysis.capitalEfficiencyStatus === "supported" && typeof analysis.avgDeployedCapitalUsd === "number"
        ? fmtUsd(analysis.avgDeployedCapitalUsd)
        : "unsupported";
    const sections: ReportDocument["sections"] = [
      section("overview", {
        text: [`From: ${fmtIso(analysis.periodFrom)}`, `To: ${fmtIso(analysis.periodTo)}`]
      }),
      section("roi", {
        kpis: [
          { label: "Period Net PnL", value: fmtUsd(analysis.periodNetPnlUsd) },
          { label: "ROI", value: roi }
        ]
      }),
      section("capitalEfficiency", {
        kpis: [
          { label: "Capital Efficiency", value: capitalEfficiency },
          { label: "Avg Deployed Capital", value: avgDeployedCapital }
        ]
      }),
      section("interpretation", {
        text: [
          `ROI status: ${analysis.roiStatus}`,
          ...(analysis.roiStatus === "unsupported"
            ? [
                `ROI unsupported code: ${analysis.roiUnsupportedReasonCode ?? "unknown"}`,
                `ROI unsupported reason: ${analysis.roiUnsupportedReason ?? "starting equity is unavailable"}`
              ]
            : []),
          `Interpretation: ${analysis.interpretation}`,
          analysis.capitalEfficiencyStatus === "unsupported"
            ? `Capital efficiency status: unsupported (${analysis.capitalEfficiencyReason ?? "equity history is unavailable"})`
            : "Capital efficiency status: supported"
        ]
      })
    ];

    const accountCompleteness = filterDataCompletenessIssues(
      account.dataCompleteness,
      (issue) => !(issue.code === "unsupported_feature" && issue.scope === "positions")
    );
    const dataCompleteness = mergeDataCompleteness(accountCompleteness, pnl.dataCompleteness);
    sections.push(
      section("dataCompleteness", {
        alerts: buildDataCompletenessAlerts(dataCompleteness)
      })
    );

    return {
      command: "performance",
      title: "Performance Analytics",
      schemaVersion: PERFORMANCE_SCHEMA_VERSION,
      generatedAt: new Date().toISOString(),
      sections,
      dataCompleteness
    };
  }
}
