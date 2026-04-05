import { SummaryAnalyzer } from "../analyzers/orchestrators/SummaryAnalyzer";
import type { AccountDataService, ServiceRequestContext } from "../services/contracts/AccountDataService";
import type { ExecutionDataService } from "../services/contracts/ExecutionDataService";
import type { BotDataService } from "../services/contracts/BotDataService";
import type { MarkdownAlert, ReportDocument, ReportSection, ReportSectionType } from "../types/report.types";
import type { BotReport, DataCompleteness } from "../types/domain.types";
import { fmtPct, fmtUsd } from "./formatters";
import {
  degradedDataCompleteness,
  getUnsupportedFeatureIssueMessage,
  mergeDataCompleteness
} from "../services/reliability/dataCompleteness";
import { resolveStartingEquity } from "../services/roi/startingEquityResolver";
import { createSectionBuilder } from "./reportContract";

export const SUMMARY_SCHEMA_VERSION = "summary-markdown-v1";

export const SUMMARY_SECTION_CONTRACT = {
  contract: { id: "summary.contract", title: "Summary Contract", type: "text" },
  overview: { id: "summary.overview", title: "Overview", type: "kpi" },
  activity: { id: "summary.activity", title: "Activity", type: "kpi" },
  allocation: { id: "summary.allocation", title: "Allocation", type: "kpi" },
  exposure: { id: "summary.exposure", title: "Exposure", type: "kpi" },
  risk: { id: "summary.risk", title: "Risk", type: "kpi" },
  positions: { id: "summary.open_positions", title: "Open Positions", type: "table" },
  holdings: { id: "summary.top_holdings", title: "Top Holdings", type: "table" },
  symbolPnl: { id: "summary.symbol_pnl", title: "Symbol PnL", type: "table" },
  bots: { id: "summary.bots", title: "Bots", type: "table" },
  alerts: { id: "summary.alerts", title: "Alerts", type: "alerts" },
  dataCompleteness: {
    id: "summary.data_completeness",
    title: "Data Completeness",
    type: "alerts"
  }
} as const satisfies Record<string, { id: string; title: string; type: ReportSectionType }>;

export const SUMMARY_SECTION_ORDER = [
  "contract",
  "overview",
  "activity",
  "allocation",
  "exposure",
  "risk",
  "positions",
  "holdings",
  "symbolPnl",
  "bots",
  "alerts",
  "dataCompleteness"
] as const satisfies readonly (keyof typeof SUMMARY_SECTION_CONTRACT)[];

type SummarySectionKey = keyof typeof SUMMARY_SECTION_CONTRACT;
const section = createSectionBuilder(SUMMARY_SECTION_CONTRACT);

const STABLE_ASSETS = new Set(["USDT", "USDC", "USD", "USDE", "FDUSD", "DAI", "TUSD", "USDD"]);

interface BotLoadResult {
  report?: BotReport;
  dataCompleteness: DataCompleteness;
  failureReason?: string;
}

export class SummaryReportGenerator {
  private readonly analyzer = new SummaryAnalyzer();

