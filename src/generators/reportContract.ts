import type { DataCompleteness } from "../types/domain.types";
import type {
  MarkdownAlert,
  MarkdownKpi,
  MarkdownTable,
  ReportSection,
  ReportSectionType
} from "../types/report.types";

export interface SectionContractEntry<T extends ReportSectionType = ReportSectionType> {
  id: string;
  title: string;
  type: T;
}

export type SectionContractMap = Record<string, SectionContractEntry>;

type SectionPayloadByType = {
  text: { text: string[] };
  kpi: { kpis: MarkdownKpi[] };
  table: { table: MarkdownTable };
  alerts: { alerts: MarkdownAlert[] };
};

type SectionPayload<TType extends ReportSectionType> = SectionPayloadByType[TType];

export function createSectionBuilder<const TContract extends SectionContractMap>(contract: TContract) {
  return function section<TKey extends keyof TContract>(
    key: TKey,
    payload: SectionPayload<TContract[TKey]["type"]>
  ): ReportSection {
    const sectionContract = contract[key]!;
    return {
      id: sectionContract.id,
      title: sectionContract.title,
      type: sectionContract.type,
      ...payload
    } as ReportSection;
  };
}

export function buildDataCompletenessAlerts(dataCompleteness: DataCompleteness): MarkdownAlert[] {
  const stateSeverity: MarkdownAlert["severity"] =
    dataCompleteness.state === "complete"
      ? "info"
      : dataCompleteness.state === "partial_optional"
        ? "warning"
        : dataCompleteness.state === "unsupported" && dataCompleteness.issues.length === 0
          ? "info"
          : "critical";
  const alerts: MarkdownAlert[] = [
    {
      severity: stateSeverity,
      message: `State: ${dataCompleteness.state}`
    },
    {
      severity: "info",
      message: `Issues: ${dataCompleteness.issues.length}`
    }
  ];

  if (dataCompleteness.issues.length === 0) {
    alerts.push({ severity: "info", message: "No data completeness issues." });
    return alerts;
  }

  for (const issue of dataCompleteness.issues) {
    alerts.push({
      severity: issue.severity,
      message: `${issue.code} (${issue.scope}, ${issue.criticality}): ${issue.message}`
    });
  }

  return alerts;
}

export function buildUnsupportedDataCompletenessAlerts(reason: string): MarkdownAlert[] {
  return [
    {
      severity: "info",
      message: "State: unsupported"
    },
    {
      severity: "info",
      message: reason
    }
  ];
}
