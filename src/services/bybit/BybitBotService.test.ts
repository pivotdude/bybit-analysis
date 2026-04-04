import { describe, expect, it } from "bun:test";
import { MemoryCacheStore } from "../cache/MemoryCacheStore";
import type { ServiceRequestContext } from "../contracts/AccountDataService";
import type { BybitReadonlyClient } from "./BybitClientFactory";
import { BybitBotService } from "./BybitBotService";

const context: ServiceRequestContext = {
  category: "bot",
  futuresGridBotIds: ["f-ok", "f-fail"],
  spotGridBotIds: [],
  from: "2026-01-01T00:00:00.000Z",
  to: "2026-01-31T00:00:00.000Z",
  timeoutMs: 5_000
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

  it("returns not_available (without throw) when all bot detail calls fail", async () => {
    const client = {
      getFuturesGridBotDetail: async () => {
        throw new Error("auth error");
      },
      getSpotGridBotDetail: async () => {
        throw new Error("auth error");
      }
    } as unknown as BybitReadonlyClient;

    const service = new BybitBotService(client, new MemoryCacheStore());
    const report = await service.getBotReport(context);

    expect(report.availability).toBe("not_available");
    expect(report.bots).toHaveLength(0);
    expect(report.dataCompleteness.partial).toBe(true);
  });
});
