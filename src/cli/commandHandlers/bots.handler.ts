import { BotsReportGenerator } from "../../generators/BotsReportGenerator";
import type { ReportDocument } from "../../types/report.types";
import { toServiceContext, type HandlerDeps } from "./shared";

export async function botsHandler(deps: HandlerDeps): Promise<ReportDocument> {
  if (!deps.botService) {
    throw new Error("Selected exchange provider does not support bot analytics");
  }

  const generator = new BotsReportGenerator(deps.botService);
  return generator.generate(toServiceContext(deps.config));
}
