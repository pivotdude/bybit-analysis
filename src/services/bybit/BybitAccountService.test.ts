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
  futuresGridBotIds: [],
  spotGridBotIds: [],
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
