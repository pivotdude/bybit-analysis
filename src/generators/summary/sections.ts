import type { BotSummary, BotReport } from "../../types/domain.types";
import type { ReportSection } from "../../types/report.types";
import { fmtPct, fmtUsd } from "../formatters";
import { createSectionBuilder } from "../reportContract";
import { SUMMARY_SECTION_CONTRACT } from "./contract";
import { buildContractText } from "./contractText";
import {
  buildBotTableEmptyMessage,
  buildDataCompletenessAlertsForSummary,
  buildPositionsEmptyMessage,
  buildSummaryAlerts
} from "./policy";
import type { HoldingSnapshot, SummaryPnlReport, SummarySectionArgs } from "./types";

const section = createSectionBuilder(SUMMARY_SECTION_CONTRACT);

function sumBotMetric(bots: BotSummary[], selector: (bot: BotSummary) => number | undefined): number {
  return bots.reduce((sum, bot) => sum + (selector(bot) ?? 0), 0);
}

function resolveBotExposureUsd(bot: BotSummary): number {
  return bot.exposureUsd ?? bot.equityUsd ?? 0;
}

function resolveBotNetPnlUsd(bot: BotSummary): number {
  return (bot.realizedPnlUsd ?? 0) + (bot.unrealizedPnlUsd ?? 0);
}

function buildBotActivityKpis(bots: BotSummary[]) {
  const trackedSymbols = new Set(bots.map((bot) => bot.symbol).filter((value): value is string => Boolean(value))).size;
  const runningBots = bots.filter((bot) => bot.status === "running").length;
  const profitableBots = bots.filter((bot) => resolveBotNetPnlUsd(bot) > 0).length;
  const losingBots = bots.filter((bot) => resolveBotNetPnlUsd(bot) < 0).length;
  const activePositions = bots.reduce((sum, bot) => sum + (bot.activePositionCount ?? 0), 0);
  const botWinRate = bots.length > 0 ? (profitableBots / bots.length) * 100 : 0;

  return [
    { label: "Tracked Symbols", value: String(trackedSymbols) },
    { label: "Running Bots", value: String(runningBots) },
    { label: "Bots in Profit", value: String(profitableBots) },
    { label: "Bots in Loss", value: String(losingBots) },
    { label: "Open Positions", value: String(activePositions) },
    { label: "Bot Win Rate", value: fmtPct(botWinRate) }
  ];
}

function buildMarketActivityKpis(tradedSymbols: number, totalTrades: number, winners: number, losers: number, winRate: number) {
  return [
    { label: "Traded Symbols", value: String(tradedSymbols) },
    { label: "Total Trades", value: String(totalTrades) },
    { label: "Winning Symbols", value: String(winners) },
    { label: "Losing Symbols", value: String(losers) },
    { label: "Symbol Win Rate", value: fmtPct(winRate) }
  ];
}

function buildBotOverviewKpis(
  walletEquityUsd: number,
  bots: BotSummary[],
  botReport: BotReport | undefined,
  roiValue: string
) {
  const botAllocatedUsd = botReport?.totalAllocatedUsd ?? sumBotMetric(bots, (bot) => bot.allocatedCapitalUsd);
  const botExposureUsd = botReport?.totalBotExposureUsd ?? sumBotMetric(bots, resolveBotExposureUsd);
  const botRealizedPnlUsd = sumBotMetric(bots, (bot) => bot.realizedPnlUsd);
  const botUnrealizedPnlUsd = sumBotMetric(bots, (bot) => bot.unrealizedPnlUsd);
  const botNetPnlUsd = botReport?.totalBotPnlUsd ?? botRealizedPnlUsd + botUnrealizedPnlUsd;

  return [
    { label: "Wallet Equity", value: fmtUsd(walletEquityUsd) },
    { label: "Bot Allocated", value: fmtUsd(botAllocatedUsd) },
    { label: "Bot Exposure", value: fmtUsd(botExposureUsd) },
    { label: "Bot Net PnL", value: fmtUsd(botNetPnlUsd) },
    { label: "Tracked Bots", value: String(bots.length) },
    { label: "ROI", value: roiValue }
  ];
}

