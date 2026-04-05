import { PositionsAnalyzer } from "../analyzers/orchestrators/PositionsAnalyzer";
import type { PositionDataService } from "../services/contracts/PositionDataService";
import type { ReportDocument } from "../types/report.types";
import type { ReportSectionType } from "../types/report.types";
import type { ServiceRequestContext } from "../services/contracts/AccountDataService";
import { fmtUsd } from "./formatters";
import { buildDataCompletenessAlerts, createSectionBuilder } from "./reportContract";
import { getUnsupportedFeatureIssueMessage } from "../services/reliability/dataCompleteness";
import { createSourceMetadata } from "./sourceMetadata";

export const POSITIONS_SCHEMA_VERSION = "positions-markdown-v1";

export const POSITIONS_SECTION_CONTRACT = {
  table: { id: "positions.table", title: "Position Table", type: "table" },
  sideSplit: { id: "positions.side_split", title: "Side Split", type: "kpi" },
  largest: { id: "positions.largest", title: "Largest Positions", type: "table" },
  alerts: { id: "positions.alerts", title: "Alerts", type: "alerts" },
  dataCompleteness: { id: "positions.data_completeness", title: "Data Completeness", type: "alerts" }
} as const satisfies Record<string, { id: string; title: string; type: ReportSectionType }>;

export const POSITIONS_SECTION_ORDER = [
  "table",
  "sideSplit",
  "largest",
  "alerts",
  "dataCompleteness"
] as const satisfies readonly (keyof typeof POSITIONS_SECTION_CONTRACT)[];

const section = createSectionBuilder(POSITIONS_SECTION_CONTRACT);

export class PositionsReportGenerator {
  private readonly analyzer = new PositionsAnalyzer();

  constructor(private readonly positionsService: PositionDataService) {}

  async generate(context: ServiceRequestContext): Promise<ReportDocument> {
    const positionsResult = await this.positionsService.getOpenPositions(context);
    const generatedAt = new Date().toISOString();
    const unsupportedMessage = getUnsupportedFeatureIssueMessage(positionsResult.dataCompleteness, "positions");
    if (unsupportedMessage) {
      const sections: ReportDocument["sections"] = [
        section("table", {
          table: {
            headers: ["Symbol", "Side", "Qty", "Entry", "Valuation", "Notional", "UPnL", "Leverage", "Price Source"],
            rows: []
          }
        }),
        section("sideSplit", {
          kpis: [
            { label: "Total Positions", value: "unsupported" },
            { label: "Long Count", value: "unsupported" },
            { label: "Short Count", value: "unsupported" },
            { label: "Total Notional", value: "unsupported" }
          ]
        }),
        section("largest", {
          table: {
            headers: ["Symbol", "Side", "Notional", "UPnL"],
            rows: []
          }
        }),
        section("alerts", {
          alerts: [{ severity: "critical", message: unsupportedMessage }]
        }),
        section("dataCompleteness", {
          alerts: buildDataCompletenessAlerts(positionsResult.dataCompleteness)
        })
      ];

      return {
        command: "positions",
        title: "Positions Analytics",
        schemaVersion: POSITIONS_SCHEMA_VERSION,
        generatedAt,
        asOf: positionsResult.capturedAt,
        sections,
        dataCompleteness: positionsResult.dataCompleteness,
        sources: [
          createSourceMetadata({
            id: "positions_snapshot",
            kind: "positions_snapshot",
            provider: positionsResult.source,
            exchange: positionsResult.exchange,
            category: context.category,
            sourceMode: context.sourceMode,
            fetchedAt: positionsResult.capturedAt,
            capturedAt: positionsResult.capturedAt,
            cacheStatus: positionsResult.cacheStatus
          })
        ],
        data: {
          unsupportedReason: unsupportedMessage,
          positions: []
        }
      };
    }

    const analysis = this.analyzer.analyze(positionsResult.positions);

    const sections: ReportDocument["sections"] = [
      section("table", {
        table: {
          headers: ["Symbol", "Side", "Qty", "Entry", "Valuation", "Notional", "UPnL", "Leverage", "Price Source"],
          rows: analysis.positions.map((position) => [
            position.symbol,
            position.side,
            position.quantity.toFixed(6),
            position.entryPrice.toFixed(4),
            position.valuationPrice.toFixed(4),
            fmtUsd(position.notionalUsd),
            fmtUsd(position.unrealizedPnlUsd),
            `${position.leverage.toFixed(2)}x`,
            position.priceSource
          ])
        }
      }),
      section("sideSplit", {
        kpis: [
          { label: "Total Positions", value: String(analysis.totalPositions) },
          { label: "Long Count", value: String(analysis.longCount) },
          { label: "Short Count", value: String(analysis.shortCount) },
          { label: "Total Notional", value: fmtUsd(analysis.totalNotionalUsd) }
        ]
      }),
      section("largest", {
        table: {
          headers: ["Symbol", "Side", "Notional", "UPnL"],
          rows: analysis.largestPositions.map((position) => [
            position.symbol,
            position.side,
            fmtUsd(position.notionalUsd),
            fmtUsd(position.unrealizedPnlUsd)
          ])
        }
      }),
      section("alerts", {
        alerts: analysis.priceSourceAlert
          ? [{ severity: "warning", message: analysis.priceSourceAlert }]
          : [{ severity: "info", message: "No active position alerts" }]
      }),
      section("dataCompleteness", {
        alerts: buildDataCompletenessAlerts(positionsResult.dataCompleteness)
      })
    ];

    return {
      command: "positions",
      title: "Positions Analytics",
      schemaVersion: POSITIONS_SCHEMA_VERSION,
      generatedAt,
      asOf: positionsResult.capturedAt,
      sections,
      dataCompleteness: positionsResult.dataCompleteness,
      sources: [
        createSourceMetadata({
          id: "positions_snapshot",
          kind: "positions_snapshot",
          provider: positionsResult.source,
          exchange: positionsResult.exchange,
          category: context.category,
          sourceMode: context.sourceMode,
          fetchedAt: positionsResult.capturedAt,
          capturedAt: positionsResult.capturedAt
        })
      ],
      data: {
        positions: analysis.positions,
        summary: {
          totalPositions: analysis.totalPositions,
          longCount: analysis.longCount,
          shortCount: analysis.shortCount,
          totalNotionalUsd: analysis.totalNotionalUsd
        },
        largestPositions: analysis.largestPositions,
        priceSourceAlert: analysis.priceSourceAlert
      }
    };
  }
}
