import { RiskReportGenerator } from "../../generators/RiskReportGenerator";
import type { ReportDocument } from "../../types/report.types";
import { toServiceContext, type HandlerDeps } from "./shared";

export async function riskHandler(deps: HandlerDeps): Promise<ReportDocument> {
  const generator = new RiskReportGenerator(deps.accountService, deps.positionService);
  return generator.generate(toServiceContext(deps.config));
}
