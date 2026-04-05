import { HealthReportGenerator } from "../../generators/HealthReportGenerator";
import type { ReportDocument } from "../../types/report.types";
import { toServiceContext, type HandlerDeps } from "./shared";

export async function healthHandler(deps: HandlerDeps): Promise<ReportDocument> {
  const generator = new HealthReportGenerator(deps.accountService);
  return generator.generate(toServiceContext(deps.config));
}
