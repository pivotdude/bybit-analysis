import { describe, expect, it } from "bun:test";
import { MemoryCacheStore } from "../cache/MemoryCacheStore";
import type { ServiceRequestContext } from "../contracts/AccountDataService";
import { RequiredBotDataUnavailableError } from "../contracts/BotDataService";
import type { BybitReadonlyClient } from "./BybitClientFactory";
import { BybitBotService } from "./BybitBotService";
import { buildBybitProviderContext } from "./bybitProviderContext";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(predicate: () => boolean, timeoutMs: number = 1_000): Promise<void> {
  const startedAt = Date.now();
  while (Date.now() - startedAt <= timeoutMs) {
    if (predicate()) {
      return;
    }
    await sleep(1);
  }

  throw new Error(`Condition was not met within ${timeoutMs}ms`);
}

function createFuturesGridDetail(symbol: string): { detail: Record<string, string> } {
  return {
    detail: {
      symbol,
      status: "RUNNING",
      total_investment: "100",
      total_value: "120",
      unrealised_pnl: "20",
      realised_pnl: "0",
      current_position: "1",
      mark_price: "120"
    }
  };
}

const context: ServiceRequestContext = {
  category: "linear",
  sourceMode: "bot",
  providerContext: buildBybitProviderContext({ futuresGridBotIds: ["f-ok", "f-fail"], spotGridBotIds: [] }),
  from: "2026-01-01T00:00:00.000Z",
  to: "2026-01-31T00:00:00.000Z",
  timeoutMs: 5_000
};

const optionalLinearContext: ServiceRequestContext = {
  ...context,
  sourceMode: "market"
};

const optionalSpotContext: ServiceRequestContext = {
  ...optionalLinearContext,
  category: "spot"
};

describe("BybitBotService partial failures", () => {
  it("degrades when one bot detail fails and keeps successful bots", async () => {
    const client = {
      getFuturesGridBotDetail: async (botId: string) => {
        if (botId === "f-fail") {
          throw new Error("permission denied");
        }
        return {
          detail: {
            symbol: "BTCUSDT",
            status: "RUNNING",
            total_investment: "100",
            total_value: "120",
            unrealised_pnl: "20",
            realised_pnl: "0",
            current_position: "1",
            mark_price: "120"
          }
        };
      },
      getSpotGridBotDetail: async () => ({ detail: {} })
    } as unknown as BybitReadonlyClient;

    const service = new BybitBotService(client, new MemoryCacheStore());
    const report = await service.getBotReport(context);

    expect(report.bots).toHaveLength(1);
    expect(report.dataCompleteness.partial).toBe(true);
    expect(report.dataCompleteness.issues[0]?.code).toBe("optional_item_failed");
    expect(report.availability).toBe("available");
  });

  it("fails closed in bot mode when all bot detail calls fail", async () => {
    const client = {
      getFuturesGridBotDetail: async () => {
        throw new Error("auth error");
      },
      getSpotGridBotDetail: async () => {
        throw new Error("auth error");
      }
    } as unknown as BybitReadonlyClient;

    const service = new BybitBotService(client, new MemoryCacheStore());
    await expect(service.getBotReport(context)).rejects.toBeInstanceOf(RequiredBotDataUnavailableError);
    await expect(service.getBotReport(context)).rejects.toThrow("required-input-failed");
  });

  it("fails closed in bot mode when no bot strategy ids are configured", async () => {
    const client = {
      getFuturesGridBotDetail: async () => createFuturesGridDetail("BTCUSDT"),
      getSpotGridBotDetail: async () => ({ detail: {} })
    } as unknown as BybitReadonlyClient;

    const service = new BybitBotService(client, new MemoryCacheStore());
    await expect(
      service.getBotReport({
        ...context,
        providerContext: buildBybitProviderContext({ futuresGridBotIds: [], spotGridBotIds: [] })
      })
    ).rejects.toBeInstanceOf(RequiredBotDataUnavailableError);
    await expect(
      service.getBotReport({
        ...context,
        providerContext: buildBybitProviderContext({ futuresGridBotIds: [], spotGridBotIds: [] })
      })
    ).rejects.toThrow("required-input-failed");
  });

  it("keeps full bot-detail failure optional for linear/spot market mode enrichment", async () => {
    const client = {
      getFuturesGridBotDetail: async () => {
        throw new Error("auth error");
      },
      getSpotGridBotDetail: async () => {
        throw new Error("auth error");
      }
    } as unknown as BybitReadonlyClient;

    const service = new BybitBotService(client, new MemoryCacheStore());
    const [linearReport, spotReport] = await Promise.all([
      service.getBotReport(optionalLinearContext, { requirement: "optional" }),
      service.getBotReport(optionalSpotContext, { requirement: "optional" })
    ]);

    expect(linearReport.availability).toBe("not_available");
    expect(linearReport.bots).toHaveLength(0);
    expect(linearReport.dataCompleteness.partial).toBe(true);

    expect(spotReport.availability).toBe("not_available");
    expect(spotReport.bots).toHaveLength(0);
    expect(spotReport.dataCompleteness.partial).toBe(true);
  });

  it("keeps missing bot IDs optional for market mode enrichment", async () => {
    const client = {
      getFuturesGridBotDetail: async () => createFuturesGridDetail("BTCUSDT"),
      getSpotGridBotDetail: async () => ({ detail: {} })
    } as unknown as BybitReadonlyClient;

    const service = new BybitBotService(client, new MemoryCacheStore());
    const report = await service.getBotReport({
      ...optionalLinearContext,
      providerContext: buildBybitProviderContext({ futuresGridBotIds: [], spotGridBotIds: [] })
    });

    expect(report.availability).toBe("not_available");
    expect(report.bots).toHaveLength(0);
    expect(report.dataCompleteness.partial).toBe(false);
  });

  it("loads bot details with bounded concurrency instead of strict serial execution", async () => {
    const futuresGridBotIds = ["f-1", "f-2", "f-3", "f-4", "f-5"];
    const started: string[] = [];
    const deferredResolves = new Map<string, () => void>();
    let inFlight = 0;
    let maxInFlight = 0;

    const client = {
      getFuturesGridBotDetail: async (botId: string) => {
        started.push(botId);
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);

        await new Promise<void>((resolve) => {
          deferredResolves.set(botId, () => {
            inFlight -= 1;
            resolve();
          });
        });

        return createFuturesGridDetail(`SYM-${botId}`);
      },
      getSpotGridBotDetail: async () => ({ detail: {} })
    } as unknown as BybitReadonlyClient;

    const service = new BybitBotService(client, new MemoryCacheStore());
    const reportPromise = service.getBotReport({
      ...context,
      providerContext: buildBybitProviderContext({ futuresGridBotIds, spotGridBotIds: [] })
    });

    await waitFor(() => started.length === 3);
    expect(maxInFlight).toBeGreaterThan(1);
    expect(maxInFlight).toBe(3);

    deferredResolves.get("f-1")?.();
    deferredResolves.get("f-2")?.();
    deferredResolves.get("f-3")?.();

    await waitFor(() => started.length === 5);
    expect(maxInFlight).toBe(3);

    deferredResolves.get("f-4")?.();
    deferredResolves.get("f-5")?.();

    const report = await reportPromise;
    expect(report.bots).toHaveLength(5);
    expect(report.dataCompleteness.partial).toBe(false);
  });
});
