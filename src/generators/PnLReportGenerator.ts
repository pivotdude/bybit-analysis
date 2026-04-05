import { PnLAnalyzer } from "../analyzers/orchestrators/PnLAnalyzer";
import type { ExecutionDataService } from "../services/contracts/ExecutionDataService";
import type { AccountDataService, ServiceRequestContext } from "../services/contracts/AccountDataService";
import type { ReportDocument } from "../types/report.types";
import type { ReportSectionType } from "../types/report.types";
import { fmtIso, fmtUsd } from "./formatters";
import { filterDataCompletenessIssues, mergeDataCompleteness } from "../services/reliability/dataCompleteness";
import { buildDataCompletenessAlerts, createSectionBuilder } from "./reportContract";
import { resolveStartingEquity } from "../services/roi/startingEquityResolver";
import { resolveRoiContract } from "./roiContractResolver";
import { createSourceMetadata } from "./sourceMetadata";

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
    const walletSnapshot = await this.accountService.getWalletSnapshot(context);
    const generatedAt = new Date().toISOString();
    const startingEquity = resolveStartingEquity(walletSnapshot, context.from);
    const pnl = await this.executionService.getPnlReport({
      context,
      equityStartUsd: startingEquity.equityStartUsd,
      roiMissingStartReason: startingEquity.missingStartReason,
      roiMissingStartReasonCode: startingEquity.missingStartReasonCode
    });
    const analysis = this.analyzer.analyze(pnl);
    const roi = resolveRoiContract(analysis);
    const periodEndStateUnsupported = analysis.endStateStatus === "unsupported";
    const symbolRankedByNet = [...analysis.bySymbol].sort(
      (left, right) => right.netPnlUsd - left.netPnlUsd || left.symbol.localeCompare(right.symbol)
    );
    const winnerRows = symbolRankedByNet
      .filter((item) => item.netPnlUsd > 0)
      .slice(0, 5)
      .map((item) => ["Winner", item.symbol, fmtUsd(item.netPnlUsd)]);
    const loserRows = [...symbolRankedByNet]
      .reverse()
      .filter((item) => item.netPnlUsd < 0)
      .slice(0, 5)
      .map((item) => ["Loser", item.symbol, fmtUsd(item.netPnlUsd)]);
    const isMarketMode = context.sourceMode === "market";
    const symbolBreakdownHeaders = isMarketMode
      ? ["Symbol", "Realized", "Realized Net", "Trades"]
      : ["Symbol", "Realized", "Unrealized", "Net", "Trades"];
    const symbolBreakdownRows = analysis.bySymbol.map((item) =>
      isMarketMode
        ? [item.symbol, fmtUsd(item.realizedPnlUsd), fmtUsd(item.netPnlUsd), String(item.tradesCount ?? 0)]
        : [
            item.symbol,
            fmtUsd(item.realizedPnlUsd),
            fmtUsd(item.unrealizedPnlUsd ?? 0),
            fmtUsd(item.netPnlUsd),
            String(item.tradesCount ?? 0)
          ]
    );
    const winnerLoserValueLabel = isMarketMode ? "Realized Net PnL" : "Net PnL";
    const sections: ReportDocument["sections"] = [
      section("period", {
        text: [`From: ${fmtIso(analysis.periodFrom)}`, `To: ${fmtIso(analysis.periodTo)}`]
      }),
      section("summary", {
        kpis: [
          { label: "Realized PnL", value: fmtUsd(analysis.realizedPnlUsd) },
          {
            label: "Period End-State UPnL",
            value: periodEndStateUnsupported ? "unsupported" : fmtUsd(analysis.unrealizedPnlUsd)
          },
          { label: "Fees", value: fmtUsd(analysis.totalFeesUsd) },
          {
            label: periodEndStateUnsupported ? "Realized Net PnL" : "Net PnL",
            value: fmtUsd(analysis.netPnlUsd)
          },
          { label: "ROI", value: roi.roiKpiValue }
        ]
      }),
      section("roiStatus", {
        text: [
          ...roi.pnlStatusLines,
          `Period end-state: ${analysis.endStateStatus}`,
          ...(analysis.endStateUnsupportedReason ? [`End-state reason: ${analysis.endStateUnsupportedReason}`] : [])
        ]
      }),
      section("symbolBreakdown", {
        table: {
          headers: symbolBreakdownHeaders,
          rows: symbolBreakdownRows
        }
      }),
      section("winnersLosers", {
        table: {
          headers: ["Bucket", "Symbol", winnerLoserValueLabel],
          rows: [
            ...(winnerRows.length > 0 ? winnerRows : [["Winner", "-", "No winning symbols in period"]]),
            ...(loserRows.length > 0 ? loserRows : [["Loser", "-", "No losing symbols in period"]])
          ]
        }
      })
    ];

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
      command: "pnl",
      title: "PnL Analytics",
      schemaVersion: PNL_SCHEMA_VERSION,
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
          capturedAt: walletSnapshot.capturedAt
        }),
        createSourceMetadata({
          id: "period_pnl",
          kind: "period_pnl_snapshot",
          provider: pnl.source,
          category: context.category,
          sourceMode: context.sourceMode,
          fetchedAt: pnl.generatedAt,
          periodFrom: pnl.periodFrom,
          periodTo: pnl.periodTo
        })
      ],
      data: {
        summary: {
          periodFrom: analysis.periodFrom,
          periodTo: analysis.periodTo,
          realizedPnlUsd: analysis.realizedPnlUsd,
          unrealizedPnlUsd: analysis.unrealizedPnlUsd,
          totalFeesUsd: analysis.totalFeesUsd,
          netPnlUsd: analysis.netPnlUsd
        },
        roi: {
          status: analysis.roiStatus,
          reason: analysis.roiUnsupportedReason,
          reasonCode: analysis.roiUnsupportedReasonCode,
          startEquityUsd: analysis.roiStartEquityUsd,
          endEquityUsd: analysis.roiEndEquityUsd,
          roiPct: analysis.roiPct
        },
        endState: {
          status: analysis.endStateStatus,
          reason: analysis.endStateUnsupportedReason,
          reasonCode: analysis.endStateUnsupportedReasonCode
        },
        bySymbol: analysis.bySymbol
      }
    };
  }
}