function buildMarketOverviewKpis(
  equityUsd: number,
  netPnlUsd: number,
  realizedPnlUsd: number,
  unrealizedPnlUsd: number,
  roiValue: string,
  trackedBots: number
) {
  return [
    { label: "Total Equity", value: fmtUsd(equityUsd) },
    { label: "Net PnL", value: fmtUsd(netPnlUsd) },
    { label: "Realized PnL", value: fmtUsd(realizedPnlUsd) },
    { label: "Unrealized PnL", value: fmtUsd(unrealizedPnlUsd) },
    { label: "ROI", value: roiValue },
    { label: "Tracked Bots", value: String(trackedBots) }
  ];
}

function buildBotRows(botReport: BotReport | undefined): string[][] {
  return (botReport?.bots ?? []).map((botItem) => [
    botItem.name,
    botItem.status,
    fmtUsd(botItem.allocatedCapitalUsd ?? 0),
    fmtUsd(resolveBotExposureUsd(botItem)),
    fmtUsd(botItem.realizedPnlUsd ?? 0),
    fmtUsd(botItem.unrealizedPnlUsd ?? 0),
    typeof botItem.roiPct === "number" ? fmtPct(botItem.roiPct) : "N/A"
  ]);
}

function buildSymbolPnlRows(pnl: SummaryPnlReport): string[][] {
  return pnl.bySymbol.slice(0, 10).map((item) => [
    item.symbol,
    fmtUsd(item.realizedPnlUsd),
    fmtUsd(item.unrealizedPnlUsd ?? 0),
    fmtUsd(item.netPnlUsd),
    String(item.tradesCount ?? 0)
  ]);
}

function buildPositionsRows(args: SummarySectionArgs): string[][] {
  return args.summary.positions.largestPositions.map((position) => [
    position.symbol,
    position.side,
    fmtUsd(position.notionalUsd),
    fmtUsd(position.unrealizedPnlUsd),
    `${position.leverage.toFixed(2)}x`,
    position.priceSource
  ]);
}

function buildHoldingsRows(holdings: HoldingSnapshot[], totalEquityUsd: number): string[][] {
  return holdings.slice(0, 10).map((balance) => [
    balance.asset,
    fmtUsd(balance.usdValue),
    fmtPct(totalEquityUsd > 0 ? (balance.usdValue / totalEquityUsd) * 100 : 0)
  ]);
}

function buildOverviewKpis(args: SummarySectionArgs) {
  if (args.context.sourceMode === "bot") {
    return buildBotOverviewKpis(
      args.summary.balance.snapshot.totalEquityUsd,
      args.botReport?.bots ?? [],
      args.botReport,
      args.roiValue
    );
  }

  return buildMarketOverviewKpis(
    args.summary.balance.snapshot.totalEquityUsd,
    args.summary.pnl.netPnlUsd,
    args.summary.pnl.realizedPnlUsd,
    args.summary.pnl.unrealizedPnlUsd,
    args.roiValue,
    args.botReport?.bots.length ?? 0
  );
}

function buildActivityKpis(args: SummarySectionArgs) {
  if (args.context.sourceMode === "bot") {
    return buildBotActivityKpis(args.botReport?.bots ?? []);
  }

  const tradedSymbols = args.pnl.bySymbol.length;
  const totalTrades = args.pnl.bySymbol.reduce((sum, item) => sum + (item.tradesCount ?? 0), 0);
  const winners = args.pnl.bySymbol.filter((item) => item.netPnlUsd > 0).length;
  const losers = args.pnl.bySymbol.filter((item) => item.netPnlUsd < 0).length;
  const winRate = tradedSymbols > 0 ? (winners / tradedSymbols) * 100 : 0;

  return buildMarketActivityKpis(tradedSymbols, totalTrades, winners, losers, winRate);
}

