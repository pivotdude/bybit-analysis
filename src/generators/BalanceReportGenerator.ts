import { BalanceAnalyzer } from "../analyzers/orchestrators/BalanceAnalyzer";
import type { AccountDataService } from "../services/contracts/AccountDataService";
import type { ReportDocument } from "../types/report.types";
import type { ServiceRequestContext } from "../services/contracts/AccountDataService";
import { fmtUsd } from "./formatters";

export class BalanceReportGenerator {
  private readonly analyzer = new BalanceAnalyzer();

  constructor(private readonly accountService: AccountDataService) {}

  async generate(context: ServiceRequestContext): Promise<ReportDocument> {
    const snapshot = await this.accountService.getAccountSnapshot(context);
    const analysis = this.analyzer.analyze(snapshot);
    const sections: ReportDocument["sections"] = [
      {
        title: "Balance Snapshot",
        type: "kpi",
        kpis: [
          { label: "Total Equity", value: fmtUsd(analysis.snapshot.totalEquityUsd) },
          { label: "Wallet Balance", value: fmtUsd(analysis.snapshot.walletBalanceUsd) },
          { label: "Available Balance", value: fmtUsd(analysis.snapshot.availableBalanceUsd) },
          { label: "Unrealized PnL", value: fmtUsd(analysis.snapshot.unrealizedPnlUsd) }
        ]
      },
      {
        title: "Asset Balances",
        type: "table",
        table: {
          headers: ["Asset", "Wallet", "Available", "USD Value"],
          rows: analysis.balances.map((balance) => [
            balance.asset,
            balance.walletBalance.toFixed(6),
            balance.availableBalance.toFixed(6),
            fmtUsd(balance.usdValue)
          ])
        }
      },
      {
        title: "Margin State",
        type: "kpi",
        kpis: [
          { label: "Initial Margin", value: fmtUsd(analysis.marginState.initialMarginUsd) },
          { label: "Maintenance Margin", value: fmtUsd(analysis.marginState.maintenanceMarginUsd) },
          { label: "Margin Balance", value: fmtUsd(analysis.marginState.marginBalanceUsd) }
        ]
      }
    ];

    if (snapshot.dataCompleteness.partial) {
      sections.push({
        title: "Data Completeness",
        type: "alerts",
        alerts: snapshot.dataCompleteness.warnings.map((message) => ({ severity: "warning", message }))
      });
    }

    return {
      command: "balance",
      title: "Balance Analytics",
      generatedAt: new Date().toISOString(),
      sections
    };
  }
}
