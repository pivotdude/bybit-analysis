import type { ExecutionDataService } from "../contracts/ExecutionDataService";
import type { ServiceRequestContext } from "../contracts/AccountDataService";
import type { BotDataService } from "../contracts/BotDataService";
import type { CacheStore } from "../cache/CacheStore";
import { cacheKeys } from "../cache/cacheKeys";
import type { BybitReadonlyClient } from "./BybitClientFactory";
import { normalizePnlReport } from "../normalizers/pnl.normalizer";
import { normalizeSpotPnlReport } from "../normalizers/spotPnl.normalizer";
import type { PnLReport, SymbolPnL } from "../../types/domain.types";
import {
  buildPaginationLimitMessage,
  PaginationLimitReachedError
} from "./pagination";
import type { PaginationLimitMode } from "./pagination";

const CLOSED_PNL_TTL_MS = 20_000;
const MAX_CLOSED_PNL_RANGE_MS = 7 * 24 * 60 * 60 * 1000;

interface TimeChunk {
  from: string;
  to: string;
}

function splitRangeByMaxWindow(from: string, to: string): TimeChunk[] {
  const fromMs = new Date(from).getTime();
  const toMs = new Date(to).getTime();

  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || fromMs >= toMs) {
    return [{ from, to }];
  }

  const chunks: TimeChunk[] = [];
  let cursorMs = fromMs;

  while (cursorMs < toMs) {
    const chunkEndMs = Math.min(cursorMs + MAX_CLOSED_PNL_RANGE_MS, toMs);
    chunks.push({
      from: new Date(cursorMs).toISOString(),
      to: new Date(chunkEndMs).toISOString()
    });
    cursorMs = chunkEndMs + 1;
  }

  return chunks;
}

function toBotPnlReport(
  context: ServiceRequestContext,
  report: Awaited<ReturnType<BotDataService["getBotReport"]>>,
  equityStartUsd?: number,
  equityEndUsd?: number
): PnLReport {
  const bySymbol: SymbolPnL[] = report.bots
    .map((bot) => {
      const realizedPnlUsd = bot.realizedPnlUsd ?? 0;
      const unrealizedPnlUsd = bot.unrealizedPnlUsd ?? 0;
      return {
        symbol: bot.symbol ?? bot.name,
        realizedPnlUsd,
        unrealizedPnlUsd,
        netPnlUsd: realizedPnlUsd + unrealizedPnlUsd,
        tradesCount: bot.openPositions
      };
    })
    .sort((left, right) => right.netPnlUsd - left.netPnlUsd);

  const realizedPnlUsd = bySymbol.reduce((sum, item) => sum + item.realizedPnlUsd, 0);
  const unrealizedPnlUsd = bySymbol.reduce((sum, item) => sum + item.unrealizedPnlUsd, 0);
  const netPnlUsd = realizedPnlUsd + unrealizedPnlUsd;
  const roiPct =
    equityStartUsd && equityStartUsd > 0 && typeof equityEndUsd === "number"
      ? ((equityEndUsd - equityStartUsd) / equityStartUsd) * 100
      : undefined;

  return {
    source: "bybit",
    generatedAt: new Date().toISOString(),
    periodFrom: context.from,
    periodTo: context.to,
    realizedPnlUsd,
    unrealizedPnlUsd,
    fees: {
      tradingFeesUsd: 0,
      fundingFeesUsd: 0
    },
    netPnlUsd,
    roiPct,
    bySymbol,
    bestSymbols: bySymbol.slice(0, 5),
    worstSymbols: [...bySymbol].reverse().slice(0, 5),
    dataCompleteness: {
      partial: false,
      warnings: []
    }
  };
}

export class BybitExecutionService implements ExecutionDataService {
  constructor(
    private readonly client: BybitReadonlyClient,
    private readonly botService: BotDataService,
    private readonly cache: CacheStore,
    private readonly paginationOptions: {
      maxPagesPerChunk?: number;
      limitMode?: PaginationLimitMode;
    } = {}
  ) {}

