import { SummaryReportGenerator } from "../../generators/SummaryReportGenerator";
import { toServiceContext, type HandlerDeps } from "./shared";

export async function summaryHandler(deps: HandlerDeps): Promise<string> {
  const generator = new SummaryReportGenerator(deps.accountService, deps.executionService, deps.botService);
  const report = await generator.generate(toServiceContext(deps.config));
  return deps.renderer.render(report, deps.config.format);
}
