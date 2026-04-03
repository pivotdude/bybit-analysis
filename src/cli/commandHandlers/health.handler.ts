import { HealthReportGenerator } from "../../generators/HealthReportGenerator";
import { toServiceContext, type HandlerDeps } from "./shared";

export async function healthHandler(deps: HandlerDeps): Promise<string> {
  const generator = new HealthReportGenerator(deps.accountService);
  const report = await generator.generate(toServiceContext(deps.config));
  return deps.renderer.render(report, deps.config.format);
}
