import type { PositionDataService } from "../contracts/PositionDataService";
import type { ServiceRequestContext } from "../contracts/AccountDataService";
import type { BotDataService } from "../contracts/BotDataService";
import type { CacheStore } from "../cache/CacheStore";
import { cacheKeys } from "../cache/cacheKeys";
import type { BybitReadonlyClient } from "./BybitClientFactory";
import { normalizePositions } from "../normalizers/position.normalizer";
import type { Position } from "../../types/domain.types";
import {
  buildPaginationLimitMessage,
  PaginationLimitReachedError
} from "./pagination";
import type { PaginationLimitMode } from "./pagination";
import type { PositionDataResult } from "../contracts/PositionDataService";

const POSITIONS_TTL_MS = 15_000;

function toPositionSide(side: string | undefined): "long" | "short" {
  if (side === "short") {
    return "short";
  }
  return "long";
}

function toBotPositions(context: ServiceRequestContext, bots: Awaited<ReturnType<BotDataService["getBotReport"]>>["bots"]): Position[] {
  const now = new Date().toISOString();

  return bots
    .map((bot): Position | null => {
      const exposure = Math.abs(bot.exposureUsd ?? 0);
      const markPrice = bot.markPrice ?? 0;
      const quantity = bot.quantity ?? (markPrice > 0 ? exposure / markPrice : 0);
      if (exposure <= 0 && quantity <= 0) {
        return null;
      }

      const side = toPositionSide(bot.side);
      const signedNotional = side === "short" ? -exposure : exposure;

      return {
        source: "bybit",
        exchange: "bybit",
        category: context.category,
        symbol: bot.symbol ?? bot.name,
        baseAsset: bot.baseAsset ?? "BOT",
        quoteAsset: bot.quoteAsset ?? "USD",
        side,
        marginMode: "cross",
        quantity: Math.abs(quantity),
        entryPrice: bot.entryPrice ?? 0,
        valuationPrice: markPrice,
        priceSource: markPrice > 0 ? "mark" : "last",
        notionalUsd: signedNotional,
        leverage: Math.max(1, bot.leverage ?? 1),
        liquidationPrice: bot.liquidationPrice,
        unrealizedPnlUsd: bot.unrealizedPnlUsd ?? 0,
        initialMarginUsd: bot.allocatedCapitalUsd,
        maintenanceMarginUsd: undefined,
        openedAt: undefined,
        updatedAt: now
      };
    })
    .filter((item): item is Position => item !== null);
}

export class BybitPositionService implements PositionDataService {
  constructor(
    private readonly client: BybitReadonlyClient,
    private readonly botService: BotDataService,
    private readonly cache: CacheStore,
    private readonly paginationOptions: {
      maxPages?: number;
      limitMode?: PaginationLimitMode;
    } = {}
  ) {}

  async getOpenPositions(context: ServiceRequestContext): Promise<PositionDataResult> {
    if (context.category === "spot") {
      return {
        positions: [],
        dataCompleteness: { partial: false, warnings: [] }
      };
    }

    if (context.category === "bot") {
      const report = await this.botService.getBotReport(context);
      return {
        positions: toBotPositions(context, report.bots),
        dataCompleteness: { partial: false, warnings: [] }
      };
    }

    const key = cacheKeys.positions(context.category);
    const cached = this.cache.get<PositionDataResult>(key);
    if (cached) {
      return cached;
    }

    const allRows: Array<Record<string, unknown>> = [];
    let cursor: string | undefined;
    let pagesFetched = 0;
    let partial = false;
    const warnings: string[] = [];

    while (true) {
      const result = (await this.client.getPositions(context.category, cursor, context.timeoutMs)) as {
        list?: Array<Record<string, unknown>>;
        nextPageCursor?: string;
      };
      pagesFetched += 1;

      allRows.push(...(result.list ?? []));
      cursor = result.nextPageCursor;

      if (!cursor) {
        break;
      }

      if (this.paginationOptions.maxPages && pagesFetched >= this.paginationOptions.maxPages) {
        const error = new PaginationLimitReachedError({
          endpoint: "positions",
          pageLimit: this.paginationOptions.maxPages,
          pagesFetched,
          nextPageCursor: cursor
        });

        if ((this.paginationOptions.limitMode ?? "error") === "error") {
          throw error;
        }

        partial = true;
        warnings.push(buildPaginationLimitMessage(error.context));
        break;
      }
    }

    const result: PositionDataResult = {
      positions: normalizePositions({ list: allRows }, context.category),
      dataCompleteness: {
        partial,
        warnings
      }
    };

    this.cache.set(key, result, POSITIONS_TTL_MS);
    return result;
  }
}
