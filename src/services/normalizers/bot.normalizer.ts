import type { BotReport } from "../../types/domain.types";

export function normalizeBotReport(): BotReport {
  return {
    source: "bybit",
    generatedAt: new Date().toISOString(),
    availability: "not_available",
    availabilityReason: "Bybit public API does not provide a stable read-only bots endpoint",
    bots: []
  };
}
