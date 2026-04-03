import { BotsReportGenerator } from "../../generators/BotsReportGenerator";
import { toServiceContext, type HandlerDeps } from "./shared";

export async function botsHandler(deps: HandlerDeps): Promise<string> {
  const generator = new BotsReportGenerator(deps.botService);
  const report = await generator.generate(toServiceContext(deps.config));
  return deps.renderer.render(report, deps.config.format);
}
