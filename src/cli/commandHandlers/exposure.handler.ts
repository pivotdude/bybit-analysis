import { ExposureReportGenerator } from "../../generators/ExposureReportGenerator";
import type { ReportDocument } from "../../types/report.types";
import { toServiceContext, type HandlerDeps } from "./shared";

export async function exposureHandler(deps: HandlerDeps): Promise<ReportDocument> {
  const generator = new ExposureReportGenerator(deps.positionService);
  return generator.generate(toServiceContext(deps.config));
}
