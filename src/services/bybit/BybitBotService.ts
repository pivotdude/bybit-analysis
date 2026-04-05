import {
  RequiredBotDataUnavailableError,
  type BotDataService,
  type BotReportRequestOptions
} from "../contracts/BotDataService";
import type { ServiceRequestContext } from "../contracts/AccountDataService";
import type { CacheStore } from "../cache/CacheStore";
import { cacheKeys } from "../cache/cacheKeys";
import type { BybitReadonlyClient } from "./BybitClientFactory";
import { normalizeFuturesGridBotSummary, normalizeSpotGridBotSummary } from "./normalizers/bot.normalizer";
import type { BotReport, BotSummary, SourceCacheStatus } from "../../types/domain.types";
import { buildOptionalItemIssue } from "./partialFailurePolicy";
import { completeDataCompleteness, degradedDataCompleteness } from "../reliability/dataCompleteness";
import { getBybitBotStrategyIds } from "./bybitProviderContext";
import { dec, sumDecimals, toFiniteNumber } from "../math/decimal";

const BOT_DETAIL_TTL_MS = 15_000;
const BOT_REPORT_TTL_MS = 10_000;
// Keep the pool conservative to improve batch latency without creating large rate spikes.
const BOT_DETAIL_CONCURRENCY = 3;

interface BotFetchTask {
  botId: string;
  kind: "futures_grid" | "spot_grid";
}

type BotFetchOutcome =
  | {
      bot: BotSummary;
      cacheStatus: Extract<SourceCacheStatus, "hit" | "miss">;
    }
  | {
      issueMessage: string;
      cacheStatus: Extract<SourceCacheStatus, "hit" | "miss">;
    };

async function mapWithConcurrency<TInput, TOutput>(
  items: TInput[],
  concurrency: number,
  worker: (item: TInput, index: number) => Promise<TOutput>
): Promise<TOutput[]> {
  if (items.length === 0) {
    return [];
  }

  const boundedConcurrency = Math.max(1, Math.min(concurrency, items.length));
  const results = new Array<TOutput>(items.length);
  let nextIndex = 0;

  async function runWorker(): Promise<void> {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      const item = items[currentIndex];
      if (item === undefined) {
        continue;
      }
      results[currentIndex] = await worker(item, currentIndex);
    }
  }

  await Promise.all(Array.from({ length: boundedConcurrency }, () => runWorker()));
  return results;
}

function sum(values: Array<number | undefined>): number {
  return toFiniteNumber(sumDecimals(values));
}

function hasBotIds(context: ServiceRequestContext): boolean {
  const ids = getBybitBotStrategyIds(context.providerContext);
  return ids.futuresGridBotIds.length > 0 || ids.spotGridBotIds.length > 0;
}

function availabilityReason(context: ServiceRequestContext): string | undefined {
  if (hasBotIds(context)) {
    return undefined;
  }
  return "Provide --fgrid-bot-ids and/or --spot-grid-ids (or env BYBIT_FGRID_BOT_IDS/BYBIT_SPOT_GRID_IDS)";
}

function resolveRequirement(context: ServiceRequestContext, options?: BotReportRequestOptions): "required" | "optional" {
  if (options?.requirement) {
    return options.requirement;
  }
  return context.sourceMode === "bot" ? "required" : "optional";
}

function getRequiredFailureReason(context: ServiceRequestContext, report: BotReport): string {
  if (report.bots.length > 0) {
    return "";
  }

  return report.availabilityReason ?? availabilityReason(context) ?? "No bot detail payloads were loaded.";
}

function enforceRequiredMode(context: ServiceRequestContext, report: BotReport, requirement: "required" | "optional"): void {
  if (requirement !== "required" || report.bots.length > 0) {
    return;
  }

  const reason = getRequiredFailureReason(context, report);
  throw new RequiredBotDataUnavailableError(
    `required-input-failed: mandatory bot data is unavailable. ${reason}`
  );
}

export class BybitBotService implements BotDataService {
  constructor(
    private readonly client: BybitReadonlyClient,
    private readonly cache: CacheStore
  ) {}

