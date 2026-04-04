import type { BotDataService } from "../contracts/BotDataService";
import type { ServiceRequestContext } from "../contracts/AccountDataService";
import type { CacheStore } from "../cache/CacheStore";
import { cacheKeys } from "../cache/cacheKeys";
import type { BybitReadonlyClient } from "./BybitClientFactory";
import { normalizeFuturesGridBotSummary, normalizeSpotGridBotSummary } from "../normalizers/bot.normalizer";
import type { BotReport, BotSummary } from "../../types/domain.types";
import { BYBIT_PARTIAL_FAILURE_POLICY, buildOptionalItemIssue, runWithRetries } from "./partialFailurePolicy";
import { completeDataCompleteness, degradedDataCompleteness } from "../reliability/dataCompleteness";

const BOT_DETAIL_TTL_MS = 15_000;
const BOT_REPORT_TTL_MS = 10_000;

function sum(values: Array<number | undefined>): number {
  return values.reduce<number>((acc, value) => acc + (typeof value === "number" ? value : 0), 0);
}

function hasBotIds(context: ServiceRequestContext): boolean {
  return context.futuresGridBotIds.length > 0 || context.spotGridBotIds.length > 0;
}

function availabilityReason(context: ServiceRequestContext): string | undefined {
  if (hasBotIds(context)) {
    return undefined;
  }
  return "Provide --fgrid-bot-ids and/or --spot-grid-ids (or env BYBIT_FGRID_BOT_IDS/BYBIT_SPOT_GRID_IDS)";
}

export class BybitBotService implements BotDataService {
  constructor(
    private readonly client: BybitReadonlyClient,
    private readonly cache: CacheStore
  ) {}

  async getBotReport(context: ServiceRequestContext): Promise<BotReport> {
    const reportKey = cacheKeys.botReport(context.futuresGridBotIds, context.spotGridBotIds);
    const cachedReport = this.cache.get<BotReport>(reportKey);
    if (cachedReport) {
      return cachedReport;
    }

    if (!hasBotIds(context)) {
      return {
        source: "bybit",
        generatedAt: new Date().toISOString(),
        availability: "not_available",
        availabilityReason: availabilityReason(context),
        bots: [],
        dataCompleteness: completeDataCompleteness()
      };
    }

    const bots: BotSummary[] = [];
    const issues: BotReport["dataCompleteness"]["issues"] = [];

    for (const botId of context.futuresGridBotIds) {
      try {
        const detail = await this.getFuturesGridDetail(botId, context.timeoutMs);
        bots.push(normalizeFuturesGridBotSummary(botId, detail));
      } catch (error) {
        issues.push(
          buildOptionalItemIssue({
            scope: "bots",
            message: `futures_grid:${botId}:${error instanceof Error ? error.message : String(error)}`
          })
        );
      }
    }

    for (const botId of context.spotGridBotIds) {
      try {
        const detail = await this.getSpotGridDetail(botId, context.timeoutMs);
        bots.push(normalizeSpotGridBotSummary(botId, detail));
      } catch (error) {
        issues.push(
          buildOptionalItemIssue({
            scope: "bots",
            message: `spot_grid:${botId}:${error instanceof Error ? error.message : String(error)}`
          })
        );
      }
    }

    const totalAllocatedUsd = sum(bots.map((bot) => bot.allocatedCapitalUsd));
    const totalBotExposureUsd = sum(bots.map((bot) => bot.exposureUsd));
    const totalBotPnlUsd = sum(bots.map((bot) => (bot.realizedPnlUsd ?? 0) + (bot.unrealizedPnlUsd ?? 0)));

    const report: BotReport = {
      source: "bybit",
      generatedAt: new Date().toISOString(),
      availability: bots.length > 0 ? "available" : "not_available",
      availabilityReason: issues.length > 0 ? issues.map((issue) => issue.message).join(" | ") : undefined,
      bots,
      totalAllocatedUsd,
      totalBotExposureUsd,
      totalBotPnlUsd,
      dataCompleteness: issues.length > 0 ? degradedDataCompleteness(issues) : completeDataCompleteness()
    };

    this.cache.set(reportKey, report, BOT_REPORT_TTL_MS);
    return report;
  }

  private async getFuturesGridDetail(botId: string, timeoutMs: number): Promise<unknown> {
    const key = cacheKeys.futuresGridBotDetail(botId);
    const cached = this.cache.get<unknown>(key);
    if (cached) {
      return cached;
    }

    const retries = BYBIT_PARTIAL_FAILURE_POLICY.bot_detail.partialOnFailure === "per_item" ? 3 : 1;
    const result = await runWithRetries(() => this.client.getFuturesGridBotDetail(botId, timeoutMs), retries);
    this.cache.set(key, result, BOT_DETAIL_TTL_MS);
    return result;
  }

  private async getSpotGridDetail(botId: string, timeoutMs: number): Promise<unknown> {
    const key = cacheKeys.spotGridBotDetail(botId);
    const cached = this.cache.get<unknown>(key);
    if (cached) {
      return cached;
    }

    const retries = BYBIT_PARTIAL_FAILURE_POLICY.bot_detail.partialOnFailure === "per_item" ? 3 : 1;
    const result = await runWithRetries(() => this.client.getSpotGridBotDetail(botId, timeoutMs), retries);
    this.cache.set(key, result, BOT_DETAIL_TTL_MS);
    return result;
  }
}
