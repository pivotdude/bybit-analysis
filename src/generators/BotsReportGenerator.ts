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

export class BotsReportGenerator {
  private readonly analyzer = new BotsAnalyzer();

  constructor(private readonly botService: BotDataService) {}

  async generate(context: ServiceRequestContext): Promise<ReportDocument> {
    const report = await this.botService.getBotReport(context, {
      requirement: context.sourceMode === "bot" ? "required" : "optional"
    });
    const generatedAt = new Date().toISOString();
    const analysis = this.analyzer.analyze(report);

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
          ])
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
          ])
        }
      }),
      section("notes", {
        text: [
          analysis.availability === "available"
            ? "Bot metrics are available via current integration."
            : "Bot metrics are best-effort and may require separate scraping/integration."
        ]
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
