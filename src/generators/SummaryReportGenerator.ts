import { SummaryAnalyzer } from "../analyzers/orchestrators/SummaryAnalyzer";
import type { AccountDataService, ServiceRequestContext } from "../services/contracts/AccountDataService";
import type { ExecutionDataService } from "../services/contracts/ExecutionDataService";
import type { BotDataService } from "../services/contracts/BotDataService";
import type { ReportDocument, ReportSection } from "../types/report.types";
import type { BotReport, DataCompleteness } from "../types/domain.types";
import { fmtPct, fmtUsd } from "./formatters";
import {
  degradedDataCompleteness,
  mergeDataCompleteness
} from "../services/reliability/dataCompleteness";

export const SUMMARY_SCHEMA_VERSION = "summary-markdown-v1";

const SUMMARY_SECTION_IDS = {
  contract: "summary.contract",
  overview: "summary.overview",
  activity: "summary.activity",
  allocation: "summary.allocation",
  exposure: "summary.exposure",
  risk: "summary.risk",
  positions: "summary.open_positions",
  holdings: "summary.top_holdings",
  symbolPnl: "summary.symbol_pnl",
  bots: "summary.bots",
  alerts: "summary.alerts",
  dataCompleteness: "summary.data_completeness"
} as const;

const STABLE_ASSETS = new Set(["USDT", "USDC", "USD", "USDE", "FDUSD", "DAI", "TUSD", "USDD"]);

interface BotLoadResult {
  report?: BotReport;
  dataCompleteness: DataCompleteness;
}

export class SummaryReportGenerator {
  private readonly analyzer = new SummaryAnalyzer();

  constructor(
    private readonly accountService: AccountDataService,
    private readonly executionService: ExecutionDataService,
    private readonly botService: BotDataService
  ) {}

