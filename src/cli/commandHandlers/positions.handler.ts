import { PositionsReportGenerator } from "../../generators/PositionsReportGenerator";
import { toServiceContext, type HandlerDeps } from "./shared";

export async function positionsHandler(deps: HandlerDeps): Promise<string> {
  const generator = new PositionsReportGenerator(deps.positionService);
  const report = await generator.generate(toServiceContext(deps.config));
  return deps.renderer.render(report, deps.config.format);
}
