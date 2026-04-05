import { PnLAnalyzer } from "../analyzers/orchestrators/PnLAnalyzer";
import type { ExecutionDataService } from "../services/contracts/ExecutionDataService";
import type { AccountDataService, ServiceRequestContext } from "../services/contracts/AccountDataService";
import type { ReportDocument } from "../types/report.types";
import type { ReportSectionType } from "../types/report.types";
import { fmtIso, fmtPct, fmtUsd } from "./formatters";
import { filterDataCompletenessIssues, mergeDataCompleteness } from "../services/reliability/dataCompleteness";
import { buildDataCompletenessAlerts, createSectionBuilder } from "./reportContract";
import { resolveStartingEquity } from "../services/roi/startingEquityResolver";

export const PNL_SCHEMA_VERSION = "pnl-markdown-v1";

export const PNL_SECTION_CONTRACT = {
  period: { id: "pnl.period", title: "Period", type: "text" },
  summary: { id: "pnl.summary", title: "PnL Summary", type: "kpi" },
  roiStatus: { id: "pnl.roi_status", title: "ROI Status", type: "text" },
  symbolBreakdown: { id: "pnl.symbol_breakdown", title: "Symbol Breakdown", type: "table" },
  winnersLosers: { id: "pnl.winners_losers", title: "Winners/Losers", type: "table" },
  dataCompleteness: { id: "pnl.data_completeness", title: "Data Completeness", type: "alerts" }
} as const satisfies Record<string, { id: string; title: string; type: ReportSectionType }>;

export const PNL_SECTION_ORDER = [
  "period",
  "summary",
  "roiStatus",
  "symbolBreakdown",
  "winnersLosers",
  "dataCompleteness"
] as const satisfies readonly (keyof typeof PNL_SECTION_CONTRACT)[];

const section = createSectionBuilder(PNL_SECTION_CONTRACT);

export class PnLReportGenerator {
  private readonly analyzer = new PnLAnalyzer();

  constructor(
    private readonly executionService: ExecutionDataService,
    private readonly accountService: AccountDataService
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
    const analysis = this.analyzer.analyze(pnl);

    const roi = analysis.roiStatus === "supported" && typeof analysis.roiPct === "number" ? fmtPct(analysis.roiPct) : "unsupported";
    const roiStatusLines =
      analysis.roiStatus === "supported"
        ? [
            "Status: supported",
            ...(typeof analysis.roiStartEquityUsd === "number"
              ? [`Start equity: ${fmtUsd(analysis.roiStartEquityUsd)}`]
              : []),
            ...(typeof analysis.roiEndEquityUsd === "number" ? [`End equity: ${fmtUsd(analysis.roiEndEquityUsd)}`] : [])
          ]
        : [
            "Status: unsupported",
            `Code: ${analysis.roiUnsupportedReasonCode ?? startingEquity.missingStartReasonCode ?? "unknown"}`,
            `Reason: ${analysis.roiUnsupportedReason ?? startingEquity.missingStartReason ?? "starting equity is unavailable"}`
          ];
    const winnerRows = analysis.bestSymbols.map((item) => ["Winner", item.symbol, fmtUsd(item.netPnlUsd)]);
    const winnerSymbols = new Set(analysis.bestSymbols.map((item) => item.symbol));
    const loserRows = analysis.worstSymbols
      .filter((item) => !winnerSymbols.has(item.symbol) && item.netPnlUsd < 0)
      .map((item) => ["Loser", item.symbol, fmtUsd(item.netPnlUsd)]);
    const sections: ReportDocument["sections"] = [
      section("period", {
        text: [`From: ${fmtIso(analysis.periodFrom)}`, `To: ${fmtIso(analysis.periodTo)}`]
      }),
      section("summary", {
        kpis: [
          { label: "Realized PnL", value: fmtUsd(analysis.realizedPnlUsd) },
          { label: "Unrealized PnL", value: fmtUsd(analysis.unrealizedPnlUsd) },
          { label: "Fees", value: fmtUsd(analysis.totalFeesUsd) },
          { label: "Net PnL", value: fmtUsd(analysis.netPnlUsd) },
          { label: "ROI", value: roi }
        ]
      }),
      section("roiStatus", {
        text: roiStatusLines
      }),
      section("symbolBreakdown", {
        table: {
          headers: ["Symbol", "Realized", "Unrealized", "Net", "Trades"],
          rows: analysis.bySymbol.map((item) => [
            item.symbol,
            fmtUsd(item.realizedPnlUsd),
            fmtUsd(item.unrealizedPnlUsd),
            fmtUsd(item.netPnlUsd),
            String(item.tradesCount ?? 0)
          ])
        }
      }),
      section("winnersLosers", {
        table: {
          headers: ["Bucket", "Symbol", "Net PnL"],
          rows: [
            ...winnerRows,
            ...(loserRows.length > 0 ? loserRows : [["Loser", "-", "No losing symbols in period"]])
          ]
        }
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
      command: "pnl",
      title: "PnL Analytics",
      schemaVersion: PNL_SCHEMA_VERSION,
      generatedAt: new Date().toISOString(),
      sections,
      dataCompleteness
    };
  }
}
