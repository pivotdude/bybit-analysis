import { PerformanceReportGenerator } from "../../generators/PerformanceReportGenerator";
import { toServiceContext, type HandlerDeps } from "./shared";

export async function performanceHandler(deps: HandlerDeps): Promise<string> {
  const generator = new PerformanceReportGenerator(deps.accountService, deps.executionService);
  const report = await generator.generate(toServiceContext(deps.config));
  return deps.renderer.render(report, deps.config.format);
}