  constructor(
    private readonly accountService: AccountDataService,
    private readonly executionService: ExecutionDataService,
    private readonly botService?: BotDataService
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
    const bot = await this.loadBotReport(context);
    const botReport = bot.report;
    const summary = this.analyzer.analyze(account, pnl, botReport);
    const unsupportedExposureRiskReason = getUnsupportedFeatureIssueMessage(account.dataCompleteness, "positions");

    const tradedSymbols = pnl.bySymbol.length;
    const totalTrades = pnl.bySymbol.reduce((sum, item) => sum + (item.tradesCount ?? 0), 0);
    const winners = pnl.bySymbol.filter((item) => item.netPnlUsd > 0).length;
    const losers = pnl.bySymbol.filter((item) => item.netPnlUsd < 0).length;
    const winRate = tradedSymbols > 0 ? (winners / tradedSymbols) * 100 : 0;

    const stableValueUsd = account.balances
      .filter((balance) => STABLE_ASSETS.has(balance.asset.toUpperCase()))
      .reduce((sum, balance) => sum + balance.usdValue, 0);
    const nonStableValueUsd = Math.max(0, account.totalEquityUsd - stableValueUsd);
    const stableSharePct = account.totalEquityUsd > 0 ? (stableValueUsd / account.totalEquityUsd) * 100 : 0;
    const nonStableSharePct = account.totalEquityUsd > 0 ? (nonStableValueUsd / account.totalEquityUsd) * 100 : 0;

    const largestHolding = account.balances[0];
    const largestHoldingSharePct =
      largestHolding && account.totalEquityUsd > 0 ? (largestHolding.usdValue / account.totalEquityUsd) * 100 : 0;

    const capitalEfficiency =
      summary.performance.capitalEfficiencyStatus === "supported" &&
      typeof summary.performance.capitalEfficiencyPct === "number"
        ? fmtPct(summary.performance.capitalEfficiencyPct)
        : "unsupported";
    const roi =
      summary.performance.roiStatus === "supported" && typeof summary.performance.roiPct === "number"
        ? fmtPct(summary.performance.roiPct)
        : "unsupported";

    const positionsRows = summary.positions.largestPositions.map((position) => [
      position.symbol,
      position.side,
      fmtUsd(position.notionalUsd),
      fmtUsd(position.unrealizedPnlUsd),
      `${position.leverage.toFixed(2)}x`,
      position.priceSource
    ]);

    const holdingsRows = account.balances.slice(0, 10).map((balance) => [
      balance.asset,
      fmtUsd(balance.usdValue),
      fmtPct(account.totalEquityUsd > 0 ? (balance.usdValue / account.totalEquityUsd) * 100 : 0)
    ]);

    const symbolPnlRows = pnl.bySymbol.slice(0, 10).map((item) => [
      item.symbol,
      fmtUsd(item.realizedPnlUsd),
      fmtUsd(item.netPnlUsd),
      String(item.tradesCount ?? 0)
    ]);

    const botRows = (botReport?.bots ?? []).map((botItem) => [
      botItem.name,
      botItem.status,
      fmtUsd(botItem.allocatedCapitalUsd ?? 0),
      fmtUsd(botItem.exposureUsd ?? 0),
      fmtUsd(botItem.realizedPnlUsd ?? 0),
      fmtUsd(botItem.unrealizedPnlUsd ?? 0),
      typeof botItem.roiPct === "number" ? fmtPct(botItem.roiPct) : "N/A"
    ]);

    const alerts: MarkdownAlert[] = summary.risk.alerts.map((alert) => ({
      severity: alert.severity,
      message: alert.message
    }));
    if (unsupportedExposureRiskReason) {
      alerts.push({
        severity: "critical",
        message: unsupportedExposureRiskReason
      });
    }

    if (!botReport) {
      alerts.push({
        severity: "warning",
        message: bot.failureReason
          ? `Bot metrics unavailable: ${bot.failureReason}`
          : "Bot metrics unavailable due to optional enrichment failure."
      });
    }

    if (alerts.length === 0) {
      alerts.push({
        severity: "info",
        message: "No active alerts"
      });
    }

    const dataCompleteness = mergeDataCompleteness(account.dataCompleteness, pnl.dataCompleteness, bot.dataCompleteness);
    const dataCompletenessAlerts: MarkdownAlert[] =
      dataCompleteness.issues.length > 0
        ? dataCompleteness.issues.map((issue) => ({
            severity: issue.severity,
            message: `${issue.code} (${issue.scope}): ${issue.message}`
          }))
        : [{ severity: "info", message: "No data completeness warnings." }];

    const sections: ReportSection[] = [
      section("contract", {
        text: [
          `Schema version: ${SUMMARY_SCHEMA_VERSION}`,
          `Category: ${context.category}`,
          `Source mode: ${context.sourceMode}`,
          `Period: ${pnl.periodFrom} -> ${pnl.periodTo}`,
          `ROI status: ${summary.performance.roiStatus}`,
          ...(unsupportedExposureRiskReason
            ? [`Exposure/risk status: unsupported (${unsupportedExposureRiskReason})`]
            : []),
          ...(summary.performance.roiStatus === "unsupported"
            ? [
                `ROI unsupported code: ${summary.performance.roiUnsupportedReasonCode ?? "unknown"}`,
                `ROI unsupported reason: ${summary.performance.roiUnsupportedReason ?? "starting equity is unavailable"}`
              ]
            : []),
          "All summary section IDs, order, and section types are stable across categories."
        ]
      }),
      section("overview", {
        kpis: [
          { label: "Total Equity", value: fmtUsd(summary.balance.snapshot.totalEquityUsd) },
          { label: "Net PnL", value: fmtUsd(summary.pnl.netPnlUsd) },
          { label: "ROI", value: roi },
          {
            label: "Gross Exposure",
            value: unsupportedExposureRiskReason ? "unsupported" : fmtUsd(summary.exposure.grossExposureUsd)
          },
          { label: "Risk Alerts", value: unsupportedExposureRiskReason ? "unsupported" : String(summary.risk.alerts.length) },
          { label: "Tracked Bots", value: String(botReport?.bots.length ?? 0) }
        ]
      }),
      section("activity", {
        kpis: [
          { label: "Traded Symbols", value: String(tradedSymbols) },
          { label: "Total Trades", value: String(totalTrades) },
          { label: "Winning Symbols", value: String(winners) },
          { label: "Losing Symbols", value: String(losers) },
          { label: "Symbol Win Rate", value: fmtPct(winRate) }
        ]
      }),
      section("allocation", {
        kpis: [
          { label: "Stablecoin Value", value: fmtUsd(stableValueUsd) },
          { label: "Non-Stable Value", value: fmtUsd(nonStableValueUsd) },
          { label: "Stablecoin Share", value: fmtPct(stableSharePct) },
          { label: "Non-Stable Share", value: fmtPct(nonStableSharePct) },
          {
            label: "Largest Holding",
            value: largestHolding ? `${largestHolding.asset} (${fmtPct(largestHoldingSharePct)})` : "N/A"
          }
        ]
      }),
      section("exposure", {
        kpis: [
          { label: "Long", value: unsupportedExposureRiskReason ? "unsupported" : fmtUsd(summary.exposure.longExposureUsd) },
          { label: "Short", value: unsupportedExposureRiskReason ? "unsupported" : fmtUsd(summary.exposure.shortExposureUsd) },
          { label: "Net", value: unsupportedExposureRiskReason ? "unsupported" : fmtUsd(summary.exposure.netExposureUsd) },
          {
            label: "Concentration Band",
            value: unsupportedExposureRiskReason ? "unsupported" : summary.exposure.concentration.band
          }
        ]
      }),
      section("risk", {
        kpis: [
          {
            label: "Weighted Avg Leverage",
            value: unsupportedExposureRiskReason ? "unsupported" : `${summary.risk.leverageUsage.weightedAvgLeverage.toFixed(2)}x`
          },
          {
            label: "Max Leverage",
            value: unsupportedExposureRiskReason ? "unsupported" : `${summary.risk.leverageUsage.maxLeverageUsed.toFixed(2)}x`
          },
          {
            label: "Notional / Equity",
            value: unsupportedExposureRiskReason ? "unsupported" : fmtPct(summary.risk.leverageUsage.notionalToEquityPct)
          },
          {
            label: "Unrealized Loss / Equity",
            value: unsupportedExposureRiskReason ? "unsupported" : fmtPct(summary.risk.unrealizedLossRisk.unrealizedLossToEquityPct)
          },
          { label: "Capital Efficiency", value: unsupportedExposureRiskReason ? "unsupported" : capitalEfficiency }
        ]
      }),
      section("positions", {
        table: {
          headers: ["Symbol", "Side", "Notional", "UPnL", "Leverage", "Price Source"],
          rows: unsupportedExposureRiskReason ? [] : positionsRows
        }
      }),
      section("holdings", {
        table: {
          headers: ["Asset", "USD Value", "Share of Equity"],
          rows: holdingsRows
        }
      }),
      section("symbolPnl", {
        table: {
          headers: ["Symbol", "Realized", "Net", "Trades"],
          rows: symbolPnlRows
        }
      }),
      section("bots", {
        table: {
          headers: ["Bot", "Status", "Allocated", "Exposure", "Realized", "Unrealized", "ROI"],
          rows: botRows
        }
      }),
      section("alerts", {
        alerts
      }),
      section("dataCompleteness", {
        alerts: dataCompletenessAlerts
      })
    ];

    return {
      command: "summary",
      title: "Account Summary",
      generatedAt: summary.generatedAt,
      schemaVersion: SUMMARY_SCHEMA_VERSION,
      sections,
      dataCompleteness
    };
  }

