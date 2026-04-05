import { PermissionsReportGenerator } from "../../generators/PermissionsReportGenerator";
import type { ReportDocument } from "../../types/report.types";
import { toServiceContext, type HandlerDeps } from "./shared";

export async function permissionsHandler(deps: HandlerDeps): Promise<ReportDocument> {
  const generator = new PermissionsReportGenerator(deps.accountService);
  return generator.generate(toServiceContext(deps.config));
}
