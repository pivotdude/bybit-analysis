import type { ReportDocument } from "../types/report.types";

export const CLI_EXIT_CODE = {
  SUCCESS: 0,
  RUNTIME_ERROR: 1,
  USAGE_ERROR: 2,
  PARTIAL_DATA: 3,
  HEALTH_CHECK_FAILED: 4
} as const;

export function classifyReportExitCode(report: ReportDocument): number {
  if (report.command === "health" && report.healthStatus === "failed") {
    return CLI_EXIT_CODE.HEALTH_CHECK_FAILED;
  }

  if (report.dataCompleteness?.partial) {
    return CLI_EXIT_CODE.PARTIAL_DATA;
  }

  return CLI_EXIT_CODE.SUCCESS;
}
