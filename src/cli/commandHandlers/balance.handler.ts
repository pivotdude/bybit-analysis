import { BalanceReportGenerator } from "../../generators/BalanceReportGenerator";
import type { ReportDocument } from "../../types/report.types";
import { toServiceContext, type HandlerDeps } from "./shared";

export async function balanceHandler(deps: HandlerDeps): Promise<ReportDocument> {
  const generator = new BalanceReportGenerator(deps.accountService);
  return generator.generate(toServiceContext(deps.config));
}
