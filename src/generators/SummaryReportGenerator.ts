import { SummaryAnalyzer, type SummaryAnalysis } from "../analyzers/orchestrators/SummaryAnalyzer";
import type { AccountDataService, ServiceRequestContext } from "../services/contracts/AccountDataService";
import type { ExecutionDataService } from "../services/contracts/ExecutionDataService";
import type { BotDataService } from "../services/contracts/BotDataService";
import type { PositionDataService } from "../services/contracts/PositionDataService";
import { composeAccountSnapshot } from "../services/contracts/accountSnapshot";
import type { MarkdownAlert, ReportDocument, ReportSection, ReportSectionType } from "../types/report.types";
import type { BotReport, BotSummary, DataCompleteness } from "../types/domain.types";
import { fmtPct, fmtUsd } from "./formatters";
import {
  degradedDataCompleteness,
  filterDataCompletenessIssues,
  getUnsupportedFeatureIssueMessage,
  isSpotPositionsUnsupportedIssue,
  mergeDataCompleteness
} from "../services/reliability/dataCompleteness";
import { resolveStartingEquity } from "../services/roi/startingEquityResolver";
import { buildDataCompletenessAlerts, createSectionBuilder } from "./reportContract";
import { resolveRoiContract } from "./roiContractResolver";
import { createSourceMetadata } from "./sourceMetadata";

export const SUMMARY_SCHEMA_VERSION = "summary-markdown-v1";

