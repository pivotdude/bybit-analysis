import type { PositionDataService } from "../contracts/PositionDataService";
import type { ServiceRequestContext } from "../contracts/AccountDataService";
import type { CacheStore } from "../cache/CacheStore";
import { cacheKeys } from "../cache/cacheKeys";
import type { BybitReadonlyClient } from "./BybitClientFactory";
import { normalizePositions } from "../normalizers/position.normalizer";
import type { Position } from "../../types/domain.types";

const POSITIONS_TTL_MS = 15_000;

export class BybitPositionService implements PositionDataService {
  constructor(
    private readonly client: BybitReadonlyClient,
    private readonly cache: CacheStore
  ) {}

  async getOpenPositions(context: ServiceRequestContext): Promise<Position[]> {
    const key = cacheKeys.positions(context.category);
    const cached = this.cache.get<Position[]>(key);
    if (cached) {
      return cached;
    }

    const allRows: Array<Record<string, unknown>> = [];
    let cursor: string | undefined;

    for (let page = 0; page < 10; page += 1) {
      const result = (await this.client.getPositions(context.category, cursor, context.timeoutMs)) as {
        list?: Array<Record<string, unknown>>;
        nextPageCursor?: string;
      };

      allRows.push(...(result.list ?? []));
      cursor = result.nextPageCursor;

      if (!cursor) {
        break;
      }
    }

    const normalized = normalizePositions({ list: allRows }, context.category);
    this.cache.set(key, normalized, POSITIONS_TTL_MS);
    return normalized;
  }
}
