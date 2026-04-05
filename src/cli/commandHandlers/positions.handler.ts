import { PositionsReportGenerator } from "../../generators/PositionsReportGenerator";
import type { ReportDocument } from "../../types/report.types";
import { toServiceContext, type HandlerDeps } from "./shared";

export async function positionsHandler(deps: HandlerDeps): Promise<ReportDocument> {
  const generator = new PositionsReportGenerator(deps.positionService);
  return generator.generate(toServiceContext(deps.config));
}
