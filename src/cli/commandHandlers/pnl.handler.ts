import { PnLReportGenerator } from "../../generators/PnLReportGenerator";
import { toServiceContext, type HandlerDeps } from "./shared";

export async function pnlHandler(deps: HandlerDeps): Promise<string> {
  const generator = new PnLReportGenerator(deps.executionService, deps.accountService);
  const report = await generator.generate(toServiceContext(deps.config));
  return deps.renderer.render(report, deps.config.format);
}
