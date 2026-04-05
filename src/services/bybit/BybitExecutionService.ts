import type { ExecutionDataService, GetPnlReportRequest } from "../contracts/ExecutionDataService";
import type { ServiceRequestContext } from "../contracts/AccountDataService";
import type { BotDataService } from "../contracts/BotDataService";
import type { CacheStore } from "../cache/CacheStore";
import { cacheKeys } from "../cache/cacheKeys";
import type { BybitReadonlyClient } from "./BybitClientFactory";
import { normalizePnlReport } from "./normalizers/pnl.normalizer";
import { isStableSpotQuoteSymbol, normalizeSpotPnlReport } from "./normalizers/spotPnl.normalizer";
import { normalizeRoi } from "../normalizers/roi.normalizer";
import type {
  DataCompleteness,
  PnLReport,
  RoiUnsupportedReasonCode,
  SymbolPnL
} from "../../types/domain.types";
import {
  buildPaginationLimitMessage,
  PaginationLimitReachedError
} from "./pagination";
import type { PaginationLimitMode } from "./pagination";
import {
  BYBIT_PARTIAL_FAILURE_POLICY,
  buildInvalidWindowIssue,
  buildPageFetchIssue,
  buildPaginationIssue,
  getRetryAttempts
} from "./partialFailurePolicy";
import {
  completeDataCompleteness,
  degradedDataCompleteness,
  mergeDataCompleteness
} from "../reliability/dataCompleteness";
import { dec, decUnknown, sumDecimals, toFiniteNumber } from "../math/decimal";

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
  dataCompleteness: DataCompleteness;
  haltedByRetriedFailure: boolean;
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

