import { PnLAnalyzer } from "../analyzers/orchestrators/PnLAnalyzer";
import type { ExecutionDataService } from "../services/contracts/ExecutionDataService";
import type { AccountDataService, ServiceRequestContext } from "../services/contracts/AccountDataService";
import type { ReportDocument } from "../types/report.types";
import { fmtIso, fmtPct, fmtUsd } from "./formatters";

export class PnLReportGenerator {
  private readonly analyzer = new PnLAnalyzer();

  constructor(
    private readonly executionService: ExecutionDataService,
    private readonly accountService: AccountDataService
  ) {}

  async generate(context: ServiceRequestContext): Promise<ReportDocument> {
    const account = await this.accountService.getAccountSnapshot(context);
    const pnl = await this.executionService.getPnlReport(context, undefined, account.totalEquityUsd);
    const analysis = this.analyzer.analyze(pnl);

    const roi = typeof analysis.roiPct === "number" ? fmtPct(analysis.roiPct) : "N/A";
    const winnerRows = analysis.bestSymbols.map((item) => ["Winner", item.symbol, fmtUsd(item.netPnlUsd)]);
    const winnerSymbols = new Set(analysis.bestSymbols.map((item) => item.symbol));
    const loserRows = analysis.worstSymbols
      .filter((item) => !winnerSymbols.has(item.symbol) && item.netPnlUsd < 0)
      .map((item) => ["Loser", item.symbol, fmtUsd(item.netPnlUsd)]);

    return {
      command: "pnl",
      title: "PnL Analytics",
      generatedAt: new Date().toISOString(),
      sections: [
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
      ]
    };
  }
}
