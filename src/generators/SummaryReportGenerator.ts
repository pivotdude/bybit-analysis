import { SummaryAnalyzer, type SummaryAnalysis } from "../analyzers/orchestrators/SummaryAnalyzer";
import type { AccountDataService, ServiceRequestContext } from "../services/contracts/AccountDataService";
import type { ExecutionDataService } from "../services/contracts/ExecutionDataService";
import type { BotDataService } from "../services/contracts/BotDataService";
import type { PositionDataService } from "../services/contracts/PositionDataService";
import { composeAccountSnapshot } from "../services/contracts/accountSnapshot";
import type { ReportDocument } from "../types/report.types";
import type { BotReport, DataCompleteness } from "../types/domain.types";
import { fmtPct } from "./formatters";
import { degradedDataCompleteness, getUnsupportedFeatureIssueMessage, mergeDataCompleteness } from "../services/reliability/dataCompleteness";
import { resolveStartingEquity } from "../services/roi/startingEquityResolver";
import { resolveRoiContract } from "./roiContractResolver";
import { createSourceMetadata } from "./sourceMetadata";
import { buildSectionList } from "./summary/sections";
import { buildDataCompletenessForSummary } from "./summary/policy";
import type { HoldingSnapshot } from "./summary/types";

export const SUMMARY_SCHEMA_VERSION = "summary-markdown-v1";
export { SUMMARY_SECTION_CONTRACT, SUMMARY_SECTION_ORDER } from "./summary/contract";

const STABLE_ASSETS = new Set(["USDT", "USDC", "USD", "USDE", "FDUSD", "DAI", "TUSD", "USDD"]);

interface BotLoadResult {
  report?: BotReport;
  dataCompleteness: DataCompleteness;
  failureReason?: string;
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

function buildSources(
  account: Awaited<ReturnType<AccountDataService["getWalletSnapshot"]>> & {
    exchange: string;
    category: ServiceRequestContext["category"];
    source: string;
    capturedAt: string;
    cacheStatus?: string;
  },
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
