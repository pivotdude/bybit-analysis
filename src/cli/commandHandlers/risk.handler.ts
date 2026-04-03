import { RiskReportGenerator } from "../../generators/RiskReportGenerator";
import { toServiceContext, type HandlerDeps } from "./shared";

export async function riskHandler(deps: HandlerDeps): Promise<string> {
  const generator = new RiskReportGenerator(deps.accountService);
  const report = await generator.generate(toServiceContext(deps.config));
  return deps.renderer.render(report, deps.config.format);
}
