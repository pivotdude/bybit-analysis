import type { ExecutionDataService } from "../contracts/ExecutionDataService";
import type { ServiceRequestContext } from "../contracts/AccountDataService";
import type { CacheStore } from "../cache/CacheStore";
import { cacheKeys } from "../cache/cacheKeys";
import type { BybitReadonlyClient } from "./BybitClientFactory";
import { normalizePnlReport } from "../normalizers/pnl.normalizer";
import type { PnLReport } from "../../types/domain.types";

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

export class BybitExecutionService implements ExecutionDataService {
  constructor(
    private readonly client: BybitReadonlyClient,
    private readonly cache: CacheStore
  ) {}

  async getPnlReport(context: ServiceRequestContext, equityStartUsd?: number, equityEndUsd?: number): Promise<PnLReport> {
    const events: Array<Record<string, unknown>> = [];
    const chunks = splitRangeByMaxWindow(context.from, context.to);

    for (const chunk of chunks) {
      let cursor: string | undefined;

      for (let page = 0; page < 20; page += 1) {
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
        cursor = payload.nextPageCursor;
        if (!cursor) {
          break;
        }
      }
    }

    const wallet = (await this.client.getWalletBalance(context.category, context.timeoutMs)) as {
      list?: Array<Record<string, unknown>>;
    };

    const unrealizedPnlUsd = Number(wallet.list?.[0]?.totalPerpUPL ?? 0);

    return normalizePnlReport(
      { list: events },
      context.from,
      context.to,
      Number.isFinite(unrealizedPnlUsd) ? unrealizedPnlUsd : 0,
      equityStartUsd,
      equityEndUsd
    );
  }
}
