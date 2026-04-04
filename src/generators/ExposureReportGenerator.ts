import { ExposureAnalyzer } from "../analyzers/orchestrators/ExposureAnalyzer";
import type { PositionDataService } from "../services/contracts/PositionDataService";
import type { ReportDocument } from "../types/report.types";
import type { ReportSectionType } from "../types/report.types";
import type { ServiceRequestContext } from "../services/contracts/AccountDataService";
import { fmtPct, fmtUsd } from "./formatters";
import { buildDataCompletenessAlerts, createSectionBuilder } from "./reportContract";

export const EXPOSURE_SCHEMA_VERSION = "exposure-markdown-v1";

export const EXPOSURE_SECTION_CONTRACT = {
  overview: { id: "exposure.overview", title: "Exposure Overview", type: "kpi" },
  perAsset: { id: "exposure.per_asset", title: "Per-Asset Exposure", type: "table" },
  concentration: { id: "exposure.concentration_risk", title: "Concentration Risk", type: "kpi" },
  dataCompleteness: { id: "exposure.data_completeness", title: "Data Completeness", type: "alerts" }
} as const satisfies Record<string, { id: string; title: string; type: ReportSectionType }>;

export const EXPOSURE_SECTION_ORDER = [
  "overview",
  "perAsset",
  "concentration",
  "dataCompleteness"
] as const satisfies readonly (keyof typeof EXPOSURE_SECTION_CONTRACT)[];

const section = createSectionBuilder(EXPOSURE_SECTION_CONTRACT);

export class ExposureReportGenerator {
  private readonly analyzer = new ExposureAnalyzer();

  constructor(private readonly positionsService: PositionDataService) {}

  async generate(context: ServiceRequestContext): Promise<ReportDocument> {
    const positionsResult = await this.positionsService.getOpenPositions(context);
    const report = this.analyzer.analyze(positionsResult.positions, positionsResult.source);
    const sections: ReportDocument["sections"] = [
      section("overview", {
        kpis: [
          { label: "Long Exposure", value: fmtUsd(report.longExposureUsd) },
          { label: "Short Exposure", value: fmtUsd(report.shortExposureUsd) },
          { label: "Gross Exposure", value: fmtUsd(report.grossExposureUsd) },
          { label: "Net Exposure", value: fmtUsd(report.netExposureUsd) }
        ]
      }),
      section("perAsset", {
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
      }),
      section("concentration", {
        kpis: [
          { label: "Top1 Asset", value: report.concentration.top1Asset },
          { label: "Top1 %", value: fmtPct(report.concentration.top1Pct) },
          { label: "Top3 %", value: fmtPct(report.concentration.top3Pct) },
          { label: "HHI", value: report.concentration.hhi.toFixed(4) },
          { label: "Risk Band", value: report.concentration.band }
        ]
      }),
      section("dataCompleteness", {
        alerts: buildDataCompletenessAlerts(positionsResult.dataCompleteness)
      })
    ];

    return {
      command: "exposure",
      title: "Exposure Analytics",
      schemaVersion: EXPOSURE_SCHEMA_VERSION,
      generatedAt: new Date().toISOString(),
      sections,
      dataCompleteness: positionsResult.dataCompleteness
    };
  }
}