  async getBotReport(context: ServiceRequestContext, options?: BotReportRequestOptions): Promise<BotReport> {
    const requirement = resolveRequirement(context, options);
    const ids = getBybitBotStrategyIds(context.providerContext);
    const reportKey = cacheKeys.botReport(ids.futuresGridBotIds, ids.spotGridBotIds);
    const cachedReport = this.cache.getWithStatus<BotReport>(reportKey);
    if (cachedReport.value) {
      const report = {
        ...cachedReport.value,
        cacheStatus: "hit" as const
      };
      enforceRequiredMode(context, report, requirement);
      return report;
    }

    if (!hasBotIds(context)) {
      const report: BotReport = {
        source: "bybit",
        generatedAt: new Date().toISOString(),
        availability: "not_available",
        availabilityReason: availabilityReason(context),
        bots: [],
        cacheStatus: "unknown",
        dataCompleteness: completeDataCompleteness()
      };

      enforceRequiredMode(context, report, requirement);
      return report;
    }

    const tasks: BotFetchTask[] = [
      ...ids.futuresGridBotIds.map((botId) => ({ botId, kind: "futures_grid" as const })),
      ...ids.spotGridBotIds.map((botId) => ({ botId, kind: "spot_grid" as const }))
    ];
    const outcomes = await mapWithConcurrency(tasks, BOT_DETAIL_CONCURRENCY, async (task): Promise<BotFetchOutcome> => {
      try {
        if (task.kind === "futures_grid") {
          const detail = await this.getFuturesGridDetail(task.botId, context.timeoutMs);
          return {
            bot: normalizeFuturesGridBotSummary(task.botId, detail.value),
            cacheStatus: detail.cacheStatus
          };
        }

        const detail = await this.getSpotGridDetail(task.botId, context.timeoutMs);
        return {
          bot: normalizeSpotGridBotSummary(task.botId, detail.value),
          cacheStatus: detail.cacheStatus
        };
      } catch (error) {
        return {
          issueMessage: `${task.kind}:${task.botId}:${error instanceof Error ? error.message : String(error)}`,
          cacheStatus: "miss"
        };
      }
    });

    const bots: BotSummary[] = [];
    const issues: BotReport["dataCompleteness"]["issues"] = [];
    const detailCacheStatuses: Array<Extract<SourceCacheStatus, "hit" | "miss">> = [];
    for (const outcome of outcomes) {
      detailCacheStatuses.push(outcome.cacheStatus);
      if ("bot" in outcome) {
        bots.push(outcome.bot);
        continue;
      }

      issues.push(
        buildOptionalItemIssue({
          scope: "bots",
          message: outcome.issueMessage
        })
      );
    }

    const totalAllocatedUsd = sum(bots.map((bot) => bot.allocatedCapitalUsd));
    const totalBotExposureUsd = sum(bots.map((bot) => bot.exposureUsd));
    const totalBotPnlUsd = toFiniteNumber(
      sumDecimals(bots.map((bot) => dec(bot.realizedPnlUsd ?? 0).plus(dec(bot.unrealizedPnlUsd ?? 0))))
    );

    const cacheStatus =
      detailCacheStatuses.length === 0
        ? "unknown"
        : detailCacheStatuses.every((status) => status === "hit")
          ? "hit"
          : detailCacheStatuses.every((status) => status === "miss")
            ? "miss"
            : "mixed";

    const report: BotReport = {
      source: "bybit",
      generatedAt: new Date().toISOString(),
      availability: bots.length > 0 ? "available" : "not_available",
      availabilityReason: issues.length > 0 ? issues.map((issue) => issue.message).join(" | ") : undefined,
      bots,
      totalAllocatedUsd,
      totalBotExposureUsd,
      totalBotPnlUsd,
      cacheStatus,
      dataCompleteness: issues.length > 0 ? degradedDataCompleteness(issues) : completeDataCompleteness()
    };

    this.cache.set(reportKey, report, BOT_REPORT_TTL_MS);
    enforceRequiredMode(context, report, requirement);
    return report;
  }

  private async getFuturesGridDetail(
    botId: string,
    timeoutMs: number
  ): Promise<{ value: unknown; cacheStatus: Extract<SourceCacheStatus, "hit" | "miss"> }> {
    const key = cacheKeys.futuresGridBotDetail(botId);
    const cached = this.cache.getWithStatus<unknown>(key);
    if (cached.value) {
      return {
        value: cached.value,
        cacheStatus: "hit"
      };
    }

    const result = await this.client.getFuturesGridBotDetail(botId, timeoutMs);
    this.cache.set(key, result, BOT_DETAIL_TTL_MS);
    return {
      value: result,
      cacheStatus: "miss"
    };
  }

  private async getSpotGridDetail(
    botId: string,
    timeoutMs: number
  ): Promise<{ value: unknown; cacheStatus: Extract<SourceCacheStatus, "hit" | "miss"> }> {
    const key = cacheKeys.spotGridBotDetail(botId);
    const cached = this.cache.getWithStatus<unknown>(key);
    if (cached.value) {
      return {
        value: cached.value,
        cacheStatus: "hit"
      };
    }

    const result = await this.client.getSpotGridBotDetail(botId, timeoutMs);
    this.cache.set(key, result, BOT_DETAIL_TTL_MS);
    return {
      value: result,
      cacheStatus: "miss"
    };
  }
}
