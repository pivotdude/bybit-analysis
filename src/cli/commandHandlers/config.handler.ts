import { ConfigReportGenerator } from "../../generators/ConfigReportGenerator";
import type { HandlerDeps } from "./shared";

export async function configHandler(deps: HandlerDeps): Promise<string> {
  const generator = new ConfigReportGenerator();
  const report = generator.generate(deps.config);
  return deps.renderer.render(report, deps.config.format);
}
