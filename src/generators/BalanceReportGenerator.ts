import { BalanceAnalyzer } from "../analyzers/orchestrators/BalanceAnalyzer";
import type { AccountDataService } from "../services/contracts/AccountDataService";
import type { ReportDocument } from "../types/report.types";
import type { ReportSectionType } from "../types/report.types";
import type { ServiceRequestContext } from "../services/contracts/AccountDataService";
import { fmtUsd } from "./formatters";
import { buildDataCompletenessAlerts, createSectionBuilder } from "./reportContract";
import { filterDataCompletenessIssues } from "../services/reliability/dataCompleteness";

export const BALANCE_SCHEMA_VERSION = "balance-markdown-v1";

export const BALANCE_SECTION_CONTRACT = {
  snapshot: { id: "balance.snapshot", title: "Balance Snapshot", type: "kpi" },
  assets: { id: "balance.asset_balances", title: "Asset Balances", type: "table" },
  margin: { id: "balance.margin_state", title: "Margin State", type: "kpi" },
  dataCompleteness: { id: "balance.data_completeness", title: "Data Completeness", type: "alerts" }
} as const satisfies Record<string, { id: string; title: string; type: ReportSectionType }>;

export const BALANCE_SECTION_ORDER = [
  "snapshot",
  "assets",
  "margin",
  "dataCompleteness"
] as const satisfies readonly (keyof typeof BALANCE_SECTION_CONTRACT)[];

const section = createSectionBuilder(BALANCE_SECTION_CONTRACT);

export class BalanceReportGenerator {
  private readonly analyzer = new BalanceAnalyzer();

  constructor(private readonly accountService: AccountDataService) {}

  async generate(context: ServiceRequestContext): Promise<ReportDocument> {
    const snapshot = await this.accountService.getAccountSnapshot(context);
    const dataCompleteness = filterDataCompletenessIssues(
      snapshot.dataCompleteness,
      (issue) =>
        !(
          issue.code === "unsupported_feature" &&
          (issue.scope === "positions" || issue.scope === "equity_history")
        )
    );
    const analysis = this.analyzer.analyze(snapshot);
    const hasBotCapital = (analysis.botCapital?.length ?? 0) > 0;
    const assetBalanceHeaders = hasBotCapital
      ? ["Asset", "Allocated Capital (USD)", "Available Capital (USD)", "Equity (USD)"]
      : ["Asset", "Wallet", "Available", "USD Value"];
    const assetBalanceRows = hasBotCapital
      ? (analysis.botCapital ?? []).map((capital) => [
          capital.asset,
          fmtUsd(capital.allocatedCapitalUsd),
          fmtUsd(capital.availableBalanceUsd),
          fmtUsd(capital.equityUsd)
        ])
      : analysis.balances.map((balance) => [
          balance.asset,
          balance.walletBalance.toFixed(6),
          balance.availableBalance.toFixed(6),
          fmtUsd(balance.usdValue)
        ]);

    const sections: ReportDocument["sections"] = [
      section("snapshot", {
        kpis: [
          { label: "Total Equity", value: fmtUsd(analysis.snapshot.totalEquityUsd) },
          { label: "Wallet Balance", value: fmtUsd(analysis.snapshot.walletBalanceUsd) },
          { label: "Available Balance", value: fmtUsd(analysis.snapshot.availableBalanceUsd) },
          { label: "Unrealized PnL", value: fmtUsd(analysis.snapshot.unrealizedPnlUsd) }
        ]
      }),
      section("assets", {
        table: {
          headers: assetBalanceHeaders,
          rows: assetBalanceRows
        }
      }),
      section("margin", {
        kpis: [
          { label: "Initial Margin", value: fmtUsd(analysis.marginState.initialMarginUsd) },
          { label: "Maintenance Margin", value: fmtUsd(analysis.marginState.maintenanceMarginUsd) },
          { label: "Margin Balance", value: fmtUsd(analysis.marginState.marginBalanceUsd) }
        ]
      }),
      section("dataCompleteness", {
        alerts: buildDataCompletenessAlerts(dataCompleteness)
      })
    ];

    return {
      command: "balance",
      title: "Balance Analytics",
      schemaVersion: BALANCE_SCHEMA_VERSION,
      generatedAt: new Date().toISOString(),
      sections,
      dataCompleteness
    };
  }
}
