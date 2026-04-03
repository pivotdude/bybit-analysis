import { PermissionsReportGenerator } from "../../generators/PermissionsReportGenerator";
import { toServiceContext, type HandlerDeps } from "./shared";

export async function permissionsHandler(deps: HandlerDeps): Promise<string> {
  const generator = new PermissionsReportGenerator(deps.accountService);
  const report = await generator.generate(toServiceContext(deps.config));
  return deps.renderer.render(report, deps.config.format);
}
