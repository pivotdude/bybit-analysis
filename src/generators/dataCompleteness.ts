import type { DataCompleteness } from "../types/domain.types";
import type { ReportSection } from "../types/report.types";

export function pushDataCompletenessSections(sections: ReportSection[], dataCompleteness: DataCompleteness): void {
  if (!dataCompleteness.partial) {
    return;
  }

  sections.push({
    title: "Data Status",
    type: "kpi",
    kpis: [
      { label: "State", value: dataCompleteness.state },
      { label: "Result", value: "degraded" },
      { label: "Issues", value: String(dataCompleteness.issues.length) }
    ]
  });

  sections.push({
    title: "Data Completeness",
    type: "table",
    table: {
      headers: ["Code", "Scope", "Criticality", "Message"],
      rows: dataCompleteness.issues.map((issue) => [
        issue.code,
        issue.scope,
        issue.criticality,
        issue.message
      ])
    }
  });
}
