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
const SPOT_OPENING_LOOKBACK_DAYS = 365;
const SPOT_OPENING_LOOKBACK_MS = SPOT_OPENING_LOOKBACK_DAYS * 24 * 60 * 60 * 1000;

interface TimeChunk {
  from: string;
  to: string;
}

interface SpotExecutionRow {
  symbol?: unknown;
  side?: unknown;
  execQty?: unknown;
  execType?: unknown;
}

interface ExecutionHistoryFetchResult {
  rows: Array<Record<string, unknown>>;
  partial: boolean;
  warnings: string[];
}

type SpotExecutionFetchPurpose = "window" | "opening_inventory";

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

function toNumber(input: unknown): number {
  const value = Number(input);
  return Number.isFinite(value) ? value : 0;
}

function extractSpotSellSymbols(rows: Array<Record<string, unknown>>): string[] {
  const symbols = new Set<string>();

  for (const row of rows as SpotExecutionRow[]) {
    const execType = String(row.execType ?? "Trade");
    if (execType !== "Trade") {
      continue;
    }

    const side = String(row.side ?? "").toLowerCase();
    const qty = toNumber(row.execQty);
    if (side !== "sell" || qty <= 0) {
      continue;
    }

    symbols.add(String(row.symbol ?? "UNKNOWN").toUpperCase());
  }

  return Array.from(symbols.values()).sort((left, right) => left.localeCompare(right));
}

function toSpotOpeningInventoryRange(periodFrom: string): TimeChunk | undefined {
  const fromMs = new Date(periodFrom).getTime();
  if (!Number.isFinite(fromMs) || fromMs <= 0) {
    return undefined;
  }

  const openingEndMs = fromMs - 1;
  if (openingEndMs <= 0) {
    return undefined;
  }

  const openingStartMs = Math.max(0, fromMs - SPOT_OPENING_LOOKBACK_MS);
  return {
    from: new Date(openingStartMs).toISOString(),
    to: new Date(openingEndMs).toISOString()
  };
}

function dedupeWarnings(warnings: string[]): string[] {
  return Array.from(new Set(warnings));
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

  private async fetchSpotExecutionHistory(
    context: ServiceRequestContext,
    range: TimeChunk,
    options: {
      symbol?: string;
      purpose: SpotExecutionFetchPurpose;
    }
  ): Promise<ExecutionHistoryFetchResult> {
    const rows: Array<Record<string, unknown>> = [];
    const warnings: string[] = [];
    let partial = false;

    for (const chunk of splitRangeByMaxWindow(range.from, range.to)) {
      let cursor: string | undefined;
      let pagesFetched = 0;

      while (true) {
        const key = cacheKeys.executionHistory(context.category, chunk.from, chunk.to, cursor, options.symbol);
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
            context.timeoutMs,
            options.symbol
          )) as { list?: Array<Record<string, unknown>>; nextPageCursor?: string };
          this.cache.set(key, payload, CLOSED_PNL_TTL_MS);
        }

        rows.push(...(payload.list ?? []));
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
          const baseWarning = buildPaginationLimitMessage(error.context);
          if (options.purpose === "opening_inventory") {
            warnings.push(
              `Opening inventory reconstruction is incomplete for ${options.symbol ?? "UNKNOWN"}: ${baseWarning}`
            );
          } else {
            warnings.push(baseWarning);
          }
          break;
        }
      }
    }

    return { rows, partial, warnings };
  }

  async getPnlReport(context: ServiceRequestContext, equityStartUsd?: number, equityEndUsd?: number): Promise<PnLReport> {
    if (context.category === "bot") {
      const report = await this.botService.getBotReport(context);
      return toBotPnlReport(context, report, equityStartUsd, equityEndUsd);
    }

    if (context.category === "spot") {
      const warnings: string[] = [];

      const periodExecutions = await this.fetchSpotExecutionHistory(
        context,
        { from: context.from, to: context.to },
        { purpose: "window" }
      );
      warnings.push(...periodExecutions.warnings);

      const openingExecutions: Array<Record<string, unknown>> = [];
      const openingRange = toSpotOpeningInventoryRange(context.from);
      const soldSymbols = extractSpotSellSymbols(periodExecutions.rows);
      let openingPartial = false;

      if (soldSymbols.length > 0) {
        if (!openingRange) {
          openingPartial = true;
          warnings.push(
            "Opening inventory reconstruction failed: invalid --from boundary prevented loading pre-window executions."
          );
        } else {
          for (const symbol of soldSymbols) {
            const openingHistory = await this.fetchSpotExecutionHistory(
              context,
              openingRange,
              {
                symbol,
                purpose: "opening_inventory"
              }
            );
            openingExecutions.push(...openingHistory.rows);
            openingPartial = openingPartial || openingHistory.partial;
            warnings.push(...openingHistory.warnings);
          }
        }
      }

      const report = normalizeSpotPnlReport(
        { list: periodExecutions.rows },
        context.from,
        context.to,
        equityStartUsd,
        equityEndUsd,
        {
          openingExecutions: { list: openingExecutions },
          inventoryCostMethod: "weighted_average"
        }
      );

      const partial = periodExecutions.partial || openingPartial || report.dataCompleteness.partial;
      if (partial) {
        report.dataCompleteness = {
          partial: true,
          warnings: dedupeWarnings([...warnings, ...report.dataCompleteness.warnings])
        };
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
