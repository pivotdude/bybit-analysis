import type { PositionDataService } from "../contracts/PositionDataService";
import type { ServiceRequestContext } from "../contracts/AccountDataService";
import type { CacheStore } from "../cache/CacheStore";
import { cacheKeys } from "../cache/cacheKeys";
import type { BybitReadonlyClient } from "./BybitClientFactory";
import { normalizePositions } from "./normalizers/position.normalizer";
import {
  buildPaginationLimitMessage,
  PaginationLimitReachedError
} from "./pagination";
import type { PaginationLimitMode } from "./pagination";
import type { PositionDataResult } from "../contracts/PositionDataService";
import {
  BYBIT_PARTIAL_FAILURE_POLICY,
  buildPageFetchIssue,
  buildPaginationIssue
} from "./partialFailurePolicy";
import {
  buildUnsupportedFeatureIssue,
  completeDataCompleteness,
  degradedDataCompleteness
} from "../reliability/dataCompleteness";

const POSITIONS_TTL_MS = 15_000;
const SPOT_MARKET_POSITIONS_UNSUPPORTED_MESSAGE =
  "Spot market exposure/risk is unsupported: spot balances are not modeled as exposure-bearing positions.";

export class BybitPositionService implements PositionDataService {
  constructor(
    private readonly client: BybitReadonlyClient,
    private readonly cache: CacheStore,
    private readonly paginationOptions: {
      maxPages?: number;
      limitMode?: PaginationLimitMode;
    } = {}
  ) {}

  async getOpenPositions(context: ServiceRequestContext): Promise<PositionDataResult> {
    if (context.category === "spot") {
      return {
        source: "bybit",
        exchange: "bybit",
        capturedAt: new Date().toISOString(),
        positions: [],
        cacheStatus: "unknown",
        dataCompleteness: degradedDataCompleteness([
          buildUnsupportedFeatureIssue({
            scope: "positions",
            message: SPOT_MARKET_POSITIONS_UNSUPPORTED_MESSAGE
          })
        ])
      };
    }

    const key = cacheKeys.positions(context.category);
    const cached = this.cache.getWithStatus<PositionDataResult>(key);
    if (cached.value) {
      return {
        ...cached.value,
        cacheStatus: "hit"
      };
    }

    let cacheStatus: PositionDataResult["cacheStatus"] = "miss";

    const allRows: Array<Record<string, unknown>> = [];
    let cursor: string | undefined;
    let pagesFetched = 0;
    const issues: PositionDataResult["dataCompleteness"]["issues"] = [];

    while (true) {
      const page = pagesFetched + 1;
      let result: {
        list?: Array<Record<string, unknown>>;
        nextPageCursor?: string;
      };
      try {
        result = (await this.client.getPositions(context.category, cursor, context.timeoutMs)) as {
          list?: Array<Record<string, unknown>>;
          nextPageCursor?: string;
        };
        if (pagesFetched > 0) {
          cacheStatus = "mixed";
        }
      } catch (error) {
        const issue = buildPageFetchIssue({
          scope: "positions",
          criticality: BYBIT_PARTIAL_FAILURE_POLICY.positions.criticality,
          page,
          cursor,
          error
        });

        if (pagesFetched === 0 || BYBIT_PARTIAL_FAILURE_POLICY.positions.partialOnFailure !== "after_first_page") {
          throw new Error(issue.message, { cause: error });
        }

        issues.push(issue);
        break;
      }
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

        issues.push(
          buildPaginationIssue({
            scope: "positions",
            criticality: BYBIT_PARTIAL_FAILURE_POLICY.positions.criticality,
            message: buildPaginationLimitMessage(error.context)
          })
        );
        break;
      }
    }

    const normalized = normalizePositions({ list: allRows }, context.category);
    const result: PositionDataResult = {
      source: "bybit",
      exchange: "bybit",
      capturedAt: new Date().toISOString(),
      positions: normalized.positions,
      dataCompleteness:
        issues.length > 0 || normalized.issues.length > 0
          ? degradedDataCompleteness([...issues, ...normalized.issues])
          : completeDataCompleteness(),
      cacheStatus
    };

    this.cache.set(key, result, POSITIONS_TTL_MS);
    return result;
  }
}
