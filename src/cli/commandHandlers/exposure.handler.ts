import { ExposureReportGenerator } from "../../generators/ExposureReportGenerator";
import { toServiceContext, type HandlerDeps } from "./shared";

export async function exposureHandler(deps: HandlerDeps): Promise<string> {
  const generator = new ExposureReportGenerator(deps.positionService);
  const report = await generator.generate(toServiceContext(deps.config));
  return deps.renderer.render(report, deps.config.format);
}