  async generate(context: ServiceRequestContext): Promise<ReportDocument> {
    const account = await this.accountService.getAccountSnapshot(context);
    const pnl = await this.executionService.getPnlReport(context, undefined, account.totalEquityUsd);
    const bot = await this.loadBotReport(context);
    const botReport = bot.report;
    const summary = this.analyzer.analyze(account, pnl, botReport);

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

    const alerts = summary.risk.alerts.map((alert) => ({
      severity: alert.severity,
      message: alert.message
    }));

    if (context.category === "spot") {
      alerts.push({
        severity: "info",
        message: "Spot category usually has no derivatives positions, so exposure/risk metrics can be zero."
      });
    }

    if (!botReport) {
      alerts.push({
        severity: "warning",
        message: "Bot metrics unavailable due to optional enrichment failure."
      });
    }

    if (alerts.length === 0) {
      alerts.push({
        severity: "info",
        message: "No active alerts"
      });
    }

    const dataCompleteness = mergeDataCompleteness(account.dataCompleteness, pnl.dataCompleteness, bot.dataCompleteness);
    const dataCompletenessAlerts =
      dataCompleteness.issues.length > 0
        ? dataCompleteness.issues.map((issue) => ({
            severity: issue.severity,
            message: `${issue.code} (${issue.scope}): ${issue.message}`
          }))
        : [{ severity: "info", message: "No data completeness warnings." }];

    const sections: ReportSection[] = [
      {
        id: SUMMARY_SECTION_IDS.contract,
        title: "Summary Contract",
        type: "text",
        text: [
          `Schema version: ${SUMMARY_SCHEMA_VERSION}`,
          `Category: ${context.category}`,
          `Period: ${pnl.periodFrom} -> ${pnl.periodTo}`,
          "All summary section IDs, order, and section types are stable across categories."
        ]
      },
      {
        id: SUMMARY_SECTION_IDS.overview,
        title: "Overview",
        type: "kpi",
        kpis: [
          { label: "Total Equity", value: fmtUsd(summary.balance.snapshot.totalEquityUsd) },
          { label: "Net PnL", value: fmtUsd(summary.pnl.netPnlUsd) },
          { label: "ROI", value: fmtPct(summary.performance.roiPct) },
          { label: "Gross Exposure", value: fmtUsd(summary.exposure.grossExposureUsd) },
          { label: "Risk Alerts", value: String(summary.risk.alerts.length) },
          { label: "Tracked Bots", value: String(botReport?.bots.length ?? 0) }
        ]
      },
      {
        id: SUMMARY_SECTION_IDS.activity,
        title: "Activity",
        type: "kpi",
        kpis: [
          { label: "Traded Symbols", value: String(tradedSymbols) },
          { label: "Total Trades", value: String(totalTrades) },
          { label: "Winning Symbols", value: String(winners) },
          { label: "Losing Symbols", value: String(losers) },
          { label: "Symbol Win Rate", value: fmtPct(winRate) }
        ]
      },
      {
        id: SUMMARY_SECTION_IDS.allocation,
        title: "Allocation",
        type: "kpi",
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
      },
      {
        id: SUMMARY_SECTION_IDS.exposure,
        title: "Exposure",
        type: "kpi",
        kpis: [
          { label: "Long", value: fmtUsd(summary.exposure.longExposureUsd) },
          { label: "Short", value: fmtUsd(summary.exposure.shortExposureUsd) },
          { label: "Net", value: fmtUsd(summary.exposure.netExposureUsd) },
          { label: "Concentration Band", value: summary.exposure.concentration.band }
        ]
      },
      {
        id: SUMMARY_SECTION_IDS.risk,
        title: "Risk",
        type: "kpi",
        kpis: [
          { label: "Weighted Avg Leverage", value: `${summary.risk.leverageUsage.weightedAvgLeverage.toFixed(2)}x` },
          { label: "Max Leverage", value: `${summary.risk.leverageUsage.maxLeverageUsed.toFixed(2)}x` },
          { label: "Notional / Equity", value: fmtPct(summary.risk.leverageUsage.notionalToEquityPct) },
          { label: "Unrealized Loss / Equity", value: fmtPct(summary.risk.unrealizedLossRisk.unrealizedLossToEquityPct) },
          { label: "Capital Efficiency", value: capitalEfficiency }
        ]
      },
      {
        id: SUMMARY_SECTION_IDS.positions,
        title: "Open Positions",
        type: "table",
        table: {
          headers: ["Symbol", "Side", "Notional", "UPnL", "Leverage", "Price Source"],
          rows: positionsRows
        }
      },
      {
        id: SUMMARY_SECTION_IDS.holdings,
        title: "Top Holdings",
        type: "table",
        table: {
          headers: ["Asset", "USD Value", "Share of Equity"],
          rows: holdingsRows
        }
      },
      {
        id: SUMMARY_SECTION_IDS.symbolPnl,
        title: "Symbol PnL",
        type: "table",
        table: {
          headers: ["Symbol", "Realized", "Net", "Trades"],
          rows: symbolPnlRows
        }
      },
      {
        id: SUMMARY_SECTION_IDS.bots,
        title: "Bots",
        type: "table",
        table: {
          headers: ["Bot", "Status", "Allocated", "Exposure", "Realized", "Unrealized", "ROI"],
          rows: botRows
        }
      },
      {
        id: SUMMARY_SECTION_IDS.alerts,
        title: "Alerts",
        type: "alerts",
        alerts
      },
      {
        id: SUMMARY_SECTION_IDS.dataCompleteness,
        title: "Data Completeness",
        type: "alerts",
        alerts: dataCompletenessAlerts
      }
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
    if (context.category === "bot") {
      const report = await this.botService.getBotReport(context);
      return {
        report,
        dataCompleteness: report.dataCompleteness
      };
    }

    try {
      const report = await this.botService.getBotReport(context);
      return {
        report,
        dataCompleteness: report.dataCompleteness
      };
    } catch (error) {
      return {
        report: undefined,
        dataCompleteness: degradedDataCompleteness([
          {
            code: "optional_item_failed",
            scope: "bots",
            severity: "warning",
            criticality: "optional",
            message: `Bot summary enrichment failed: ${error instanceof Error ? error.message : String(error)}`
          }
        ])
      };
    }
  }
}
