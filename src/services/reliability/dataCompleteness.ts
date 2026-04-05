import type {
  DataCompleteness,
  DataCompletenessIssue,
  DataCompletenessIssueSeverity,
  DataCompletenessScope
} from "../../types/domain.types";

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

function hasSeverity(issues: DataCompletenessIssue[], severity: DataCompletenessIssueSeverity): boolean {
  return issues.some((issue) => issue.severity === severity);
}

function resolveDataCompletenessState(issues: DataCompletenessIssue[]): DataCompleteness["state"] {
  if (issues.length === 0) {
    return "complete";
  }

  const hasCriticalUnsupportedIssue = issues.some(
    (issue) => issue.code === "unsupported_feature" && issue.criticality === "critical"
  );
  if (hasCriticalUnsupportedIssue) {
    return "unsupported";
  }

  const hasCriticalImpactIssue = issues.some((issue) => issue.criticality === "critical") || hasSeverity(issues, "critical");
  if (hasCriticalImpactIssue) {
    return "partial_critical";
  }

  return "partial_optional";
}

function buildDataCompleteness(
  state: DataCompleteness["state"],
  warnings: string[],
  issues: DataCompletenessIssue[]
): DataCompleteness {
  return {
    state,
    partial: state !== "complete",
    warnings,
    issues
  };
}

export function degradedDataCompleteness(issues: DataCompletenessIssue[]): DataCompleteness {
  const unique = Array.from(new Map(issues.map((issue) => [issueKey(issue), issue])).values());
  const warnings = unique.map((issue) => issue.message);

  return buildDataCompleteness(resolveDataCompletenessState(unique), warnings, unique);
}

export function unsupportedDataCompleteness(reason: string): DataCompleteness {
  return buildDataCompleteness("unsupported", [reason], []);
}

export function failedDataCompleteness(reason: string, issues: DataCompletenessIssue[] = []): DataCompleteness {
  const unique = Array.from(new Map(issues.map((issue) => [issueKey(issue), issue])).values());
  return buildDataCompleteness("failed", [reason, ...unique.map((issue) => issue.message)], unique);
}

export function buildUnsupportedFeatureIssue(args: {
  scope: DataCompletenessScope;
  message: string;
}): DataCompletenessIssue {
  return {
    code: "unsupported_feature",
    scope: args.scope,
    severity: "critical",
    criticality: "critical",
    message: args.message
  };
}

export function getUnsupportedFeatureIssueMessage(
  dataCompleteness: DataCompleteness,
  scope?: DataCompletenessScope
): string | undefined {
  if (dataCompleteness.state === "unsupported" && dataCompleteness.issues.length === 0) {
    return dataCompleteness.warnings[0];
  }

  return dataCompleteness.issues.find(
    (issue) => issue.code === "unsupported_feature" && (scope ? issue.scope === scope : true)
  )?.message;
}

export function filterDataCompletenessIssues(
  dataCompleteness: DataCompleteness,
  predicate: (issue: DataCompletenessIssue) => boolean
): DataCompleteness {
  const filteredIssues = dataCompleteness.issues.filter(predicate);
  if (filteredIssues.length === 0) {
    return completeDataCompleteness();
  }
  return degradedDataCompleteness(filteredIssues);
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