  private async loadBotReport(context: ServiceRequestContext): Promise<BotLoadResult> {
    if (!this.botService) {
      if (context.sourceMode === "bot") {
        throw new Error("Selected exchange provider does not support bot analytics");
      }

      return {
        report: undefined,
        failureReason: "Selected exchange provider does not support bot analytics",
        dataCompleteness: degradedDataCompleteness([
          {
            code: "optional_item_failed",
            scope: "bots",
            severity: "warning",
            criticality: "optional",
            message: "Bot summary enrichment skipped: provider does not expose bot capability."
          }
        ])
      };
    }

    if (context.sourceMode === "bot") {
      const report = await this.botService.getBotReport(context, { requirement: "required" });
      return {
        report,
        dataCompleteness: report.dataCompleteness
      };
    }

    try {
      const report = await this.botService.getBotReport(context, { requirement: "optional" });
      return {
        report,
        dataCompleteness: report.dataCompleteness
      };
    } catch (error) {
      const failureReason = error instanceof Error ? error.message : String(error);
      return {
        report: undefined,
        failureReason,
        dataCompleteness: degradedDataCompleteness([
          {
            code: "optional_item_failed",
            scope: "bots",
            severity: "warning",
            criticality: "optional",
            message: `Bot summary enrichment failed: ${failureReason}`
          }
        ])
      };
    }
  }
}