function extractSpotSellSymbols(rows: Array<Record<string, unknown>>): string[] {
  const symbols = new Set<string>();

  for (const row of rows as SpotExecutionRow[]) {
    const execType = String(row.execType ?? "Trade");
    if (execType !== "Trade") {
      continue;
    }

    const side = String(row.side ?? "").toLowerCase();
    const qty = decUnknown(row.execQty);
    if (side !== "sell" || qty.lte(0)) {
      continue;
    }

    const symbol = String(row.symbol ?? "UNKNOWN").toUpperCase();
    if (!isStableSpotQuoteSymbol(symbol)) {
      continue;
    }

    symbols.add(symbol);
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

function toBotPnlReport(
  context: ServiceRequestContext,
  report: Awaited<ReturnType<BotDataService["getBotReport"]>>,
  equityStartUsd?: number,
  equityEndUsd?: number,
  roiMissingStartReason?: string,
  roiMissingStartReasonCode?: RoiUnsupportedReasonCode
): PnLReport {
  const symbolRows = report.bots
    .map((bot) => {
      const realizedPnlUsd = dec(bot.realizedPnlUsd ?? 0);
      const unrealizedPnlUsd = dec(bot.unrealizedPnlUsd ?? 0);
      const netPnlUsd = realizedPnlUsd.plus(unrealizedPnlUsd);

      return {
        symbol: bot.symbol ?? bot.name,
        realizedPnlUsd,
        unrealizedPnlUsd,
        netPnlUsd,
        tradesCount: bot.activePositionCount
      };
    })
    .sort((left, right) => right.netPnlUsd.comparedTo(left.netPnlUsd) || left.symbol.localeCompare(right.symbol));
  const bySymbol: SymbolPnL[] = symbolRows.map((row) => ({
    symbol: row.symbol,
    realizedPnlUsd: toFiniteNumber(row.realizedPnlUsd),
    unrealizedPnlUsd: toFiniteNumber(row.unrealizedPnlUsd),
    netPnlUsd: toFiniteNumber(row.netPnlUsd),
    tradesCount: row.tradesCount
  }));

  const realizedPnlUsdDecimal = sumDecimals(symbolRows.map((item) => item.realizedPnlUsd));
  const unrealizedPnlUsdDecimal = sumDecimals(symbolRows.map((item) => item.unrealizedPnlUsd));
  const netPnlUsdDecimal = realizedPnlUsdDecimal.plus(unrealizedPnlUsdDecimal);
  const realizedPnlUsd = toFiniteNumber(realizedPnlUsdDecimal);
  const unrealizedPnlUsd = toFiniteNumber(unrealizedPnlUsdDecimal);
  const netPnlUsd = toFiniteNumber(netPnlUsdDecimal);
  const roi = normalizeRoi({
    equityStartUsd,
    equityEndUsd,
    missingStartReason: roiMissingStartReason,
    missingStartReasonCode: roiMissingStartReasonCode
  });

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
    ...roi,
    bySymbol,
    bestSymbols: bySymbol.slice(0, 5),
    worstSymbols: [...bySymbol].reverse().slice(0, 5),
    dataCompleteness: report.dataCompleteness
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
    const issues: DataCompleteness["issues"] = [];
    const policyKey = options.purpose === "opening_inventory" ? "opening_inventory" : "execution_window";
    let pagesFetchedTotal = 0;
    let haltedByRetriedFailure = false;

    for (const chunk of splitRangeByMaxWindow(range.from, range.to)) {
      if (haltedByRetriedFailure) {
        break;
      }

      let cursor: string | undefined;
      let pagesFetched = 0;

      while (true) {
        const key = cacheKeys.executionHistory(context.category, chunk.from, chunk.to, cursor, options.symbol);
        let payload = this.cache.get<{
          list?: Array<Record<string, unknown>>;
          nextPageCursor?: string;
        }>(key);

        if (!payload) {
          try {
            payload = (await this.client.getExecutionList(
              context.category,
              chunk.from,
              chunk.to,
              cursor,
              context.timeoutMs,
              options.symbol
            )) as { list?: Array<Record<string, unknown>>; nextPageCursor?: string };
            this.cache.set(key, payload, CLOSED_PNL_TTL_MS);
          } catch (error) {
            const pageIssue = buildPageFetchIssue({
              scope: policyKey,
              criticality: BYBIT_PARTIAL_FAILURE_POLICY[policyKey].criticality,
              page: pagesFetchedTotal + 1,
              cursor,
              error
            });
            const issue =
              options.purpose === "opening_inventory"
                ? {
                    ...pageIssue,
                    message: `Opening inventory reconstruction failed for ${options.symbol ?? "UNKNOWN"}: ${pageIssue.message}`
                  }
                : pageIssue;

            if (
              BYBIT_PARTIAL_FAILURE_POLICY[policyKey].criticality === "critical" &&
              pagesFetchedTotal === 0 &&
              BYBIT_PARTIAL_FAILURE_POLICY[policyKey].partialOnFailure === "after_first_page"
            ) {
              throw new Error(issue.message, { cause: error });
            }

            issues.push(issue);
            haltedByRetriedFailure = getRetryAttempts(error) > 1;
            break;
          }
        }

        rows.push(...(payload.list ?? []));
        pagesFetched += 1;
        pagesFetchedTotal += 1;
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

          const baseWarning = buildPaginationLimitMessage(error.context);
          issues.push(
            buildPaginationIssue({
              scope: policyKey,
              criticality: BYBIT_PARTIAL_FAILURE_POLICY[policyKey].criticality,
              message:
                options.purpose === "opening_inventory"
                  ? `Opening inventory reconstruction is incomplete for ${options.symbol ?? "UNKNOWN"}: ${baseWarning}`
                  : baseWarning
            })
          );
          break;
        }
      }
    }

    return {
      rows,
      dataCompleteness: issues.length > 0 ? degradedDataCompleteness(issues) : completeDataCompleteness(),
      haltedByRetriedFailure
    };
  }

  async getPnlReport(request: GetPnlReportRequest): Promise<PnLReport> {
    const {
      context,
      equityStartUsd,
      equityEndUsd,
      roiMissingStartReason,
      roiMissingStartReasonCode,
      accountSnapshot
    } = request;

    if (context.sourceMode === "bot") {
      const report = await this.botService.getBotReport(context, { requirement: "required" });
      return toBotPnlReport(
        context,
        report,
        equityStartUsd,
        equityEndUsd,
        roiMissingStartReason,
        roiMissingStartReasonCode
      );
    }

    if (context.category === "spot") {
      const periodExecutions = await this.fetchSpotExecutionHistory(
        context,
        { from: context.from, to: context.to },
        { purpose: "window" }
      );

      const openingExecutions: Array<Record<string, unknown>> = [];
      const openingRange = toSpotOpeningInventoryRange(context.from);
      const soldSymbols = periodExecutions.haltedByRetriedFailure ? [] : extractSpotSellSymbols(periodExecutions.rows);
      const openingIssues: DataCompleteness["issues"] = [];

      if (soldSymbols.length > 0) {
        if (!openingRange) {
          openingIssues.push(
            buildInvalidWindowIssue({
              scope: "opening_inventory",
              criticality: BYBIT_PARTIAL_FAILURE_POLICY.opening_inventory.criticality,
              message:
                "Opening inventory reconstruction failed: invalid --from boundary prevented loading pre-window executions."
            })
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
            openingIssues.push(...openingHistory.dataCompleteness.issues);
            if (openingHistory.haltedByRetriedFailure) {
              break;
            }
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
        },
        roiMissingStartReason,
        roiMissingStartReasonCode
      );

      report.dataCompleteness = mergeDataCompleteness(
        periodExecutions.dataCompleteness,
        openingIssues.length > 0 ? degradedDataCompleteness(openingIssues) : completeDataCompleteness(),
        report.dataCompleteness
      );
      return report;
    }

    const events: Array<Record<string, unknown>> = [];
    const chunks = splitRangeByMaxWindow(context.from, context.to);
    const issues: DataCompleteness["issues"] = [];
    let pagesFetchedTotal = 0;
    let haltedByRetriedFailure = false;

    for (const chunk of chunks) {
      if (haltedByRetriedFailure) {
        break;
      }

      let cursor: string | undefined;
      let pagesFetched = 0;

      while (true) {
        const key = cacheKeys.closedPnl(context.category, chunk.from, chunk.to, cursor);
        let payload = this.cache.get<{
          list?: Array<Record<string, unknown>>;
          nextPageCursor?: string;
        }>(key);

        if (!payload) {
          try {
            payload = (await this.client.getClosedPnl(
              context.category,
              chunk.from,
              chunk.to,
              cursor,
              context.timeoutMs
            )) as { list?: Array<Record<string, unknown>>; nextPageCursor?: string };
            this.cache.set(key, payload, CLOSED_PNL_TTL_MS);
          } catch (error) {
            const issue = buildPageFetchIssue({
              scope: "closed_pnl",
              criticality: BYBIT_PARTIAL_FAILURE_POLICY.closed_pnl.criticality,
              page: pagesFetchedTotal + 1,
              cursor,
              error
            });
            if (pagesFetchedTotal === 0 && BYBIT_PARTIAL_FAILURE_POLICY.closed_pnl.partialOnFailure === "after_first_page") {
              throw new Error(issue.message, { cause: error });
            }
            issues.push(issue);
            haltedByRetriedFailure = getRetryAttempts(error) > 1;
            break;
          }
        }

        events.push(...(payload.list ?? []));
        pagesFetched += 1;
        pagesFetchedTotal += 1;
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

          issues.push(
            buildPaginationIssue({
              scope: "closed_pnl",
              criticality: BYBIT_PARTIAL_FAILURE_POLICY.closed_pnl.criticality,
              message: buildPaginationLimitMessage(error.context)
            })
          );
          break;
        }
      }
    }

    const unrealizedPnlUsdFromAccount = accountSnapshot?.unrealizedPnlUsd;
    const unrealizedPnlUsd =
      typeof unrealizedPnlUsdFromAccount === "number"
        ? toFiniteNumber(dec(unrealizedPnlUsdFromAccount))
        : toFiniteNumber(
            decUnknown(
              ((await this.client.getWalletBalance(context.category, context.timeoutMs)) as {
                list?: Array<Record<string, unknown>>;
              }).list?.[0]?.totalPerpUPL
            )
          );

    const report = normalizePnlReport(
      { list: events },
      context.from,
      context.to,
      unrealizedPnlUsd,
      equityStartUsd,
      equityEndUsd,
      roiMissingStartReason,
      roiMissingStartReasonCode
    );
    report.dataCompleteness = issues.length > 0 ? degradedDataCompleteness(issues) : completeDataCompleteness();
    return report;
  }
}
