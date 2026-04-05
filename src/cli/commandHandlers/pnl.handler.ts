import { PnLReportGenerator } from "../../generators/PnLReportGenerator";
import type { ReportDocument } from "../../types/report.types";
import { toServiceContext, type HandlerDeps } from "./shared";

export async function pnlHandler(deps: HandlerDeps): Promise<ReportDocument> {
  const generator = new PnLReportGenerator(deps.executionService, deps.accountService);
  return generator.generate(toServiceContext(deps.config));
}
