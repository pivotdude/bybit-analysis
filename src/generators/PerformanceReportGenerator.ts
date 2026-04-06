import { PerformanceAnalyzer } from "../analyzers/orchestrators/PerformanceAnalyzer";
import type { ExecutionDataService } from "../services/contracts/ExecutionDataService";
import type { AccountDataService, ServiceRequestContext } from "../services/contracts/AccountDataService";
import type { ReportDocument } from "../types/report.types";
import type { ReportSectionType } from "../types/report.types";
import { fmtIso, fmtPct, fmtUsd } from "./formatters";
import { filterDataCompletenessIssues, mergeDataCompleteness } from "../services/reliability/dataCompleteness";
import { buildDataCompletenessAlerts, createSectionBuilder } from "./reportContract";
import { resolveStartingEquity } from "../services/roi/startingEquityResolver";
import { resolveRoiContract } from "./roiContractResolver";
import { createSourceMetadata } from "./sourceMetadata";

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
    const walletSnapshot = await this.accountService.getWalletSnapshot(context);
    const generatedAt = new Date().toISOString();
    const startingEquity = resolveStartingEquity(walletSnapshot, context.from);
    const pnl = await this.executionService.getPnlReport({
      context,
      equityStartUsd: startingEquity.equityStartUsd,
      roiMissingStartReason: startingEquity.missingStartReason,
      roiMissingStartReasonCode: startingEquity.missingStartReasonCode
    });
    const analysis = this.analyzer.analyze(walletSnapshot, pnl);
    const roi = resolveRoiContract(analysis);
    const periodEndStateUnsupported = analysis.endStateStatus === "unsupported";
    const roiSupported = analysis.roiStatus === "supported";
    const capitalEffSupported = analysis.capitalEfficiencyStatus === "supported";

    const sections: ReportDocument["sections"] = [
      section("overview", {
        text: [`From: ${fmtIso(analysis.periodFrom)}`, `To: ${fmtIso(analysis.periodTo)}`]
      })
    ];

    const capitalEfficiency = capitalEffSupported
      ? fmtPct(analysis.capitalEfficiencyPct)
      : "unsupported";
    const avgDeployedCapital = capitalEffSupported
      ? fmtUsd(analysis.avgDeployedCapitalUsd)
      : "unsupported";

    sections.push(
      section("roi", {
        kpis: [
          { label: periodEndStateUnsupported ? "Realized Net PnL" : "Period Net PnL", value: fmtUsd(analysis.periodNetPnlUsd) },
          ...(roiSupported ? [{ label: "ROI", value: roi.roiKpiValue as string }] : [])
        ]
      })
    );

    if (roiSupported || capitalEffSupported) {
      sections.push(
        section("capitalEfficiency", {
          kpis: [
            { label: "Capital Efficiency", value: capitalEfficiency },
            { label: "Avg Deployed Capital", value: avgDeployedCapital }
          ]
        })
      );
    }

    sections.push(
      section("interpretation", {
        text: [
          ...(roiSupported
            ? [`Interpretation: ${analysis.interpretation}`]
            : [`ROI status: unsupported`, `ROI unsupported code: ${analysis.roiUnsupportedReasonCode ?? "unknown"}`]),
          !capitalEffSupported
            ? `Capital efficiency: unsupported (${analysis.capitalEfficiencyReason ?? "equity history unavailable"})`
            : `Capital efficiency: ${fmtPct(analysis.capitalEfficiencyPct)}`
        ]
      })
    );

    const accountCompleteness = filterDataCompletenessIssues(
      walletSnapshot.dataCompleteness,
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
      generatedAt,
      sections,
      dataCompleteness,
      sources: [
        createSourceMetadata({
          id: "wallet_snapshot",
          kind: "wallet_snapshot",
          provider: walletSnapshot.source,
          exchange: walletSnapshot.exchange,
          category: walletSnapshot.category,
          sourceMode: context.sourceMode,
          fetchedAt: walletSnapshot.capturedAt,
          capturedAt: walletSnapshot.capturedAt,
          cacheStatus: walletSnapshot.cacheStatus
        }),
        createSourceMetadata({
          id: "period_pnl",
          kind: "period_pnl_snapshot",
          provider: pnl.source,
          category: context.category,
          sourceMode: context.sourceMode,
          fetchedAt: pnl.generatedAt,
          periodFrom: pnl.periodFrom,
          periodTo: pnl.periodTo,
          cacheStatus: pnl.cacheStatus
        })
      ],
      data: {
        periodFrom: analysis.periodFrom,
        periodTo: analysis.periodTo,
        periodNetPnlUsd: analysis.periodNetPnlUsd,
        roi: {
          status: analysis.roiStatus,
          reason: analysis.roiUnsupportedReason,
          reasonCode: analysis.roiUnsupportedReasonCode,
          startEquityUsd: analysis.roiStartEquityUsd,
          endEquityUsd: analysis.roiEndEquityUsd,
          roiPct: analysis.roiPct
        },
        capitalEfficiency: {
          status: analysis.capitalEfficiencyStatus,
          reason: analysis.capitalEfficiencyReason,
          avgDeployedCapitalUsd: analysis.avgDeployedCapitalUsd,
          capitalEfficiencyPct: analysis.capitalEfficiencyPct
        },
        endState: {
          status: analysis.endStateStatus,
          reason: analysis.endStateUnsupportedReason,
          reasonCode: analysis.endStateUnsupportedReasonCode
        },
        interpretation: analysis.interpretation
      }
    };
  }
}
