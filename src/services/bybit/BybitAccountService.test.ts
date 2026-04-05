import { describe, expect, it } from "bun:test";
import { BybitAccountService } from "./BybitAccountService";
import type { ServiceRequestContext } from "../contracts/AccountDataService";
import type { BotDataService } from "../contracts/BotDataService";
import type { PositionDataService } from "../contracts/PositionDataService";
import type { CacheStore } from "../cache/CacheStore";
import type { BybitReadonlyClient } from "./BybitClientFactory";

function createMemoryCache(): CacheStore {
  const store = new Map<string, unknown>();
  return {
    get<T>(key: string): T | undefined {
      return store.get(key) as T | undefined;
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

    const positionsService = {} as PositionDataService;
    const botService = {} as BotDataService;
    const service = new BybitAccountService(client, positionsService, botService, createMemoryCache());

    const info = await service.getApiKeyPermissionInfo(requestContext);
    const serialized = JSON.stringify(info);

    expect(info.apiKeyStatus).toBe("present");
    expect(info.apiKeyDisplay).toBe("<redacted>");
    expect(info.ipWhitelistRestricted).toBe(true);
    expect(info.ipWhitelistCount).toBe(2);
    expect(info.ipWhitelistDisplay).toBe("configured (2 entries)");

    expect(serialized).not.toContain("live_super_secret_api_key");
    expect(serialized).not.toContain("203.0.113.10");
    expect(serialized).not.toContain("203.0.113.11");
  });
});

describe("BybitAccountService#getAccountSnapshot", () => {
  it("propagates equity history through normalizer into the domain snapshot", async () => {
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
          },
          {
            timestamp: "2026-01-01T00:00:00.000Z",
            totalEquityUsd: "1400",
            grossExposureUsd: "2000",
            netExposureUsd: "900"
          }
        ]
      })
    } as unknown as BybitReadonlyClient;

    const positionsService: PositionDataService = {
      getOpenPositions: async () => ({
        source: "bybit",
        exchange: "bybit",
        positions: [],
        dataCompleteness: {
          state: "complete",
          partial: false,
          warnings: [],
          issues: []
        }
      })
    };

    const botService = {} as BotDataService;
    const service = new BybitAccountService(client, positionsService, botService, createMemoryCache());
    const snapshot = await service.getAccountSnapshot(requestContext);

    expect(snapshot.equityHistory?.map((item) => item.timestamp)).toEqual([
      "2026-01-01T00:00:00.000Z",
      "2026-01-02T00:00:00.000Z"
    ]);
    expect(snapshot.equityHistory?.[0]?.grossExposureUsd).toBe(2000);
    expect(snapshot.equityHistory?.[1]?.grossExposureUsd).toBe(2400);
  });

  it("requests required bot data in bot source mode", async () => {
    let requirement: string | undefined;
    const client = {} as BybitReadonlyClient;

    const positionsService: PositionDataService = {
      getOpenPositions: async () => ({
        source: "bybit",
        exchange: "bybit",
        positions: [],
        dataCompleteness: {
          state: "complete",
          partial: false,
          warnings: [],
          issues: []
        }
      })
    };

    const botService: BotDataService = {
      getBotReport: async (_context, options) => {
        requirement = options?.requirement;
        return {
          source: "bybit",
          generatedAt: new Date().toISOString(),
          availability: "available",
          bots: [
            {
              botId: "fgrid-1",
              name: "BTC Grid",
              status: "running",
              quoteAsset: "USDT",
              allocatedCapitalUsd: 100,
              availableBalanceUsd: 80,
              equityUsd: 110,
              unrealizedPnlUsd: 10
            }
          ],
          totalAllocatedUsd: 100,
          dataCompleteness: {
            state: "complete",
            partial: false,
            warnings: [],
            issues: []
          }
        };
      }
    };

    const service = new BybitAccountService(client, positionsService, botService, createMemoryCache());
    const snapshot = await service.getAccountSnapshot({
      ...requestContext,
      sourceMode: "bot",
      providerContext: { bybit: { botStrategyIds: { futuresGridBotIds: ["fgrid-1"], spotGridBotIds: [] } } }
    });

    expect(requirement).toBe("required");
    expect(snapshot.walletBalanceUsd).toBe(100);
    expect(snapshot.totalEquityUsd).toBe(110);
    expect(snapshot.balances).toEqual([]);
    expect(snapshot.botCapital).toEqual([
      {
        asset: "USDT",
        allocatedCapitalUsd: 100,
        availableBalanceUsd: 80,
        equityUsd: 110
      }
    ]);
  });
});
