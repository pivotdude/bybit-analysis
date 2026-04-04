import { PnLAnalyzer } from "../analyzers/orchestrators/PnLAnalyzer";
import type { ExecutionDataService } from "../services/contracts/ExecutionDataService";
import type { AccountDataService, ServiceRequestContext } from "../services/contracts/AccountDataService";
import type { AccountSnapshot } from "../types/domain.types";
import type { ReportDocument } from "../types/report.types";
import { fmtIso, fmtPct, fmtUsd } from "./formatters";
import { mergeDataCompleteness } from "../services/reliability/dataCompleteness";
import { pushDataCompletenessSections } from "./dataCompleteness";

interface StartingEquityResolution {
  equityStartUsd?: number;
  reason?: string;
}

function resolveStartingEquity(account: AccountSnapshot, periodFrom: string): StartingEquityResolution {
  const history = account.equityHistory;
  if (!history || history.length === 0) {
    return { reason: "equity history is unavailable" };
  }

  const periodFromMs = new Date(periodFrom).getTime();
  if (!Number.isFinite(periodFromMs)) {
    return { reason: "invalid period start boundary" };
  }

  let matchingSample: AccountSnapshot["equityHistory"][number] | undefined;
  for (const sample of history) {
    const sampleTsMs = new Date(sample.timestamp).getTime();
    if (!Number.isFinite(sampleTsMs)) {
      continue;
    }

    if (sampleTsMs <= periodFromMs) {
      matchingSample = sample;
      continue;
    }

    break;
  }

  if (!matchingSample) {
    return { reason: "no equity sample found at or before period start" };
  }

  if (!Number.isFinite(matchingSample.totalEquityUsd)) {
    return { reason: "starting equity sample is invalid" };
  }

  return { equityStartUsd: matchingSample.totalEquityUsd };
}

export class PnLReportGenerator {
  private readonly analyzer = new PnLAnalyzer();

  constructor(
    private readonly executionService: ExecutionDataService,
    private readonly accountService: AccountDataService
  ) {}

  async generate(context: ServiceRequestContext): Promise<ReportDocument> {
    const account = await this.accountService.getAccountSnapshot(context);
    const startingEquity = resolveStartingEquity(account, context.from);
    const pnl = await this.executionService.getPnlReport(
      context,
      startingEquity.equityStartUsd,
      account.totalEquityUsd
    );
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
            `Reason: ${startingEquity.reason ?? analysis.roiUnsupportedReason ?? "starting equity is unavailable"}`
          ];
    const winnerRows = analysis.bestSymbols.map((item) => ["Winner", item.symbol, fmtUsd(item.netPnlUsd)]);
    const winnerSymbols = new Set(analysis.bestSymbols.map((item) => item.symbol));
    const loserRows = analysis.worstSymbols
      .filter((item) => !winnerSymbols.has(item.symbol) && item.netPnlUsd < 0)
      .map((item) => ["Loser", item.symbol, fmtUsd(item.netPnlUsd)]);
    const sections: ReportDocument["sections"] = [
      {
        title: "Period",
        type: "text",
        text: [`From: ${fmtIso(analysis.periodFrom)}`, `To: ${fmtIso(analysis.periodTo)}`]
      },
      {
        title: "PnL Summary",
        type: "kpi",
        kpis: [
          { label: "Realized PnL", value: fmtUsd(analysis.realizedPnlUsd) },
          { label: "Unrealized PnL", value: fmtUsd(analysis.unrealizedPnlUsd) },
          { label: "Fees", value: fmtUsd(analysis.totalFeesUsd) },
          { label: "Net PnL", value: fmtUsd(analysis.netPnlUsd) },
          { label: "ROI", value: roi }
        ]
      },
      {
        title: "ROI Status",
        type: "text",
        text: roiStatusLines
      },
      {
        title: "Symbol Breakdown",
        type: "table",
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
      },
      {
        title: "Winners/Losers",
        type: "table",
        table: {
          headers: ["Bucket", "Symbol", "Net PnL"],
          rows: [
            ...winnerRows,
            ...(loserRows.length > 0 ? loserRows : [["Loser", "-", "No losing symbols in period"]])
          ]
        }
      }
    ];

    const dataCompleteness = mergeDataCompleteness(account.dataCompleteness, pnl.dataCompleteness);
    pushDataCompletenessSections(sections, dataCompleteness);

    return {
      command: "pnl",
      title: "PnL Analytics",
      generatedAt: new Date().toISOString(),
      sections,
      dataCompleteness
    };
  }
}
