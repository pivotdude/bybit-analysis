import type { ReportDocument } from "../types/report.types";
import type { DataCompletenessState } from "../types/domain.types";

export const CLI_EXIT_CODE = {
  SUCCESS: 0,
  RUNTIME_ERROR: 1,
  USAGE_ERROR: 2,
  PARTIAL_DATA: 3,
  HEALTH_CHECK_FAILED: 4
} as const;

export const CLI_EXIT_CODE_LABEL: Record<number, string> = {
  [CLI_EXIT_CODE.SUCCESS]: "success",
  [CLI_EXIT_CODE.RUNTIME_ERROR]: "runtime_error",
  [CLI_EXIT_CODE.USAGE_ERROR]: "usage_error",
  [CLI_EXIT_CODE.PARTIAL_DATA]: "partial_data",
  [CLI_EXIT_CODE.HEALTH_CHECK_FAILED]: "health_check_failed"
};

export type ReportOutcomeStatus = "success" | "degraded_success" | "failed";

export interface ReportOutcome {
  status: ReportOutcomeStatus;
  exitCode: number;
  exitCodeLabel: string;
  dataCompletenessState: DataCompletenessState | "unsupported";
  partialData: boolean | "unsupported";
  healthStatus: ReportDocument["healthStatus"] | "n/a";
}

export function classifyReportExitCode(report: ReportDocument): number {
  if (report.command === "health" && report.healthStatus === "failed") {
    return CLI_EXIT_CODE.HEALTH_CHECK_FAILED;
  }

  if (report.dataCompleteness?.partial) {
    return CLI_EXIT_CODE.PARTIAL_DATA;
  }

  return CLI_EXIT_CODE.SUCCESS;
}

export function classifyReportOutcome(report: ReportDocument): ReportOutcome {
  const exitCode = classifyReportExitCode(report);
  const exitCodeLabel = CLI_EXIT_CODE_LABEL[exitCode] ?? "unknown";
  const status: ReportOutcomeStatus =
    exitCode === CLI_EXIT_CODE.PARTIAL_DATA
      ? "degraded_success"
      : exitCode === CLI_EXIT_CODE.SUCCESS
        ? "success"
        : "failed";

  return {
    status,
    exitCode,
    exitCodeLabel,
    dataCompletenessState: report.dataCompleteness?.state ?? "unsupported",
    partialData:
      report.dataCompleteness?.partial !== undefined ? report.dataCompleteness.partial : "unsupported",
    healthStatus: report.command === "health" ? (report.healthStatus ?? "ok") : "n/a"
  };
}
