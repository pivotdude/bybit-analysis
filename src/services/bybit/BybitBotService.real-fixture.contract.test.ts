import { describe, expect, it } from "bun:test";
import { MemoryCacheStore } from "../cache/MemoryCacheStore";
import type { ServiceRequestContext } from "../contracts/AccountDataService";
import type { BybitReadonlyClient } from "./BybitClientFactory";
import { BybitBotService } from "./BybitBotService";
import { buildBybitProviderContext } from "./bybitProviderContext";
import { loadRealBybitFixture } from "./realFixtureLoader.test-util";

const baseContext: ServiceRequestContext = {
  category: "linear",
  sourceMode: "bot",
  providerContext: buildBybitProviderContext({ futuresGridBotIds: ["f-core", "f-malformed"], spotGridBotIds: ["s-core"] }),
  from: "2026-01-01T00:00:00.000Z",
  to: "2026-01-31T00:00:00.000Z",
  timeoutMs: 5_000
};

describe("BybitBotService real fixture contracts", () => {
  it("normalizes futures and spot bot detail captures in one mixed strategy report", async () => {
    const futuresCore = await loadRealBybitFixture<Record<string, unknown>>("fgridbot-detail.core");
    const futuresMalformed = await loadRealBybitFixture<Record<string, unknown>>("fgridbot-detail.malformed");
    const spotCore = await loadRealBybitFixture<Record<string, unknown>>("spot-grid-detail.core");

    const client = {
      getFuturesGridBotDetail: async (botId: string) => (botId === "f-core" ? futuresCore : futuresMalformed),
      getSpotGridBotDetail: async () => spotCore
    } as unknown as BybitReadonlyClient;

    const service = new BybitBotService(client, new MemoryCacheStore());
    const report = await service.getBotReport(baseContext);

    expect(report.bots).toHaveLength(3);
    expect(report.bots.find((bot) => bot.botId === "f-core")?.strategyType).toBe("futures_grid");
    expect(report.bots.find((bot) => bot.botId === "s-core")?.strategyType).toBe("spot_grid");
    expect(report.bots.find((bot) => bot.botId === "f-malformed")?.name).toBe("futures-grid:f-malformed");
    expect(report.bots.find((bot) => bot.botId === "f-malformed")?.status).toBe("unknown");
    expect(report.dataCompleteness.partial).toBe(false);
  });

  it("keeps contract-safe empty availability when bot ids are not configured", async () => {
    const client = {
      getFuturesGridBotDetail: async () => ({ detail: {} }),
      getSpotGridBotDetail: async () => ({ detail: {} })
    } as unknown as BybitReadonlyClient;

    const service = new BybitBotService(client, new MemoryCacheStore());
    const report = await service.getBotReport(
      {
        ...baseContext,
        sourceMode: "market",
        providerContext: buildBybitProviderContext({ futuresGridBotIds: [], spotGridBotIds: [] })
      },
      { requirement: "optional" }
    );

    expect(report.availability).toBe("not_available");
    expect(report.bots).toEqual([]);
    expect(report.dataCompleteness.partial).toBe(false);
  });

  it("marks report partial when one fixture-backed bot detail call fails", async () => {
    const futuresCore = await loadRealBybitFixture<Record<string, unknown>>("fgridbot-detail.core");
    const spotCore = await loadRealBybitFixture<Record<string, unknown>>("spot-grid-detail.core");

    const client = {
      getFuturesGridBotDetail: async () => futuresCore,
      getSpotGridBotDetail: async (botId: string) => {
        if (botId === "s-fail") {
          throw new Error("upstream detail denied");
        }
        return spotCore;
      }
    } as unknown as BybitReadonlyClient;

    const service = new BybitBotService(client, new MemoryCacheStore());
    const report = await service.getBotReport({
      ...baseContext,
      providerContext: buildBybitProviderContext({ futuresGridBotIds: ["f-core"], spotGridBotIds: ["s-core", "s-fail"] })
    });

    expect(report.bots).toHaveLength(2);
    expect(report.dataCompleteness.partial).toBe(true);
    expect(report.dataCompleteness.issues[0]?.code).toBe("optional_item_failed");
  });

  it("tolerates malformed spot-grid payloads and preserves schema", async () => {
    const futuresCore = await loadRealBybitFixture<Record<string, unknown>>("fgridbot-detail.core");
    const spotMalformed = await loadRealBybitFixture<Record<string, unknown>>("spot-grid-detail.malformed");

    const client = {
      getFuturesGridBotDetail: async () => futuresCore,
      getSpotGridBotDetail: async () => spotMalformed
    } as unknown as BybitReadonlyClient;

    const service = new BybitBotService(client, new MemoryCacheStore());
    const report = await service.getBotReport({
      ...baseContext,
      providerContext: buildBybitProviderContext({ futuresGridBotIds: ["f-core"], spotGridBotIds: ["s-malformed"] })
    });

    const malformedBot = report.bots.find((bot) => bot.botId === "s-malformed");
    expect(malformedBot?.name).toBe("spot-grid:s-malformed");
    expect(malformedBot?.status).toBe("unknown");
    expect(malformedBot?.realizedPnlUsd).toBe(0);
    expect(malformedBot?.unrealizedPnlUsd).toBe(0);
  });
});
