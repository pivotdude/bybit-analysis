import { describe, expect, it } from "bun:test";
import { BotsReportGenerator } from "./BotsReportGenerator";
import type { BotDataService } from "../services/contracts/BotDataService";
import type { ServiceRequestContext } from "../services/contracts/AccountDataService";

const context: ServiceRequestContext = {
  category: "spot",
  sourceMode: "market",
  providerContext: { bybit: { botStrategyIds: { futuresGridBotIds: [], spotGridBotIds: [] } } },
  from: "2026-01-01T00:00:00.000Z",
  to: "2026-01-31T00:00:00.000Z",
  timeoutMs: 5_000
};

describe("BotsReportGenerator", () => {
  it("renders an explanatory empty state when bot ids are not configured", async () => {
    const botService: BotDataService = {
      getBotReport: async () => ({
        source: "bybit",
        generatedAt: "2026-01-31T00:00:00.000Z",
        availability: "not_available",
        availabilityReason:
          "Provide --fgrid-bot-ids and/or --spot-grid-ids (or env BYBIT_FGRID_BOT_IDS/BYBIT_SPOT_GRID_IDS)",
        bots: [],
        cacheStatus: "unknown",
        dataCompleteness: {
          state: "complete",
          partial: false,
          warnings: [],
          issues: []
        }
      })
    };

    const report = await new BotsReportGenerator(botService).generate(context);
    const perBotSection = report.sections.find((section) => section.id === "bots.per_bot_table");
    const technicalSection = report.sections.find((section) => section.id === "bots.technical_details");
    const notesSection = report.sections.find((section) => section.id === "bots.risk_notes");

    expect(perBotSection?.type).toBe("table");
    expect(perBotSection && perBotSection.type === "table" ? perBotSection.table.rows : undefined).toEqual([]);
    expect(perBotSection && perBotSection.type === "table" ? perBotSection.table.emptyMode : undefined).toBe("message_only");
    expect(perBotSection && perBotSection.type === "table" ? perBotSection.table.emptyMessage : undefined).toBe(
      "Bot analytics are unavailable for the selected profile. Provide --fgrid-bot-ids and/or --spot-grid-ids (or env BYBIT_FGRID_BOT_IDS/BYBIT_SPOT_GRID_IDS)"
    );

    expect(technicalSection?.type).toBe("table");
    expect(technicalSection && technicalSection.type === "table" ? technicalSection.table.emptyMode : undefined).toBe(
      "message_only"
    );
    expect(technicalSection && technicalSection.type === "table" ? technicalSection.table.emptyMessage : undefined).toBe(
      "Bot analytics are unavailable for the selected profile. Provide --fgrid-bot-ids and/or --spot-grid-ids (or env BYBIT_FGRID_BOT_IDS/BYBIT_SPOT_GRID_IDS)"
    );

    expect(notesSection?.type).toBe("text");
    expect(notesSection && notesSection.type === "text" ? notesSection.text : undefined).toEqual([
      "Bot analytics are unavailable for the selected profile. Provide --fgrid-bot-ids and/or --spot-grid-ids (or env BYBIT_FGRID_BOT_IDS/BYBIT_SPOT_GRID_IDS)",
      "This run is supported, but no bot analytics can be shown until bot ids are configured or a supported bot integration is available."
    ]);
  });

  it("keeps normal bot tables populated when analytics are available", async () => {
    const botService: BotDataService = {
      getBotReport: async () => ({
        source: "bybit",
        generatedAt: "2026-01-31T00:00:00.000Z",
        availability: "available",
        bots: [
          {
            botId: "grid-1",
            name: "BTC grid",
            strategyType: "spot_grid",
            symbol: "BTCUSDT",
            status: "running",
            side: "neutral",
            leverage: 2,
            allocatedCapitalUsd: 100,
            exposureUsd: 120,
            realizedPnlUsd: 10,
            unrealizedPnlUsd: 5,
            strategyProfitUsd: 15,
            roiPct: 15,
            activePositionCount: 1
          }
        ],
        totalAllocatedUsd: 100,
        totalBotExposureUsd: 120,
        totalBotPnlUsd: 15,
        cacheStatus: "miss",
        dataCompleteness: {
          state: "complete",
          partial: false,
          warnings: [],
          issues: []
        }
      })
    };

    const report = await new BotsReportGenerator(botService).generate(context);
    const perBotSection = report.sections.find((section) => section.id === "bots.per_bot_table");
    const technicalSection = report.sections.find((section) => section.id === "bots.technical_details");
    const notesSection = report.sections.find((section) => section.id === "bots.risk_notes");

    expect(perBotSection?.type).toBe("table");
    expect(perBotSection && perBotSection.type === "table" ? perBotSection.table.rows : undefined).toEqual([
      ["BTC grid", "running", "$100.00", "$120.00", "$10.00", "$5.00", "15.00%", "1"]
    ]);
    expect(perBotSection && perBotSection.type === "table" ? perBotSection.table.emptyMessage : undefined).toBeUndefined();

    expect(technicalSection?.type).toBe("table");
    expect(technicalSection && technicalSection.type === "table" ? technicalSection.table.rows : undefined).toEqual([
      ["grid-1", "spot_grid", "BTCUSDT", "neutral", "2.00x", "$15.00", "-", "-"]
    ]);

    expect(notesSection?.type).toBe("text");
    expect(notesSection && notesSection.type === "text" ? notesSection.text : undefined).toEqual([
      "Bot metrics are available via current integration."
    ]);
  });
});
