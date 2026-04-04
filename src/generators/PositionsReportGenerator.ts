import { PositionsAnalyzer } from "../analyzers/orchestrators/PositionsAnalyzer";
import type { PositionDataService } from "../services/contracts/PositionDataService";
import type { ReportDocument } from "../types/report.types";
import type { ServiceRequestContext } from "../services/contracts/AccountDataService";
import { fmtUsd } from "./formatters";
import { pushDataCompletenessSections } from "./dataCompleteness";

export class PositionsReportGenerator {
  private readonly analyzer = new PositionsAnalyzer();

  constructor(private readonly positionsService: PositionDataService) {}

  async generate(context: ServiceRequestContext): Promise<ReportDocument> {
    const positionsResult = await this.positionsService.getOpenPositions(context);
    const analysis = this.analyzer.analyze(positionsResult.positions);

    const sections: ReportDocument["sections"] = [
      {
        title: "Position Table",
        type: "table",
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
      },
      {
        title: "Side Split",
        type: "kpi",
        kpis: [
          { label: "Total Positions", value: String(analysis.totalPositions) },
          { label: "Long Count", value: String(analysis.longCount) },
          { label: "Short Count", value: String(analysis.shortCount) },
          { label: "Total Notional", value: fmtUsd(analysis.totalNotionalUsd) }
        ]
      },
      {
        title: "Largest Positions",
        type: "table",
        table: {
          headers: ["Symbol", "Side", "Notional", "UPnL"],
          rows: analysis.largestPositions.map((position) => [
            position.symbol,
            position.side,
            fmtUsd(position.notionalUsd),
            fmtUsd(position.unrealizedPnlUsd)
          ])
        }
      }
    ];

    if (analysis.priceSourceAlert) {
      sections.push({
        title: "Alerts",
        type: "alerts",
        alerts: [{ severity: "warning", message: analysis.priceSourceAlert }]
      });
    }

    pushDataCompletenessSections(sections, positionsResult.dataCompleteness);

    return {
      command: "positions",
      title: "Positions Analytics",
      generatedAt: new Date().toISOString(),
      sections,
      dataCompleteness: positionsResult.dataCompleteness
    };
  }
}
