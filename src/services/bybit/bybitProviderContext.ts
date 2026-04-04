import type { ServiceRequestContext } from "../contracts/AccountDataService";

export const BYBIT_PROVIDER_CONTEXT_KEY = "bybit" as const;
export const BYBIT_BOT_IDS_REQUIRED_MESSAGE =
  "For --source bot provide --fgrid-bot-ids and/or --spot-grid-ids";

export interface BybitBotStrategyIds {
  futuresGridBotIds: string[];
  spotGridBotIds: string[];
}

export function buildBybitProviderContext(input: BybitBotStrategyIds): Record<string, unknown> {
  return {
    [BYBIT_PROVIDER_CONTEXT_KEY]: {
      botStrategyIds: {
        futuresGridBotIds: [...input.futuresGridBotIds],
        spotGridBotIds: [...input.spotGridBotIds]
      }
    }
  };
}

function toStringList(input: unknown): string[] {
  if (!Array.isArray(input)) {
    return [];
  }
  return input
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter((item) => item.length > 0);
}

export function getBybitBotStrategyIds(providerContext?: Record<string, unknown>): BybitBotStrategyIds {
  const bybitContext = providerContext?.[BYBIT_PROVIDER_CONTEXT_KEY];
  if (!bybitContext || typeof bybitContext !== "object" || Array.isArray(bybitContext)) {
    return {
      futuresGridBotIds: [],
      spotGridBotIds: []
    };
  }

  const botStrategyIds = (bybitContext as Record<string, unknown>).botStrategyIds;
  if (!botStrategyIds || typeof botStrategyIds !== "object" || Array.isArray(botStrategyIds)) {
    return {
      futuresGridBotIds: [],
      spotGridBotIds: []
    };
  }

  const botIds = botStrategyIds as Record<string, unknown>;
  return {
    futuresGridBotIds: toStringList(botIds.futuresGridBotIds),
    spotGridBotIds: toStringList(botIds.spotGridBotIds)
  };
}

export function hasBybitBotStrategyIds(providerContext?: Record<string, unknown>): boolean {
  const ids = getBybitBotStrategyIds(providerContext);
  return ids.futuresGridBotIds.length > 0 || ids.spotGridBotIds.length > 0;
}

export function validateBybitRequestContext(context: ServiceRequestContext): void {
  if (context.sourceMode !== "bot") {
    return;
  }

  if (!hasBybitBotStrategyIds(context.providerContext)) {
    throw new Error(BYBIT_BOT_IDS_REQUIRED_MESSAGE);
  }
}

function summarizeConfiguredIds(ids: string[]): string {
  if (ids.length === 0) {
    return "<none>";
  }
  const suffix = ids.length === 1 ? "id" : "ids";
  return `configured (${ids.length} ${suffix})`;
}

export function describeBybitProviderContext(providerContext: Record<string, unknown>, diagnostic: boolean): string {
  const ids = getBybitBotStrategyIds(providerContext);
  if (diagnostic) {
    const futures = ids.futuresGridBotIds.join(",") || "<none>";
    const spot = ids.spotGridBotIds.join(",") || "<none>";
    return `bybit.botStrategyIds.futuresGridBotIds=${futures}; bybit.botStrategyIds.spotGridBotIds=${spot}`;
  }

  return [
    `bybit.futuresGridBotIds=${summarizeConfiguredIds(ids.futuresGridBotIds)}`,
    `bybit.spotGridBotIds=${summarizeConfiguredIds(ids.spotGridBotIds)}`
  ].join("; ");
}
