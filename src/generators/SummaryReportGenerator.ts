import { SummaryAnalyzer } from "../analyzers/orchestrators/SummaryAnalyzer";
import type { AccountDataService, ServiceRequestContext } from "../services/contracts/AccountDataService";
import type { ExecutionDataService } from "../services/contracts/ExecutionDataService";
import type { BotDataService } from "../services/contracts/BotDataService";
import type { ReportDocument, ReportSection } from "../types/report.types";
import { fmtPct, fmtUsd } from "./formatters";

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

    if (context.category === "spot") {
      return this.generateSpotSummary(account, pnl);
    }

    if (context.category === "bot") {
      const botReport = await this.botService.getBotReport(context);
      return this.generateBotSummary(account, pnl, botReport);
    }

    let botReport: Awaited<ReturnType<BotDataService["getBotReport"]>> | undefined;
    try {
      botReport = await this.botService.getBotReport(context);
    } catch {
      botReport = undefined;
    }

    const summary = this.analyzer.analyze(account, pnl, botReport);
    const alertRows = summary.risk.alerts.map((alert) => [alert.severity, alert.message]);
    const sections: ReportSection[] = [
      {
        title: "Executive Summary",
        type: "kpi",
        kpis: [
          { label: "Total Equity", value: fmtUsd(summary.balance.snapshot.totalEquityUsd) },
          { label: "Net PnL", value: fmtUsd(summary.pnl.netPnlUsd) },
          { label: "Gross Exposure", value: fmtUsd(summary.exposure.grossExposureUsd) },
          { label: "ROI", value: fmtPct(summary.performance.roiPct) },
          { label: "Risk Alerts", value: String(summary.risk.alerts.length) }
        ]
      },
      {
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
        title: "Performance",
        type: "kpi",
        kpis: [
          { label: "Period Net PnL", value: fmtUsd(summary.performance.periodNetPnlUsd) },
          { label: "ROI", value: fmtPct(summary.performance.roiPct) },
          { label: "Capital Efficiency", value: fmtPct(summary.performance.capitalEfficiencyPct) },
          { label: "Interpretation", value: summary.performance.interpretation }
        ]
      },
      {
        title: "Risk",
        type: "kpi",
        kpis: [
          { label: "Weighted Avg Leverage", value: `${summary.risk.leverageUsage.weightedAvgLeverage.toFixed(2)}x` },
          { label: "Max Leverage", value: `${summary.risk.leverageUsage.maxLeverageUsed.toFixed(2)}x` },
          { label: "Notional / Equity", value: fmtPct(summary.risk.leverageUsage.notionalToEquityPct) },
          { label: "Unrealized Loss / Equity", value: fmtPct(summary.risk.unrealizedLossRisk.unrealizedLossToEquityPct) }
        ]
      },
      {
        title: "Open Positions",
        type: "table",
        table: {
          headers: ["Symbol", "Side", "Notional", "UPnL", "Leverage", "Price Source"],
          rows: summary.positions.largestPositions.map((position) => [
            position.symbol,
            position.side,
            fmtUsd(position.notionalUsd),
            fmtUsd(position.unrealizedPnlUsd),
            `${position.leverage.toFixed(2)}x`,
            position.priceSource
          ])
        }
      }
    ];

    this.pushDataCompletenessSection(sections, pnl);

    sections.push({
      title: "Alerts",
      type: alertRows.length > 0 ? "table" : "alerts",
      table:
        alertRows.length > 0
          ? {
              headers: ["Severity", "Message"],
              rows: alertRows
            }
          : undefined,
      alerts:
        alertRows.length === 0
          ? [{ severity: "info", message: "No active alerts" }]
          : undefined
    });

    return {
      command: "summary",
      title: "Account Summary",
      generatedAt: summary.generatedAt,
      sections
    };
  }

  private generateBotSummary(
    account: Awaited<ReturnType<AccountDataService["getAccountSnapshot"]>>,
    pnl: Awaited<ReturnType<ExecutionDataService["getPnlReport"]>>,
    botReport: Awaited<ReturnType<BotDataService["getBotReport"]>>
  ): ReportDocument {
    const botRows = botReport.bots.map((bot) => [
      bot.name,
      bot.status,
      fmtUsd(bot.allocatedCapitalUsd ?? 0),
      fmtUsd(bot.exposureUsd ?? 0),
      fmtUsd(bot.realizedPnlUsd ?? 0),
      fmtUsd(bot.unrealizedPnlUsd ?? 0),
      typeof bot.roiPct === "number" ? fmtPct(bot.roiPct) : "N/A"
    ]);

    const sections: ReportSection[] = [
      {
        title: "Bot KPI",
        type: "kpi",
        kpis: [
          { label: "Availability", value: botReport.availability },
          { label: "Bots", value: String(botReport.bots.length) },
          { label: "Total Equity", value: fmtUsd(account.totalEquityUsd) },
          { label: "Allocated Capital", value: fmtUsd(botReport.totalAllocatedUsd ?? 0) },
          { label: "Net PnL", value: fmtUsd(pnl.netPnlUsd) }
        ]
      },
      {
        title: "Bot Breakdown",
        type: "table",
        table: {
          headers: ["Bot", "Status", "Allocated", "Exposure", "Realized", "Unrealized", "ROI"],
          rows: botRows
        }
      },
      {
        title: "Notes",
        type: "text",
        text: [
          botReport.availabilityReason ?? "Metrics are aggregated from grid bot detail endpoints.",
          "Use --fgrid-bot-ids and/or --spot-grid-ids to select tracked bots."
        ]
      }
    ];

    this.pushDataCompletenessSection(sections, pnl);

    return {
      command: "summary",
      title: "Bot Portfolio Summary",
      generatedAt: new Date().toISOString(),
      sections
    };
  }

  private generateSpotSummary(
    account: Awaited<ReturnType<AccountDataService["getAccountSnapshot"]>>,
    pnl: Awaited<ReturnType<ExecutionDataService["getPnlReport"]>>
  ): ReportDocument {
    const tradedSymbols = pnl.bySymbol.length;
    const totalTrades = pnl.bySymbol.reduce((sum, item) => sum + (item.tradesCount ?? 0), 0);
    const winners = pnl.bySymbol.filter((item) => item.netPnlUsd > 0).length;
    const losers = pnl.bySymbol.filter((item) => item.netPnlUsd < 0).length;
    const winRate = tradedSymbols > 0 ? (winners / tradedSymbols) * 100 : 0;
    const stableAssets = new Set(["USDT", "USDC", "USD", "USDE", "FDUSD", "DAI", "TUSD", "USDD"]);
    const stableValueUsd = account.balances
      .filter((balance) => stableAssets.has(balance.asset.toUpperCase()))
      .reduce((sum, balance) => sum + balance.usdValue, 0);
    const nonStableValueUsd = Math.max(0, account.totalEquityUsd - stableValueUsd);
    const stableSharePct = account.totalEquityUsd > 0 ? (stableValueUsd / account.totalEquityUsd) * 100 : 0;
    const nonStableSharePct = account.totalEquityUsd > 0 ? (nonStableValueUsd / account.totalEquityUsd) * 100 : 0;
    const largestHolding = account.balances[0];
    const largestHoldingSharePct =
      largestHolding && account.totalEquityUsd > 0 ? (largestHolding.usdValue / account.totalEquityUsd) * 100 : 0;
    const holdingsRows = account.balances.slice(0, 10).map((balance) => [
      balance.asset,
      fmtUsd(balance.usdValue),
      fmtPct(account.totalEquityUsd > 0 ? (balance.usdValue / account.totalEquityUsd) * 100 : 0)
    ]);
    const pnlRows = pnl.bySymbol.slice(0, 10).map((item) => [
      item.symbol,
      fmtUsd(item.realizedPnlUsd),
      fmtUsd(item.netPnlUsd),
      String(item.tradesCount ?? 0)
    ]);

    const sections: ReportSection[] = [
      {
        title: "Executive Summary (Spot)",
        type: "kpi",
        kpis: [
          { label: "Total Equity", value: fmtUsd(account.totalEquityUsd) },
          { label: "Period Net PnL", value: fmtUsd(pnl.netPnlUsd) },
          { label: "Realized PnL", value: fmtUsd(pnl.realizedPnlUsd) },
          {
            label: "Trading Fees",
            value: fmtUsd(pnl.fees.tradingFeesUsd + pnl.fees.fundingFeesUsd + (pnl.fees.otherFeesUsd ?? 0))
          },
          { label: "Traded Symbols", value: String(tradedSymbols) }
        ]
      },
      {
        title: "Spot Activity",
        type: "kpi",
        kpis: [
          { label: "Total Trades", value: String(totalTrades) },
          { label: "Winning Symbols", value: String(winners) },
          { label: "Losing Symbols", value: String(losers) },
          { label: "Symbol Win Rate", value: fmtPct(winRate) }
        ]
      },
      {
        title: "Portfolio Allocation",
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
        title: "Top Holdings",
        type: "table",
        table: {
          headers: ["Asset", "USD Value", "Share of Equity"],
          rows: holdingsRows
        }
      },
      {
        title: "Symbol PnL",
        type: "table",
        table: {
          headers: ["Symbol", "Realized", "Net", "Trades"],
          rows: pnlRows
        }
      }
    ];

    if (tradedSymbols === 0) {
      sections.push({
        title: "Alerts",
        type: "alerts",
        alerts: [{ severity: "info", message: "No spot executions found in selected period." }]
      });
    } else {
      sections.push({
        title: "Alerts",
        type: "alerts",
        alerts: [{ severity: "info", message: "Spot summary excludes derivatives exposure and leverage risk metrics." }]
      });
    }

    this.pushDataCompletenessSection(sections, pnl);

    return {
      command: "summary",
      title: "Account Summary",
      generatedAt: new Date().toISOString(),
      sections
    };
  }

  private pushDataCompletenessSection(
    sections: ReportSection[],
    pnl: Awaited<ReturnType<ExecutionDataService["getPnlReport"]>>
  ): void {
    if (!pnl.dataCompleteness.partial) {
      return;
    }

    sections.push({
      title: "Data Completeness",
      type: "alerts",
      alerts: pnl.dataCompleteness.warnings.map((message) => ({ severity: "warning", message }))
    });
  }
}
