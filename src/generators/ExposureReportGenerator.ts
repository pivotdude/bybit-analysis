import { ExposureAnalyzer } from "../analyzers/orchestrators/ExposureAnalyzer";
import type { PositionDataService } from "../services/contracts/PositionDataService";
import type { ReportDocument } from "../types/report.types";
import type { ServiceRequestContext } from "../services/contracts/AccountDataService";
import { fmtPct, fmtUsd } from "./formatters";
import { pushDataCompletenessSections } from "./dataCompleteness";

export class ExposureReportGenerator {
  private readonly analyzer = new ExposureAnalyzer();

  constructor(private readonly positionsService: PositionDataService) {}

  async generate(context: ServiceRequestContext): Promise<ReportDocument> {
    const positionsResult = await this.positionsService.getOpenPositions(context);
    const report = this.analyzer.analyze(positionsResult.positions);
    const sections: ReportDocument["sections"] = [
      {
        title: "Exposure Overview",
        type: "kpi",
        kpis: [
          { label: "Long Exposure", value: fmtUsd(report.longExposureUsd) },
          { label: "Short Exposure", value: fmtUsd(report.shortExposureUsd) },
          { label: "Gross Exposure", value: fmtUsd(report.grossExposureUsd) },
          { label: "Net Exposure", value: fmtUsd(report.netExposureUsd) }
        ]
      },
      {
        title: "Per-Asset Exposure",
        type: "table",
        table: {
          headers: ["Asset", "Exposure", "Exposure %", "Long", "Short", "Symbols"],
          rows: report.perAsset.map((item) => [
            item.asset,
            fmtUsd(item.exposureUsd),
            fmtPct(item.exposurePct),
            fmtUsd(item.longExposureUsd),
            fmtUsd(item.shortExposureUsd),
            item.symbols.join(", ")
          ])
        }
      },
      {
        title: "Concentration Risk",
        type: "kpi",
        kpis: [
          { label: "Top1 Asset", value: report.concentration.top1Asset },
          { label: "Top1 %", value: fmtPct(report.concentration.top1Pct) },
          { label: "Top3 %", value: fmtPct(report.concentration.top3Pct) },
          { label: "HHI", value: report.concentration.hhi.toFixed(4) },
          { label: "Risk Band", value: report.concentration.band }
        ]
      }
    ];

    pushDataCompletenessSections(sections, positionsResult.dataCompleteness);

    return {
      command: "exposure",
      title: "Exposure Analytics",
      generatedAt: new Date().toISOString(),
      sections,
      dataCompleteness: positionsResult.dataCompleteness
    };
  }
}
