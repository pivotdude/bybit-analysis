import { PerformanceReportGenerator } from "../../generators/PerformanceReportGenerator";
import type { ReportDocument } from "../../types/report.types";
import { toServiceContext, type HandlerDeps } from "./shared";

export async function performanceHandler(deps: HandlerDeps): Promise<ReportDocument> {
  const generator = new PerformanceReportGenerator(deps.accountService, deps.executionService);
  return generator.generate(toServiceContext(deps.config));
}
