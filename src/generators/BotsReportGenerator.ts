import { BotsAnalyzer } from "../analyzers/orchestrators/BotsAnalyzer";
import type { BotDataService } from "../services/contracts/BotDataService";
import type { ServiceRequestContext } from "../services/contracts/AccountDataService";
import type { ReportDocument } from "../types/report.types";
import type { ReportSectionType } from "../types/report.types";
import { fmtPct, fmtUsd } from "./formatters";
import { buildDataCompletenessAlerts, createSectionBuilder } from "./reportContract";
import { createSourceMetadata } from "./sourceMetadata";

export const BOTS_SCHEMA_VERSION = "bots-markdown-v1";

export const BOTS_SECTION_CONTRACT = {
  summary: { id: "bots.summary", title: "Bot Summary", type: "kpi" },
  perBot: { id: "bots.per_bot_table", title: "Per-Bot Table", type: "table" },
  technical: { id: "bots.technical_details", title: "Technical Details", type: "table" },
  notes: { id: "bots.risk_notes", title: "Bot Risk Notes", type: "text" },
  dataCompleteness: { id: "bots.data_completeness", title: "Data Completeness", type: "alerts" }
} as const satisfies Record<string, { id: string; title: string; type: ReportSectionType }>;

export const BOTS_SECTION_ORDER = [
  "summary",
  "perBot",
  "technical",
  "notes",
  "dataCompleteness"
] as const satisfies readonly (keyof typeof BOTS_SECTION_CONTRACT)[];

const section = createSectionBuilder(BOTS_SECTION_CONTRACT);

function buildBotEmptyStateMessage(availability: "available" | "not_available" | "requires_scraping", reason?: string): string | undefined {
  if (availability === "available") {
    return undefined;
  }

  const baseMessage =
    availability === "requires_scraping"
      ? "Bot analytics require a separate scraping/integration path for the selected profile."
      : "Bot analytics are unavailable for the selected profile.";

  return reason ? `${baseMessage} ${reason}` : baseMessage;
}

function buildBotNotes(emptyStateMessage: string | undefined): string[] {
  if (!emptyStateMessage) {
    return ["Bot metrics are available via current integration."];
  }

  return [
    emptyStateMessage,
    "This run is supported, but no bot analytics can be shown until bot ids are configured or a supported bot integration is available."
  ];
}

export class BotsReportGenerator {
  private readonly analyzer = new BotsAnalyzer();

  constructor(private readonly botService: BotDataService) {}

  async generate(context: ServiceRequestContext): Promise<ReportDocument> {
    const report = await this.botService.getBotReport(context, {
      requirement: context.sourceMode === "bot" ? "required" : "optional"
    });
    const generatedAt = new Date().toISOString();
    const analysis = this.analyzer.analyze(report);
    const botEmptyStateMessage = analysis.bots.length === 0
      ? buildBotEmptyStateMessage(analysis.availability, analysis.availabilityReason)
      : undefined;

    const sections: ReportDocument["sections"] = [
      section("summary", {
        kpis: [
          { label: "Availability", value: analysis.availability },
          { label: "Reason", value: analysis.availabilityReason ?? "N/A" },
          { label: "Total Allocated", value: fmtUsd(analysis.totalAllocatedUsd) },
          { label: "Total Exposure", value: fmtUsd(analysis.totalBotExposureUsd) },
          { label: "Total Bot PnL", value: fmtUsd(analysis.totalBotPnlUsd) }
        ]
      }),
      section("perBot", {
        table: {
          headers: ["Bot", "Status", "Allocated", "Exposure", "Realized", "Unrealized", "ROI", "Open Positions"],
          rows: analysis.bots.map((bot) => [
            bot.name,
            bot.status,
            fmtUsd(bot.allocatedCapitalUsd ?? 0),
            fmtUsd(bot.exposureUsd ?? 0),
            fmtUsd(bot.realizedPnlUsd ?? 0),
            fmtUsd(bot.unrealizedPnlUsd ?? 0),
            typeof bot.roiPct === "number" ? fmtPct(bot.roiPct) : "N/A",
            String(bot.activePositionCount ?? 0)
          ]),
          emptyMessage: botEmptyStateMessage,
          emptyMode: botEmptyStateMessage ? "message_only" : undefined
        }
      }),
      section("technical", {
        table: {
          headers: ["Bot ID", "Type", "Symbol", "Side", "Leverage", "Grid Profit", "Close Reason", "Close Code"],
          rows: analysis.bots.map((bot) => [
            bot.botId,
            bot.strategyType ?? "unknown",
            bot.symbol ?? "-",
            bot.side ?? "unknown",
            typeof bot.leverage === "number" ? `${bot.leverage.toFixed(2)}x` : "-",
            fmtUsd(bot.strategyProfitUsd ?? 0),
            bot.closeReason ?? "-",
            bot.closeCode ?? "-"
          ]),
          emptyMessage: botEmptyStateMessage,
          emptyMode: botEmptyStateMessage ? "message_only" : undefined
        }
      }),
      section("notes", {
        text: buildBotNotes(botEmptyStateMessage)
      }),
      section("dataCompleteness", {
        alerts: buildDataCompletenessAlerts(report.dataCompleteness)
      })
    ];

    return {
      command: "bots",
      title: "Bots Analytics",
      schemaVersion: BOTS_SCHEMA_VERSION,
      generatedAt,
      sections,
      dataCompleteness: report.dataCompleteness,
      sources: [
        createSourceMetadata({
          id: "bot_report",
          kind: "bot_report",
          provider: report.source,
          category: context.category,
          sourceMode: context.sourceMode,
          fetchedAt: report.generatedAt,
          periodFrom: context.from,
          periodTo: context.to,
          cacheStatus: report.cacheStatus
        })
      ],
      data: analysis
    };
  }
}