export function buildSectionList(args: SummarySectionArgs): ReportSection[] {
  const positionsRows = buildPositionsRows(args);
  const holdingsRows = buildHoldingsRows(args.holdings, args.summary.balance.snapshot.totalEquityUsd);
  const symbolPnlRows = buildSymbolPnlRows(args.pnl);
  const botRows = buildBotRows(args.botReport);
  const overviewKpis = buildOverviewKpis(args);
  const activityKpis = buildActivityKpis(args);
  const alerts = buildSummaryAlerts(
    args.summary,
    args.context,
    args.unsupportedExposureRiskReason,
    args.botReport,
    args.botFailureReason
  );
  const dataCompletenessAlerts = buildDataCompletenessAlertsForSummary(args.summaryDataCompleteness);

  return [
    section("contract", {
      text: buildContractText({
        context: args.context,
        pnl: args.pnl,
        accountCapturedAt: args.accountCapturedAt,
        roiNarrativeLines: args.roiNarrativeLines,
        summary: args.summary,
        unsupportedExposureRiskReason: args.unsupportedExposureRiskReason,
        botReport: args.botReport
      })
    }),
    section("overview", {
      kpis: overviewKpis
    }),
    section("activity", {
      kpis: activityKpis
    }),
    section("allocation", {
      kpis: [
        { label: "Stablecoin Value", value: fmtUsd(args.stableValueUsd) },
        { label: "Non-Stable Value", value: fmtUsd(args.nonStableValueUsd) },
        { label: "Stablecoin Share", value: fmtPct(args.stableSharePct) },
        { label: "Non-Stable Share", value: fmtPct(args.nonStableSharePct) },
        {
          label: "Largest Holding",
          value: args.largestHolding ? `${args.largestHolding.asset} (${fmtPct(args.largestHoldingSharePct)})` : "N/A"
        }
      ]
    }),
    section("exposure", {
      kpis: [
        { label: "Long", value: args.unsupportedExposureRiskReason ? "unsupported" : fmtUsd(args.summary.exposure.longExposureUsd) },
        { label: "Short", value: args.unsupportedExposureRiskReason ? "unsupported" : fmtUsd(args.summary.exposure.shortExposureUsd) },
        { label: "Net", value: args.unsupportedExposureRiskReason ? "unsupported" : fmtUsd(args.summary.exposure.netExposureUsd) },
        {
          label: "Concentration Band",
          value: args.unsupportedExposureRiskReason ? "unsupported" : args.summary.exposure.concentration.band
        }
      ]
    }),
    section("risk", {
      kpis: [
        {
          label: "Weighted Avg Leverage",
          value: args.unsupportedExposureRiskReason ? "unsupported" : `${args.summary.risk.leverageUsage.weightedAvgLeverage.toFixed(2)}x`
        },
        {
          label: "Max Leverage",
          value: args.unsupportedExposureRiskReason ? "unsupported" : `${args.summary.risk.leverageUsage.maxLeverageUsed.toFixed(2)}x`
        },
        {
          label: "Notional / Equity",
          value: args.unsupportedExposureRiskReason ? "unsupported" : fmtPct(args.summary.risk.leverageUsage.notionalToEquityPct)
        },
        {
          label: "Unrealized Loss / Equity",
          value: args.unsupportedExposureRiskReason ? "unsupported" : fmtPct(args.summary.risk.unrealizedLossRisk.unrealizedLossToEquityPct)
        },
        { label: "Capital Efficiency", value: args.unsupportedExposureRiskReason ? "unsupported" : args.capitalEfficiency }
      ]
    }),
    section("positions", {
      table: {
        headers: ["Symbol", "Side", "Notional", "UPnL", "Leverage", "Price Source"],
        rows: args.unsupportedExposureRiskReason ? [] : positionsRows,
        emptyMessage: buildPositionsEmptyMessage(args.unsupportedExposureRiskReason)
      }
    }),
    section("holdings", {
      table: {
        headers: ["Asset", "USD Value", "Share of Equity"],
        rows: holdingsRows,
        emptyMessage: "No token holdings"
      }
    }),
    section("symbolPnl", {
      table: {
        headers: ["Symbol", "Realized", "Unrealized", "Net", "Trades"],
        rows: symbolPnlRows,
        emptyMessage: "No symbol PnL in the selected period"
      }
    }),
    section("bots", {
      table: {
        headers: ["Bot", "Status", "Allocated", "Exposure", "Realized", "Unrealized", "ROI"],
        rows: botRows,
        emptyMessage: buildBotTableEmptyMessage(args.botReport, args.botFailureReason)
      }
    }),
    section("alerts", {
      alerts
    }),
    section("dataCompleteness", {
      alerts: dataCompletenessAlerts
    })
  ];
}
