import { BalanceReportGenerator } from "../../generators/BalanceReportGenerator";
import { toServiceContext, type HandlerDeps } from "./shared";

export async function balanceHandler(deps: HandlerDeps): Promise<string> {
  const generator = new BalanceReportGenerator(deps.accountService);
  const report = await generator.generate(toServiceContext(deps.config));
  return deps.renderer.render(report, deps.config.format);
}