export const SUMMARY_SECTION_CONTRACT = {
  contract: { id: "summary.contract", title: "Summary Context", type: "text" },
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

const section = createSectionBuilder(SUMMARY_SECTION_CONTRACT);

const STABLE_ASSETS = new Set(["USDT", "USDC", "USD", "USDE", "FDUSD", "DAI", "TUSD", "USDD"]);

interface BotLoadResult {
  report?: BotReport;
  dataCompleteness: DataCompleteness;
  failureReason?: string;
}

interface HoldingSnapshot {
  asset: string;
  usdValue: number;
}

function sumBotMetric(bots: BotSummary[], selector: (bot: BotSummary) => number | undefined): number {
  return bots.reduce((sum, bot) => sum + (selector(bot) ?? 0), 0);
}

function resolveBotExposureUsd(bot: BotSummary): number {
  return bot.exposureUsd ?? bot.equityUsd ?? 0;
}

function resolveBotNetPnlUsd(bot: BotSummary): number {
  return (bot.realizedPnlUsd ?? 0) + (bot.unrealizedPnlUsd ?? 0);
}

function isCategoryIntrinsicSpotPositionsIssue(context: ServiceRequestContext, issue: DataCompleteness["issues"][number]): boolean {
  return context.category === "spot" && isSpotPositionsUnsupportedIssue(issue);
}

function buildSpotLimitationMessage(reason: string): string {
  return `Spot limitation: ${reason}`;
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

function buildSummaryAlertMessage(reason: string, category: ServiceRequestContext["category"]): MarkdownAlert {
  if (category === "spot") {
    return {
      severity: "warning",
      message: buildSpotLimitationMessage(reason)
    };
  }

  return {
    severity: "critical",
    message: reason
  };
}

function buildContractContextLines(
  context: ServiceRequestContext,
  accountCapturedAt: string,
  unsupportedExposureRiskReason: string | undefined,
  botReport: BotReport | undefined
): string[] {
  return [
    `Context: ${context.category} / ${context.sourceMode}`,
    `Live snapshot as of: ${accountCapturedAt}`,
    `Coverage: ${buildContractPeriodMetricsLine(context.sourceMode)}`,
    ...(context.sourceMode === "bot" && botReport
      ? ["Note: wallet equity may exclude capital currently managed inside bot allocations."]
      : []),
    ...(unsupportedExposureRiskReason && context.category === "spot"
      ? [buildSpotLimitationMessage(unsupportedExposureRiskReason)]
      : unsupportedExposureRiskReason
        ? [`Exposure/risk status: unsupported (${unsupportedExposureRiskReason})`]
        : [])
  ];
}

function buildEndStateLine(summary: SummaryAnalysis): string {
  return summary.pnl.endStateStatus === "supported"
    ? "Period end-state: supported"
    : `Period end-state: unsupported${summary.pnl.endStateUnsupportedReason ? ` — ${summary.pnl.endStateUnsupportedReason}` : ""}`;
}

function buildRoiContractLines(roiNarrativeLines: string[]): string[] {
  const statusLine = roiNarrativeLines.find((line) => line.startsWith("ROI status:"));
  const reasonLine = roiNarrativeLines.find((line) => line.startsWith("ROI unsupported reason:"));

  return [
    statusLine ?? "ROI status: unknown",
    ...(reasonLine ? [reasonLine] : [])
  ];
}

function buildContractSummaryLine(context: ServiceRequestContext): string {
  return context.sourceMode === "bot"
    ? "This summary emphasizes bot capital, bot PnL, and wallet context."
    : "This summary emphasizes account equity, trading activity, and period PnL.";
}

function buildPeriodLine(pnl: Awaited<ReturnType<ExecutionDataService["getPnlReport"]>>): string {
  return `Period: ${pnl.periodFrom} -> ${pnl.periodTo}`;
}

function buildMetricCoverageLine(context: ServiceRequestContext): string {
  return context.sourceMode === "bot"
    ? "Live metrics: wallet balances, holdings, bot exposure, and bot status."
    : "Live metrics: balances, holdings, exposure, risk, and open positions.";
}

function buildCoverageNarrative(sourceMode: ServiceRequestContext["sourceMode"]): string {
  return sourceMode === "bot"
    ? "bot performance and account PnL over the requested window"
    : "trading activity and account PnL over the requested window";
}

function buildContractPeriodMetricsLine(sourceMode: ServiceRequestContext["sourceMode"]): string {
  return buildCoverageNarrative(sourceMode);
}

function buildContractIntro(context: ServiceRequestContext): string {
  return context.sourceMode === "bot" ? "Summary scope: bot-oriented account review." : "Summary scope: market activity account review.";
}

function buildContractTextBody(
  context: ServiceRequestContext,
  pnl: Awaited<ReturnType<ExecutionDataService["getPnlReport"]>>,
  accountCapturedAt: string,
  unsupportedExposureRiskReason: string | undefined,
  botReport: BotReport | undefined,
  summary: SummaryAnalysis,
  roiNarrativeLines: string[]
): string[] {
  return [
    buildContractIntro(context),
    ...buildContractContextLines(context, accountCapturedAt, unsupportedExposureRiskReason, botReport),
    buildMetricCoverageLine(context),
    buildPeriodLine(pnl),
    buildEndStateLine(summary),
    ...buildRoiContractLines(roiNarrativeLines),
    buildContractSummaryLine(context)
  ];
}

function buildContractText(
  context: ServiceRequestContext,
  pnl: Awaited<ReturnType<ExecutionDataService["getPnlReport"]>>,
  accountCapturedAt: string,
  roiNarrativeLines: string[],
  summary: SummaryAnalysis,
  unsupportedExposureRiskReason: string | undefined,
  botReport: BotReport | undefined
): string[] {
  return buildContractTextBody(
    context,
    pnl,
    accountCapturedAt,
    unsupportedExposureRiskReason,
    botReport,
    summary,
    roiNarrativeLines
  );
}

function buildEmptyStateMessage(message: string): string {
  return message;
}

function buildBotTableEmptyMessage(botReport: BotReport | undefined, failureReason?: string): string {
  if (!botReport) {
    return buildEmptyStateMessage(
      failureReason ? `Bot metrics unavailable: ${failureReason}` : "Bot metrics unavailable"
    );
  }

  return buildEmptyStateMessage("No tracked bots");
}

function buildPositionsEmptyMessage(unsupportedExposureRiskReason: string | undefined): string {
  if (unsupportedExposureRiskReason) {
    return buildEmptyStateMessage(buildSpotLimitationMessage(unsupportedExposureRiskReason));
  }

  return buildEmptyStateMessage("No open positions");
}

function buildDataCompletenessForSummary(context: ServiceRequestContext, dataCompleteness: DataCompleteness): DataCompleteness {
  return filterDataCompletenessIssues(dataCompleteness, (issue) => !isCategoryIntrinsicSpotPositionsIssue(context, issue));
}

function buildDataCompletenessAlertsForSummary(
  context: ServiceRequestContext,
  dataCompleteness: DataCompleteness,
  unsupportedExposureRiskReason: string | undefined
): MarkdownAlert[] {
  const alerts = buildDataCompletenessAlerts(dataCompleteness);

  if (context.category !== "spot" || !unsupportedExposureRiskReason) {
    return alerts;
  }

  return [
    ...alerts,
    {
      severity: "info",
      message: buildSpotLimitationMessage(unsupportedExposureRiskReason)
    }
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

function buildSymbolPnlRows(pnl: Awaited<ReturnType<ExecutionDataService["getPnlReport"]>>): string[][] {
  return pnl.bySymbol.slice(0, 10).map((item) => [
    item.symbol,
    fmtUsd(item.realizedPnlUsd),
    fmtUsd(item.unrealizedPnlUsd ?? 0),
    fmtUsd(item.netPnlUsd),
    String(item.tradesCount ?? 0)
  ]);
}

function buildPositionsRows(summary: SummaryAnalysis): string[][] {
  return summary.positions.largestPositions.map((position) => [
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

function buildAlerts(
  summary: SummaryAnalysis,
  context: ServiceRequestContext,
  unsupportedExposureRiskReason: string | undefined,
  botReport: BotReport | undefined,
  botFailureReason?: string
): MarkdownAlert[] {
  const alerts: MarkdownAlert[] = summary.risk.alerts.map((alert) => ({
    severity: alert.severity,
    message: alert.message
  }));

  if (unsupportedExposureRiskReason) {
    alerts.push(buildSummaryAlertMessage(unsupportedExposureRiskReason, context.category));
  }

  if (!botReport) {
    alerts.push({
      severity: "warning",
      message: botFailureReason
        ? `Bot metrics unavailable: ${botFailureReason}`
        : "Bot metrics unavailable due to optional enrichment failure."
    });
  }

  if (alerts.length === 0) {
    alerts.push({
      severity: "info",
      message: "No active alerts"
    });
  }

  return alerts;
}

function buildOverviewKpis(
  context: ServiceRequestContext,
  summary: SummaryAnalysis,
  roiValue: string,
  botReport: BotReport | undefined
) {
  if (context.sourceMode === "bot") {
    return buildBotOverviewKpis(
      summary.balance.snapshot.totalEquityUsd,
      botReport?.bots ?? [],
      botReport,
      roiValue
    );
  }

  return buildMarketOverviewKpis(
    summary.balance.snapshot.totalEquityUsd,
    summary.pnl.netPnlUsd,
    summary.pnl.realizedPnlUsd,
    summary.pnl.unrealizedPnlUsd,
    roiValue,
    botReport?.bots.length ?? 0
  );
}

function buildActivityKpis(context: ServiceRequestContext, pnl: Awaited<ReturnType<ExecutionDataService["getPnlReport"]>>, botReport: BotReport | undefined) {
  if (context.sourceMode === "bot") {
    return buildBotActivityKpis(botReport?.bots ?? []);
  }

  const tradedSymbols = pnl.bySymbol.length;
  const totalTrades = pnl.bySymbol.reduce((sum, item) => sum + (item.tradesCount ?? 0), 0);
  const winners = pnl.bySymbol.filter((item) => item.netPnlUsd > 0).length;
  const losers = pnl.bySymbol.filter((item) => item.netPnlUsd < 0).length;
  const winRate = tradedSymbols > 0 ? (winners / tradedSymbols) * 100 : 0;

  return buildMarketActivityKpis(tradedSymbols, totalTrades, winners, losers, winRate);
}

function buildSummaryData(
  summary: SummaryAnalysis,
  unsupportedExposureRiskReason: string | undefined,
  holdings: HoldingSnapshot[],
  botReport: BotReport | undefined
) {
  return {
    balance: summary.balance,
    pnl: summary.pnl,
    performance: summary.performance,
    exposure: unsupportedExposureRiskReason ? { unsupportedReason: unsupportedExposureRiskReason } : summary.exposure,
    risk: unsupportedExposureRiskReason ? { unsupportedReason: unsupportedExposureRiskReason } : summary.risk,
    holdings,
    bots: botReport?.bots ?? []
  };
}

function buildSectionList(args: {
  context: ServiceRequestContext;
  summary: SummaryAnalysis;
  pnl: Awaited<ReturnType<ExecutionDataService["getPnlReport"]>>;
  accountCapturedAt: string;
  holdings: HoldingSnapshot[];
  stableValueUsd: number;
  nonStableValueUsd: number;
  stableSharePct: number;
  nonStableSharePct: number;
  largestHolding?: HoldingSnapshot;
  largestHoldingSharePct: number;
  capitalEfficiency: string;
  unsupportedExposureRiskReason: string | undefined;
  botReport: BotReport | undefined;
  botFailureReason?: string;
  summaryDataCompleteness: DataCompleteness;
  roiValue: string;
  roiNarrativeLines: string[];
}): ReportSection[] {
  const positionsRows = buildPositionsRows(args.summary);
  const holdingsRows = buildHoldingsRows(args.holdings, args.summary.balance.snapshot.totalEquityUsd);
  const symbolPnlRows = buildSymbolPnlRows(args.pnl);
  const botRows = buildBotRows(args.botReport);
  const overviewKpis = buildOverviewKpis(args.context, args.summary, args.roiValue, args.botReport);
  const activityKpis = buildActivityKpis(args.context, args.pnl, args.botReport);
  const alerts = buildAlerts(args.summary, args.context, args.unsupportedExposureRiskReason, args.botReport, args.botFailureReason);
  const dataCompletenessAlerts = buildDataCompletenessAlertsForSummary(
    args.context,
    args.summaryDataCompleteness,
    args.unsupportedExposureRiskReason
  );

  return [
    section("contract", {
      text: buildContractText(
        args.context,
        args.pnl,
        args.accountCapturedAt,
        args.roiNarrativeLines,
        args.summary,
        args.unsupportedExposureRiskReason,
        args.botReport
      )
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
        emptyMessage: buildEmptyStateMessage("No token holdings")
      }
    }),
    section("symbolPnl", {
      table: {
        headers: ["Symbol", "Realized", "Unrealized", "Net", "Trades"],
        rows: symbolPnlRows,
        emptyMessage: buildEmptyStateMessage("No symbol PnL in the selected period")
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

function buildSources(
  account: Awaited<ReturnType<AccountDataService["getWalletSnapshot"]>> & { exchange: string; category: ServiceRequestContext["category"]; source: string; capturedAt: string; cacheStatus?: string },
  positionsResult: Awaited<ReturnType<PositionDataService["getOpenPositions"]>>,
  pnl: Awaited<ReturnType<ExecutionDataService["getPnlReport"]>>,
  context: ServiceRequestContext,
  botReport: BotReport | undefined
) {
  return [
    createSourceMetadata({
      id: "wallet_snapshot",
      kind: "wallet_snapshot",
      provider: account.source,
      exchange: account.exchange,
      category: account.category,
      sourceMode: context.sourceMode,
      fetchedAt: account.capturedAt,
      capturedAt: account.capturedAt,
      cacheStatus: account.cacheStatus
    }),
    createSourceMetadata({
      id: "positions_snapshot",
      kind: "positions_snapshot",
      provider: positionsResult.source,
      exchange: positionsResult.exchange,
      category: context.category,
      sourceMode: context.sourceMode,
      fetchedAt: positionsResult.capturedAt,
      capturedAt: positionsResult.capturedAt,
      cacheStatus: positionsResult.cacheStatus
    }),
    createSourceMetadata({
      id: "period_pnl",
      kind: "period_pnl_snapshot",
      provider: pnl.source,
      category: context.category,
      sourceMode: context.sourceMode,
      fetchedAt: pnl.generatedAt,
      periodFrom: pnl.periodFrom,
      periodTo: pnl.periodTo,
      cacheStatus: pnl.cacheStatus
    }),
    ...(botReport
      ? [
          createSourceMetadata({
            id: "bot_report",
            kind: "bot_report",
            provider: botReport.source,
            category: context.category,
            sourceMode: context.sourceMode,
            fetchedAt: botReport.generatedAt,
            periodFrom: context.from,
            periodTo: context.to,
            cacheStatus: botReport.cacheStatus
          })
        ]
      : [])
  ];
}

export class SummaryReportGenerator {
  private readonly analyzer = new SummaryAnalyzer();

  constructor(
    private readonly accountService: AccountDataService,
    private readonly executionService: ExecutionDataService,
    private readonly positionService: PositionDataService,
    private readonly botService?: BotDataService
  ) {}

  async generate(context: ServiceRequestContext): Promise<ReportDocument> {
    const walletSnapshot = await this.accountService.getWalletSnapshot(context);
    const positionsResult = await this.positionService.getOpenPositions(context);
    const account = composeAccountSnapshot(walletSnapshot, positionsResult);
    const generatedAt = new Date().toISOString();
    const startingEquity = resolveStartingEquity(walletSnapshot, context.from);
    const pnl = await this.executionService.getPnlReport({
      context,
      equityStartUsd: startingEquity.equityStartUsd,
      roiMissingStartReason: startingEquity.missingStartReason,
      roiMissingStartReasonCode: startingEquity.missingStartReasonCode
    });
    const bot = await this.loadBotReport(context);
    const botReport = bot.report;
    const summary = this.analyzer.analyze(account, pnl, botReport);
    const unsupportedExposureRiskReason = getUnsupportedFeatureIssueMessage(account.dataCompleteness, "positions");
    const holdings: HoldingSnapshot[] = account.balances.map((balance) => ({ asset: balance.asset, usdValue: balance.usdValue }));

    const stableValueUsd = holdings
      .filter((balance) => STABLE_ASSETS.has(balance.asset.toUpperCase()))
      .reduce((sum, balance) => sum + balance.usdValue, 0);
    const nonStableValueUsd = Math.max(0, account.totalEquityUsd - stableValueUsd);
    const stableSharePct = account.totalEquityUsd > 0 ? (stableValueUsd / account.totalEquityUsd) * 100 : 0;
    const nonStableSharePct = account.totalEquityUsd > 0 ? (nonStableValueUsd / account.totalEquityUsd) * 100 : 0;

    const largestHolding = holdings[0];
    const largestHoldingSharePct =
      largestHolding && account.totalEquityUsd > 0 ? (largestHolding.usdValue / account.totalEquityUsd) * 100 : 0;

    const capitalEfficiency =
      summary.performance.capitalEfficiencyStatus === "supported" &&
      typeof summary.performance.capitalEfficiencyPct === "number"
        ? fmtPct(summary.performance.capitalEfficiencyPct)
        : "unsupported";
    const roi = resolveRoiContract(summary.performance);
    const mergedDataCompleteness = mergeDataCompleteness(account.dataCompleteness, pnl.dataCompleteness, bot.dataCompleteness);
    const summaryDataCompleteness = buildDataCompletenessForSummary(context, mergedDataCompleteness);
    const sections = buildSectionList({
      context,
      summary,
      pnl,
      accountCapturedAt: account.capturedAt,
      holdings,
      stableValueUsd,
      nonStableValueUsd,
      stableSharePct,
      nonStableSharePct,
      largestHolding,
      largestHoldingSharePct,
      capitalEfficiency,
      unsupportedExposureRiskReason,
      botReport,
      botFailureReason: bot.failureReason,
      summaryDataCompleteness,
      roiValue: roi.roiKpiValue,
      roiNarrativeLines: roi.narrativeLines
    });

    return {
      command: "summary",
      title: "Account Summary",
      generatedAt,
      schemaVersion: SUMMARY_SCHEMA_VERSION,
      sections,
      dataCompleteness: summaryDataCompleteness,
      sources: buildSources(account, positionsResult, pnl, context, botReport),
      data: buildSummaryData(summary, unsupportedExposureRiskReason, holdings, botReport)
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
