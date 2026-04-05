import { describe, expect, it } from "bun:test";
import { BybitAccountService } from "./BybitAccountService";
import type { ServiceRequestContext } from "../contracts/AccountDataService";
import type { CacheStore } from "../cache/CacheStore";
import type { BybitReadonlyClient } from "./BybitClientFactory";

function createMemoryCache(): CacheStore {
  const store = new Map<string, unknown>();
  return {
    get<T>(key: string): T | undefined {
      return store.get(key) as T | undefined;
    },
    getWithStatus<T>(key: string) {
      const value = store.get(key) as T | undefined;
      return {
        value,
        status: value === undefined ? "miss" : "hit"
      } as const;
    },
    set<T>(key: string, value: T): void {
      store.set(key, value);
    },
    delete(key: string): void {
      store.delete(key);
    },
    clear(): void {
      store.clear();
    }
  };
}

const requestContext: ServiceRequestContext = {
  category: "linear",
  sourceMode: "market",
  providerContext: { bybit: { botStrategyIds: { futuresGridBotIds: [], spotGridBotIds: [] } } },
  from: "2026-01-01T00:00:00.000Z",
  to: "2026-02-01T00:00:00.000Z",
  timeoutMs: 5_000
};

describe("BybitAccountService#getApiKeyPermissionInfo", () => {
  it("reports cache hit on repeated api key info fetch", async () => {
    const client = {
      getApiKeyInfo: async () => ({
        apiKey: "live_super_secret_api_key",
        readOnly: "1",
        permissions: {}
      })
    } as unknown as BybitReadonlyClient;

    const cache = createMemoryCache();
    const service = new BybitAccountService(client, cache);
    await service.getApiKeyPermissionInfo(requestContext);
    const info = await service.getApiKeyPermissionInfo(requestContext);

    expect(info.cacheStatus).toBe("hit");
  });

  it("returns sanitized credential-adjacent fields", async () => {
    const client = {
      getApiKeyInfo: async () => ({
        apiKey: "live_super_secret_api_key",
        note: "ops-key",
        readOnly: "0",
        isMaster: "1",
        ips: ["203.0.113.10", "203.0.113.11"],
        permissions: {
          Spot: ["SpotTrade"],
          ContractTrade: ["Order", "Position"]
        }
      })
    } as unknown as BybitReadonlyClient;

    const service = new BybitAccountService(client, createMemoryCache());

    const info = await service.getApiKeyPermissionInfo(requestContext);
    const serialized = JSON.stringify(info);

    expect(info.apiKeyStatus).toBe("present");
    expect(info.apiKeyDisplay).toBe("<redacted>");
    expect(info.ipWhitelistRestricted).toBe(true);
    expect(info.ipWhitelistCount).toBe(2);
    expect(info.ipWhitelistDisplay).toBe("configured (2 entries)");

    expect(info.cacheStatus).toBe("miss");
    expect(serialized).not.toContain("live_super_secret_api_key");
    expect(serialized).not.toContain("203.0.113.10");
    expect(serialized).not.toContain("203.0.113.11");
  });
});

describe("BybitAccountService#checkHealth", () => {
  it("reports cache miss then hit for server time health source", async () => {
    const client = {
      getServerTime: async () => ({ timeNano: "0", timeSecond: "1706659200" }),
      getWalletBalance: async () => ({ list: [{ totalPerpUPL: "0" }] })
    } as unknown as BybitReadonlyClient;

    const cache = createMemoryCache();
    const service = new BybitAccountService(client, cache);
    const first = await service.checkHealth(requestContext);
    const second = await service.checkHealth(requestContext);

    expect(first.cacheStatus).toBe("miss");
    expect(second.cacheStatus).toBe("hit");
  });
});

describe("BybitAccountService#getWalletSnapshot", () => {
  it("reports cache hit on repeated wallet snapshot fetch", async () => {
    const client = {
      getWalletBalance: async () => ({
        list: [
          {
            accountType: "UNIFIED",
            totalEquity: "1500",
            totalWalletBalance: "1400",
            totalAvailableBalance: "1200",
            totalPerpUPL: "100"
          }
        ]
      })
    } as unknown as BybitReadonlyClient;

    const cache = createMemoryCache();
    const service = new BybitAccountService(client, cache);
    await service.getWalletSnapshot(requestContext);
    const snapshot = await service.getWalletSnapshot(requestContext);

    expect(snapshot.cacheStatus).toBe("hit");
  });

  it("marks ROI/capital efficiency as unsupported when historical equity source is unavailable", async () => {
    const client = {
      getWalletBalance: async () => ({
        list: [
          {
            accountType: "UNIFIED",
            totalEquity: "1500",
            totalWalletBalance: "1400",
            totalAvailableBalance: "1200",
            totalPerpUPL: "100"
          }
        ],
        equityHistory: [
          {
            timestamp: "2026-01-02T00:00:00.000Z",
            totalEquityUsd: "1450",
            grossExposureUsd: "2400",
            netExposureUsd: "1000"
          }
        ]
      })
    } as unknown as BybitReadonlyClient;

    const service = new BybitAccountService(client, createMemoryCache());
    const snapshot = await service.getWalletSnapshot(requestContext);

    expect(snapshot.equityHistory).toBeUndefined();
    expect(snapshot.cacheStatus).toBe("miss");
    expect(snapshot.dataCompleteness.state).toBe("unsupported");
    expect(snapshot.dataCompleteness.issues.some((issue) => issue.code === "unsupported_feature")).toBe(true);
    expect(snapshot.dataCompleteness.warnings.some((warning) => warning.includes("historical equity source is unavailable"))).toBe(
      true
    );
  });

  it("keeps account balance semantics unchanged in bot source mode", async () => {
    const client = {
      getWalletBalance: async () => ({
        list: [
          {
            accountType: "UNIFIED",
            totalEquity: "1500",
            totalWalletBalance: "1400",
            totalAvailableBalance: "1200",
            totalPerpUPL: "100"
          }
        ]
      })
    } as unknown as BybitReadonlyClient;

    const service = new BybitAccountService(client, createMemoryCache());
    const snapshot = await service.getWalletSnapshot({
      ...requestContext,
      sourceMode: "bot",
      providerContext: { bybit: { botStrategyIds: { futuresGridBotIds: ["fgrid-1"], spotGridBotIds: [] } } }
    });

    expect(snapshot.walletBalanceUsd).toBe(1400);
    expect(snapshot.cacheStatus).toBe("miss");
    expect(snapshot.totalEquityUsd).toBe(1500);
    expect(snapshot.availableBalanceUsd).toBe(1200);
    expect(snapshot.balances).toEqual([]);
    expect(snapshot.equityHistory).toBeUndefined();
    expect(snapshot.dataCompleteness.state).toBe("unsupported");
    expect(snapshot.dataCompleteness.issues.some((issue) => issue.code === "unsupported_feature")).toBe(true);
  });
});
