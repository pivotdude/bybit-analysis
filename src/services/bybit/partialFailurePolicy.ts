import type { DataCompletenessIssue, DataCompletenessScope, DataCriticality } from "../../types/domain.types";

export type BybitPartialFailureDataType =
  | "bot_detail"
  | "positions"
  | "closed_pnl"
  | "execution_window"
  | "opening_inventory";

interface PartialFailurePolicy {
  criticality: DataCriticality;
  partialOnFailure: "never" | "per_item" | "after_first_page";
}

export const DEFAULT_PAGE_FETCH_ATTEMPTS = 3;

export const BYBIT_PARTIAL_FAILURE_POLICY: Record<BybitPartialFailureDataType, PartialFailurePolicy> = {
  bot_detail: {
    criticality: "optional",
    partialOnFailure: "per_item"
  },
  positions: {
    criticality: "critical",
    partialOnFailure: "after_first_page"
  },
  closed_pnl: {
    criticality: "critical",
    partialOnFailure: "after_first_page"
  },
  execution_window: {
    criticality: "critical",
    partialOnFailure: "after_first_page"
  },
  opening_inventory: {
    criticality: "optional",
    partialOnFailure: "after_first_page"
  }
};

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

export async function runWithRetries<T>(fetcher: () => Promise<T>, attempts: number = DEFAULT_PAGE_FETCH_ATTEMPTS): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fetcher();
    } catch (error) {
      lastError = error;
      if (attempt >= attempts) {
        break;
      }
    }
  }

  throw lastError;
}

export function buildPageFetchIssue(args: {
  scope: DataCompletenessScope;
  criticality: DataCriticality;
  page: number;
  cursor?: string;
  retries: number;
  error: unknown;
}): DataCompletenessIssue {
  const cursorMessage = args.cursor ? ` (cursor=${args.cursor})` : "";
  return {
    code: "page_fetch_failed",
    scope: args.scope,
    severity: "warning",
    criticality: args.criticality,
    message: `Failed to fetch page ${args.page}${cursorMessage} after ${args.retries} attempts: ${toErrorMessage(args.error)}`
  };
}

export function buildOptionalItemIssue(args: {
  scope: DataCompletenessScope;
  message: string;
}): DataCompletenessIssue {
  return {
    code: "optional_item_failed",
    scope: args.scope,
    severity: "warning",
    criticality: "optional",
    message: args.message
  };
}

export function buildPaginationIssue(args: {
  scope: DataCompletenessScope;
  criticality: DataCriticality;
  message: string;
}): DataCompletenessIssue {
  return {
    code: "pagination_limit_reached",
    scope: args.scope,
    severity: "warning",
    criticality: args.criticality,
    message: args.message
  };
}

export function buildInvalidWindowIssue(args: {
  scope: DataCompletenessScope;
  criticality: DataCriticality;
  message: string;
}): DataCompletenessIssue {
  return {
    code: "invalid_request_window",
    scope: args.scope,
    severity: "warning",
    criticality: args.criticality,
    message: args.message
  };
}

export function buildSpotCostBasisIssue(message: string): DataCompletenessIssue {
  return {
    code: "spot_cost_basis_incomplete",
    scope: "opening_inventory",
    severity: "warning",
    criticality: "optional",
    message
  };
}
