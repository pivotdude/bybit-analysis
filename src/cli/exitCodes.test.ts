import { describe, expect, it } from "bun:test";
import { CLI_EXIT_CODE, classifyReportExitCode } from "./exitCodes";
import type { ReportDocument } from "../types/report.types";

function baseReport(overrides: Partial<ReportDocument> = {}): ReportDocument {
  return {
    command: "summary",
    title: "Test Report",
    generatedAt: "2026-01-01T00:00:00.000Z",
    schemaVersion: "test-v1",
    sections: [],
    ...overrides
  };
}

describe("classifyReportExitCode", () => {
  it("returns success for complete reports", () => {
    const report = baseReport();
    expect(classifyReportExitCode(report)).toBe(CLI_EXIT_CODE.SUCCESS);
  });

  it("returns partial-data exit code for degraded reports", () => {
    const report = baseReport({
      dataCompleteness: {
        state: "degraded",
        partial: true,
        warnings: ["Position pagination limit reached"],
        issues: [
          {
            code: "pagination_limit_reached",
            scope: "positions",
            severity: "warning",
            criticality: "critical",
            message: "Position pagination limit reached"
          }
        ]
      }
    });

    expect(classifyReportExitCode(report)).toBe(CLI_EXIT_CODE.PARTIAL_DATA);
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
        state: "degraded",
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
