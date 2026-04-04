import { describe, expect, it } from "bun:test";
import { resolveRuntimeConfig } from "./config";

function daySpan(fromIso: string, toIso: string): number {
  const ms = new Date(toIso).getTime() - new Date(fromIso).getTime();
  return Math.round(ms / (24 * 60 * 60 * 1000));
}

describe("resolveRuntimeConfig env contract", () => {
  it("resolves supported BYBIT_* runtime env vars", () => {
    const config = resolveRuntimeConfig(
      {},
      {
        BYBIT_CATEGORY: "spot",
        BYBIT_SOURCE_MODE: "market",
        BYBIT_FORMAT: "compact",
        BYBIT_TIMEOUT_MS: "15000",
        BYBIT_WINDOW: "14d"
      }
    );

    expect(config.category).toBe("spot");
    expect(config.sourceMode).toBe("market");
    expect(config.format).toBe("compact");
    expect(config.timeoutMs).toBe(15_000);
    expect(daySpan(config.timeRange.from, config.timeRange.to)).toBe(14);
    expect(config.sources.category).toBe("env");
    expect(config.sources.sourceMode).toBe("env");
    expect(config.sources.format).toBe("env");
    expect(config.sources.timeoutMs).toBe("env");
    expect(config.sources.timeRange).toBe("env");
  });

  it("keeps CLI args higher-priority than env", () => {
    const config = resolveRuntimeConfig(
      {
        sourceMode: "bot",
        format: "md",
        timeoutMs: 9000,
        window: "7d"
      },
      {
        BYBIT_CATEGORY: "spot",
        BYBIT_SOURCE_MODE: "market",
        BYBIT_FORMAT: "compact",
        BYBIT_TIMEOUT_MS: "15000",
        BYBIT_WINDOW: "30d"
      }
    );

    expect(config.category).toBe("spot");
    expect(config.sourceMode).toBe("bot");
    expect(config.format).toBe("md");
    expect(config.timeoutMs).toBe(9000);
    expect(daySpan(config.timeRange.from, config.timeRange.to)).toBe(7);
    expect(config.sources.category).toBe("env");
    expect(config.sources.sourceMode).toBe("cli");
    expect(config.sources.format).toBe("cli");
    expect(config.sources.timeoutMs).toBe("cli");
    expect(config.sources.timeRange).toBe("cli");
  });

  it("does not read removed legacy env aliases", () => {
    const config = resolveRuntimeConfig(
      {},
      {
        WINDOW: "7d",
        DEFAULT_CATEGORY: "spot",
        DEFAULT_FORMAT: "compact",
        DEFAULT_TIMEOUT_MS: "25000"
      }
    );

    expect(config.category).toBe("linear");
    expect(config.sourceMode).toBe("market");
    expect(config.format).toBe("md");
    expect(config.timeoutMs).toBe(10_000);
    expect(daySpan(config.timeRange.from, config.timeRange.to)).toBe(30);
    expect(config.sources.category).toBe("default");
    expect(config.sources.sourceMode).toBe("default");
    expect(config.sources.format).toBe("default");
    expect(config.sources.timeoutMs).toBe("default");
    expect(config.sources.timeRange).toBe("default");
  });
});
