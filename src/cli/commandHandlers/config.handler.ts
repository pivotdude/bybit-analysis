import { ConfigReportGenerator } from "../../generators/ConfigReportGenerator";
import type { ReportDocument } from "../../types/report.types";
import type { HandlerDeps } from "./shared";

export async function configHandler(deps: HandlerDeps): Promise<ReportDocument> {
  const generator = new ConfigReportGenerator();
  return generator.generate(deps.config);
}
