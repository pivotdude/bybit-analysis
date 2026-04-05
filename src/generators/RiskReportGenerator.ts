import { RiskAnalyzer } from "../analyzers/orchestrators/RiskAnalyzer";
import type { AccountDataService, ServiceRequestContext } from "../services/contracts/AccountDataService";
import type { PositionDataService } from "../services/contracts/PositionDataService";
import { composeAccountSnapshot } from "../services/contracts/accountSnapshot";
import type { ReportDocument } from "../types/report.types";
import type { ReportSectionType } from "../types/report.types";
import { fmtPct, fmtUsd } from "./formatters";
import { buildDataCompletenessAlerts, createSectionBuilder } from "./reportContract";
import {
  filterDataCompletenessIssues,
  getUnsupportedFeatureIssueMessage
} from "../services/reliability/dataCompleteness";
import { createSourceMetadata } from "./sourceMetadata";

export const RISK_SCHEMA_VERSION = "risk-markdown-v1";

export const RISK_SECTION_CONTRACT = {
  overview: { id: "risk.overview", title: "Risk Overview", type: "kpi" },
  positionSizing: { id: "risk.position_sizing", title: "Position Sizing Risk", type: "kpi" },
  unrealizedLoss: { id: "risk.unrealized_loss", title: "Unrealized Loss Risk", type: "kpi" },
  alerts: { id: "risk.alerts", title: "Alerts", type: "alerts" },
  dataCompleteness: { id: "risk.data_completeness", title: "Data Completeness", type: "alerts" }
} as const satisfies Record<string, { id: string; title: string; type: ReportSectionType }>;

export const RISK_SECTION_ORDER = [
  "overview",
  "positionSizing",
  "unrealizedLoss",
  "alerts",
  "dataCompleteness"
] as const satisfies readonly (keyof typeof RISK_SECTION_CONTRACT)[];

const section = createSectionBuilder(RISK_SECTION_CONTRACT);

export class RiskReportGenerator {
  private readonly analyzer = new RiskAnalyzer();

  constructor(
    private readonly accountService: AccountDataService,
    private readonly positionService: PositionDataService
  ) {}

  async generate(context: ServiceRequestContext): Promise<ReportDocument> {
    const walletSnapshot = await this.accountService.getWalletSnapshot(context);
    const positionsResult = await this.positionService.getOpenPositions(context);
    const account = composeAccountSnapshot(walletSnapshot, positionsResult);
    const generatedAt = new Date().toISOString();
    const dataCompleteness = filterDataCompletenessIssues(
      account.dataCompleteness,
      (issue) => !(issue.code === "unsupported_feature" && issue.scope === "equity_history")
    );
    const unsupportedMessage = getUnsupportedFeatureIssueMessage(dataCompleteness, "positions");
    if (unsupportedMessage) {
      const sections: ReportDocument["sections"] = [
        section("overview", {
          kpis: [
            { label: "Weighted Avg Leverage", value: "unsupported" },
            { label: "Max Leverage Used", value: "unsupported" },
            { label: "Notional / Equity", value: "unsupported" }
          ]
        }),
        section("positionSizing", {
          kpis: [
            { label: "Largest Position", value: "unsupported" },
            { label: "Largest Position Notional", value: "unsupported" },
            { label: "Largest Position % Equity", value: "unsupported" }
          ]
        }),
        section("unrealizedLoss", {
          kpis: [
            { label: "Unrealized Loss", value: "unsupported" },
            { label: "Loss / Equity", value: "unsupported" },
            { label: "Worst Position", value: "unsupported" },
            { label: "Worst Position Loss", value: "unsupported" }
          ]
        }),
        section("alerts", {
          alerts: [{ severity: "critical", message: unsupportedMessage }]
        }),
        section("dataCompleteness", {
          alerts: buildDataCompletenessAlerts(dataCompleteness)
        })
      ];

      return {
        command: "risk",
        title: "Risk Analytics",
        schemaVersion: RISK_SCHEMA_VERSION,
        generatedAt,
        asOf: account.capturedAt,
        sections,
        dataCompleteness,
        sources: [
          createSourceMetadata({
            id: "wallet_snapshot",
            kind: "wallet_snapshot",
            provider: account.source,
            exchange: account.exchange,
            category: account.category,
            sourceMode: context.sourceMode,
            fetchedAt: account.capturedAt,
            capturedAt: account.capturedAt
          }),
          createSourceMetadata({
            id: "positions_snapshot",
            kind: "positions_snapshot",
            provider: positionsResult.source,
            exchange: positionsResult.exchange,
            category: context.category,
            sourceMode: context.sourceMode,
            fetchedAt: positionsResult.capturedAt,
            capturedAt: positionsResult.capturedAt
          })
        ],
        data: {
          unsupportedReason: unsupportedMessage
        }
      };
    }

    const report = this.analyzer.analyze(account, account.positions);
    const sections: ReportDocument["sections"] = [
      section("overview", {
        kpis: [
          { label: "Weighted Avg Leverage", value: `${report.leverageUsage.weightedAvgLeverage.toFixed(2)}x` },
          { label: "Max Leverage Used", value: `${report.leverageUsage.maxLeverageUsed.toFixed(2)}x` },
          { label: "Notional / Equity", value: fmtPct(report.leverageUsage.notionalToEquityPct) }
        ]
      }),
      section("positionSizing", {
        kpis: [
          { label: "Largest Position", value: report.maxPositionSize.symbol },
          { label: "Largest Position Notional", value: fmtUsd(report.maxPositionSize.notionalUsd) },
          { label: "Largest Position % Equity", value: fmtPct(report.maxPositionSize.pctOfEquity) }
        ]
      }),
      section("unrealizedLoss", {
        kpis: [
          { label: "Unrealized Loss", value: fmtUsd(report.unrealizedLossRisk.unrealizedLossUsd) },
          { label: "Loss / Equity", value: fmtPct(report.unrealizedLossRisk.unrealizedLossToEquityPct) },
          { label: "Worst Position", value: report.unrealizedLossRisk.worstPositionSymbol ?? "N/A" },
          { label: "Worst Position Loss", value: fmtUsd(report.unrealizedLossRisk.worstPositionLossUsd ?? 0) }
        ]
      }),
      section("alerts", {
        alerts:
          report.alerts.length > 0
            ? report.alerts.map((alert) => ({ severity: alert.severity, message: alert.message }))
            : [{ severity: "info", message: "No active risk alerts" }]
      }),
      section("dataCompleteness", {
        alerts: buildDataCompletenessAlerts(dataCompleteness)
      })
    ];

    return {
      command: "risk",
      title: "Risk Analytics",
      schemaVersion: RISK_SCHEMA_VERSION,
      generatedAt,
      asOf: account.capturedAt,
      sections,
      dataCompleteness,
      sources: [
        createSourceMetadata({
          id: "wallet_snapshot",
          kind: "wallet_snapshot",
          provider: account.source,
          exchange: account.exchange,
          category: account.category,
          sourceMode: context.sourceMode,
          fetchedAt: account.capturedAt,
          capturedAt: account.capturedAt
        }),
        createSourceMetadata({
          id: "positions_snapshot",
          kind: "positions_snapshot",
          provider: positionsResult.source,
          exchange: positionsResult.exchange,
          category: context.category,
          sourceMode: context.sourceMode,
          fetchedAt: positionsResult.capturedAt,
          capturedAt: positionsResult.capturedAt
        })
      ],
      data: report
    };
  }
}