  async getPnlReport(context: ServiceRequestContext, equityStartUsd?: number, equityEndUsd?: number): Promise<PnLReport> {
    if (context.category === "bot") {
      const report = await this.botService.getBotReport(context);
      return toBotPnlReport(context, report, equityStartUsd, equityEndUsd);
    }

    if (context.category === "spot") {
      const executions: Array<Record<string, unknown>> = [];
      const chunks = splitRangeByMaxWindow(context.from, context.to);
      const warnings: string[] = [];
      let partial = false;

      for (const chunk of chunks) {
        let cursor: string | undefined;
        let pagesFetched = 0;

        while (true) {
          const key = cacheKeys.executionHistory(context.category, chunk.from, chunk.to, cursor);
          let payload = this.cache.get<{
            list?: Array<Record<string, unknown>>;
            nextPageCursor?: string;
          }>(key);

          if (!payload) {
            payload = (await this.client.getExecutionList(
              context.category,
              chunk.from,
              chunk.to,
              cursor,
              context.timeoutMs
            )) as { list?: Array<Record<string, unknown>>; nextPageCursor?: string };
            this.cache.set(key, payload, CLOSED_PNL_TTL_MS);
          }

          executions.push(...(payload.list ?? []));
          pagesFetched += 1;
          cursor = payload.nextPageCursor;
          if (!cursor) {
            break;
          }

          const maxPages = this.paginationOptions.maxPagesPerChunk;
          if (maxPages && pagesFetched >= maxPages) {
            const error = new PaginationLimitReachedError({
              endpoint: "execution-list",
              pageLimit: maxPages,
              pagesFetched,
              nextPageCursor: cursor,
              chunkFrom: chunk.from,
              chunkTo: chunk.to
            });

            if ((this.paginationOptions.limitMode ?? "error") === "error") {
              throw error;
            }

            partial = true;
            warnings.push(buildPaginationLimitMessage(error.context));
            break;
          }
        }
      }

      const report = normalizeSpotPnlReport(
        { list: executions },
        context.from,
        context.to,
        equityStartUsd,
        equityEndUsd
      );
      if (partial) {
        report.dataCompleteness = { partial: true, warnings };
      }
      return report;
    }

    const events: Array<Record<string, unknown>> = [];
    const chunks = splitRangeByMaxWindow(context.from, context.to);
    const warnings: string[] = [];
    let partial = false;

    for (const chunk of chunks) {
      let cursor: string | undefined;
      let pagesFetched = 0;

      while (true) {
        const key = cacheKeys.closedPnl(context.category, chunk.from, chunk.to, cursor);
        let payload = this.cache.get<{
          list?: Array<Record<string, unknown>>;
          nextPageCursor?: string;
        }>(key);

        if (!payload) {
          payload = (await this.client.getClosedPnl(
            context.category,
            chunk.from,
            chunk.to,
            cursor,
            context.timeoutMs
          )) as { list?: Array<Record<string, unknown>>; nextPageCursor?: string };
          this.cache.set(key, payload, CLOSED_PNL_TTL_MS);
        }

        events.push(...(payload.list ?? []));
        pagesFetched += 1;
        cursor = payload.nextPageCursor;
        if (!cursor) {
          break;
        }

        const maxPages = this.paginationOptions.maxPagesPerChunk;
        if (maxPages && pagesFetched >= maxPages) {
          const error = new PaginationLimitReachedError({
            endpoint: "closed-pnl",
            pageLimit: maxPages,
            pagesFetched,
            nextPageCursor: cursor,
            chunkFrom: chunk.from,
            chunkTo: chunk.to
          });

          if ((this.paginationOptions.limitMode ?? "error") === "error") {
            throw error;
          }

          partial = true;
          warnings.push(buildPaginationLimitMessage(error.context));
          break;
        }
      }
    }

    const wallet = (await this.client.getWalletBalance(context.category, context.timeoutMs)) as {
      list?: Array<Record<string, unknown>>;
    };

    const unrealizedPnlUsd = Number(wallet.list?.[0]?.totalPerpUPL ?? 0);

    const report = normalizePnlReport(
      { list: events },
      context.from,
      context.to,
      Number.isFinite(unrealizedPnlUsd) ? unrealizedPnlUsd : 0,
      equityStartUsd,
      equityEndUsd
    );
    if (partial) {
      report.dataCompleteness = { partial: true, warnings };
    }
    return report;
  }
}
