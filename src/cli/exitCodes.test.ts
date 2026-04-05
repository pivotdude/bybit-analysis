import { describe, expect, it } from "bun:test";
import { completeDataCompleteness } from "../services/reliability/dataCompleteness";
import type { ReportDocument } from "../types/report.types";
import { CLI_EXIT_CODE, classifyReportExitCode, classifyReportOutcome } from "./exitCodes";

function baseReport(overrides: Partial<ReportDocument> = {}): ReportDocument {
  return {
    command: "summary",
    title: "Test Report",
    generatedAt: "2026-01-01T00:00:00.000Z",
    schemaVersion: "test-v1",
    sections: [],
    dataCompleteness: completeDataCompleteness(),
    ...overrides
  };
}

describe("classifyReportExitCode", () => {
  it("returns success for complete reports", () => {
    const report = baseReport();
    expect(classifyReportExitCode(report)).toBe(CLI_EXIT_CODE.SUCCESS);
  });

  it("returns optional-partial exit code for optional degradation", () => {
    const report = baseReport({
      dataCompleteness: {
        state: "partial_optional",
        partial: true,
        warnings: ["Optional bot enrichment failed"],
        issues: [
          {
            code: "optional_item_failed",
            scope: "bots",
            severity: "warning",
            criticality: "optional",
            message: "Optional bot enrichment failed"
          }
        ]
      }
    });

    expect(classifyReportExitCode(report)).toBe(CLI_EXIT_CODE.PARTIAL_OPTIONAL);
  });

  it("returns critical-incomplete exit code for unsupported analytics", () => {
    const report = baseReport({
      dataCompleteness: {
        state: "unsupported",
        partial: true,
        warnings: ["Spot exposure analytics are unsupported"],
        issues: [
          {
            code: "unsupported_feature",
            scope: "positions",
            severity: "critical",
            criticality: "critical",
            message: "Spot exposure analytics are unsupported"
          }
        ]
      }
    });

    expect(classifyReportExitCode(report)).toBe(CLI_EXIT_CODE.CRITICAL_INCOMPLETE);
  });

  it("returns health-failed exit code for failed health reports", () => {
    const report = baseReport({
      command: "health",
      healthStatus: "failed"
    });

    expect(classifyReportExitCode(report)).toBe(CLI_EXIT_CODE.HEALTH_CHECK_FAILED);
  });

  it("prioritizes health failure over partial data", () => {
    const report = baseReport({
      command: "health",
      healthStatus: "failed",
      dataCompleteness: {
        state: "partial_critical",
        partial: true,
        warnings: ["placeholder"],
        issues: [
          {
            code: "pagination_limit_reached",
            scope: "positions",
            severity: "warning",
            criticality: "critical",
            message: "placeholder"
          }
        ]
      }
    });

    expect(classifyReportExitCode(report)).toBe(CLI_EXIT_CODE.HEALTH_CHECK_FAILED);
  });
});

describe("classifyReportOutcome", () => {
  it("returns deterministic success metadata for complete report", () => {
    const report = baseReport();
    expect(classifyReportOutcome(report)).toEqual({
      status: "success",
      exitCode: CLI_EXIT_CODE.SUCCESS,
      exitCodeLabel: "success",
      dataCompletenessState: "complete",
      healthStatus: "n/a"
    });
  });

  it("returns deterministic optional-partial metadata for optional report", () => {
    const report = baseReport({
      dataCompleteness: {
        state: "partial_optional",
        partial: true,
        warnings: ["partial snapshot"],
        issues: [
          {
            code: "optional_item_failed",
            scope: "bots",
            severity: "warning",
            criticality: "optional",
            message: "partial snapshot"
          }
        ]
      }
    });

    expect(classifyReportOutcome(report)).toEqual({
      status: "partial_optional",
      exitCode: CLI_EXIT_CODE.PARTIAL_OPTIONAL,
      exitCodeLabel: "partial_optional",
      dataCompletenessState: "partial_optional",
      healthStatus: "n/a"
    });
  });

  it("returns deterministic failed metadata for failed health report", () => {
    const report = baseReport({
      command: "health",
      healthStatus: "failed"
    });

    expect(classifyReportOutcome(report)).toEqual({
      status: "failed",
      exitCode: CLI_EXIT_CODE.HEALTH_CHECK_FAILED,
      exitCodeLabel: "health_check_failed",
      dataCompletenessState: "complete",
      healthStatus: "failed"
    });
  });
});
