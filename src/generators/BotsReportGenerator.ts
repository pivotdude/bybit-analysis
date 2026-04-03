import { BotsAnalyzer } from "../analyzers/orchestrators/BotsAnalyzer";
import type { BotDataService } from "../services/contracts/BotDataService";
import type { ServiceRequestContext } from "../services/contracts/AccountDataService";
import type { ReportDocument } from "../types/report.types";
import { fmtPct, fmtUsd } from "./formatters";

export class BotsReportGenerator {
  private readonly analyzer = new BotsAnalyzer();

  constructor(private readonly botService: BotDataService) {}

  async generate(context: ServiceRequestContext): Promise<ReportDocument> {
    const report = await this.botService.getBotReport(context);
    const analysis = this.analyzer.analyze(report);

    return {
      command: "bots",
      title: "Bots Analytics",
      generatedAt: new Date().toISOString(),
      sections: [
        {
          title: "Bot Summary",
          type: "kpi",
          kpis: [
            { label: "Availability", value: analysis.availability },
            { label: "Reason", value: analysis.availabilityReason ?? "N/A" },
            { label: "Total Allocated", value: fmtUsd(analysis.totalAllocatedUsd) },
            { label: "Total Exposure", value: fmtUsd(analysis.totalBotExposureUsd) },
            { label: "Total Bot PnL", value: fmtUsd(analysis.totalBotPnlUsd) }
          ]
        },
        {
          title: "Per-Bot Table",
          type: "table",
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
              String(bot.openPositions ?? 0)
            ])
          }
        },
        {
          title: "Bot Risk Notes",
          type: "text",
          text: [
            analysis.availability === "available"
              ? "Bot metrics are available via current integration."
              : "Bot metrics are best-effort and may require separate scraping/integration."
          ]
        }
      ]
    };
  }
}
