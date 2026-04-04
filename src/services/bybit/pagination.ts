export type PaginationLimitMode = "error" | "partial";

export interface PaginationLimitContext {
  endpoint: "positions" | "execution-list" | "closed-pnl";
  pageLimit: number;
  pagesFetched: number;
  nextPageCursor: string;
  chunkFrom?: string;
  chunkTo?: string;
}

function formatChunkRange(context: PaginationLimitContext): string {
  if (!context.chunkFrom || !context.chunkTo) {
    return "";
  }
  return ` for chunk ${context.chunkFrom}..${context.chunkTo}`;
}

export function buildPaginationLimitMessage(context: PaginationLimitContext): string {
  return [
    `Pagination safety limit reached for ${context.endpoint}${formatChunkRange(context)}.`,
    `Fetched ${context.pagesFetched} pages (limit=${context.pageLimit}) and API still returned nextPageCursor.`,
    "Result is incomplete. Increase pagination limit or disable safety limit."
  ].join(" ");
}

export class PaginationLimitReachedError extends Error {
  constructor(public readonly context: PaginationLimitContext) {
    super(buildPaginationLimitMessage(context));
    this.name = "PaginationLimitReachedError";
  }
}
