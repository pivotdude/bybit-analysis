import type { ReportDocument } from "../types/report.types";
import type { DataCompletenessState } from "../types/domain.types";

export const CLI_EXIT_CODE = {
  SUCCESS: 0,
  RUNTIME_ERROR: 1,
  USAGE_ERROR: 2,
  PARTIAL_OPTIONAL: 3,
  CRITICAL_INCOMPLETE: 4,
  HEALTH_CHECK_FAILED: 5
} as const;

export const CLI_EXIT_CODE_LABEL: Record<number, string> = {
  [CLI_EXIT_CODE.SUCCESS]: "success",
  [CLI_EXIT_CODE.RUNTIME_ERROR]: "runtime_error",
  [CLI_EXIT_CODE.USAGE_ERROR]: "usage_error",
  [CLI_EXIT_CODE.PARTIAL_OPTIONAL]: "partial_optional",
  [CLI_EXIT_CODE.CRITICAL_INCOMPLETE]: "critical_incomplete",
  [CLI_EXIT_CODE.HEALTH_CHECK_FAILED]: "health_check_failed"
};

export type ReportOutcomeStatus =
  | "success"
  | "partial_optional"
  | "critical_incomplete"
  | "failed";

export interface ReportOutcome {
  status: ReportOutcomeStatus;
  exitCode: number;
  exitCodeLabel: string;
  dataCompletenessState: DataCompletenessState;
  healthStatus: ReportDocument["healthStatus"] | "n/a";
}

function resolveReportOutcomeStatus(report: ReportDocument): ReportOutcomeStatus {
  if (report.command === "health" && report.healthStatus === "failed") {
    return "failed";
  }

  const dataCompleteness = report.dataCompleteness;
  if (!dataCompleteness) {
    return "success";
  }

  if (dataCompleteness.state === "unsupported" && dataCompleteness.issues.length === 0) {
    return "success";
  }

  switch (dataCompleteness.state) {
    case "complete":
      return "success";
    case "partial_optional":
      return "partial_optional";
    case "partial_critical":
    case "unsupported":
    case "failed":
      return "critical_incomplete";
    default:
      return "critical_incomplete";
  }
}

export function classifyReportExitCode(report: ReportDocument): number {
  const status = resolveReportOutcomeStatus(report);
  switch (status) {
    case "success":
      return CLI_EXIT_CODE.SUCCESS;
    case "partial_optional":
      return CLI_EXIT_CODE.PARTIAL_OPTIONAL;
    case "critical_incomplete":
      return CLI_EXIT_CODE.CRITICAL_INCOMPLETE;
    case "failed":
      return CLI_EXIT_CODE.HEALTH_CHECK_FAILED;
    default:
      return CLI_EXIT_CODE.CRITICAL_INCOMPLETE;
  }
}

export function classifyReportOutcome(report: ReportDocument): ReportOutcome {
  const status = resolveReportOutcomeStatus(report);
  const exitCode = classifyReportExitCode(report);
  const exitCodeLabel = CLI_EXIT_CODE_LABEL[exitCode] ?? "unknown";

  return {
    status,
    exitCode,
    exitCodeLabel,
    dataCompletenessState: report.dataCompleteness?.state ?? "unsupported",
    healthStatus: report.command === "health" ? (report.healthStatus ?? "ok") : "n/a"
  };
}
