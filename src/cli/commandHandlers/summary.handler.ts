import { SummaryReportGenerator } from "../../generators/SummaryReportGenerator";
import type { ReportDocument } from "../../types/report.types";
import { toServiceContext, type HandlerDeps } from "./shared";

export async function summaryHandler(deps: HandlerDeps): Promise<ReportDocument> {
  const generator = new SummaryReportGenerator(
    deps.accountService,
    deps.executionService,
    deps.positionService,
    deps.botService
  );
  return generator.generate(toServiceContext(deps.config));
}
