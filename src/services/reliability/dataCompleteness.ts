import type { DataCompleteness, DataCompletenessIssue } from "../../types/domain.types";

function issueKey(issue: DataCompletenessIssue): string {
  return `${issue.code}|${issue.scope}|${issue.severity}|${issue.message}`;
}

export function completeDataCompleteness(): DataCompleteness {
  return {
    state: "complete",
    partial: false,
    warnings: [],
    issues: []
  };
}

export function degradedDataCompleteness(issues: DataCompletenessIssue[]): DataCompleteness {
  const unique = Array.from(new Map(issues.map((issue) => [issueKey(issue), issue])).values());
  const warnings = unique.map((issue) => issue.message);

  return {
    state: "degraded",
    partial: true,
    warnings,
    issues: unique
  };
}

export function mergeDataCompleteness(...items: DataCompleteness[]): DataCompleteness {
  const issues = items.flatMap((item) => {
    if (item.issues.length > 0) {
      return item.issues;
    }

    if (!item.partial) {
      return [];
    }

    return item.warnings.map((message) => ({
      code: "optional_item_failed" as const,
      scope: "unknown" as const,
      severity: "warning" as const,
      criticality: "optional" as const,
      message
    }));
  });
  if (issues.length === 0) {
    return completeDataCompleteness();
  }
  return degradedDataCompleteness(issues);
}
