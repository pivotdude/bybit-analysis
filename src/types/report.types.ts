import type { DataCompleteness } from "./domain.types";

export type ReportSectionType = "kpi" | "table" | "alerts" | "text";

export interface MarkdownKpi {
  label: string;
  value: string;
}

export interface MarkdownTable {
  headers: string[];
  rows: string[][];
}

export interface MarkdownAlert {
  severity: "info" | "warning" | "critical";
  message: string;
}

export interface ReportSection {
  id?: string;
  title: string;
  type: ReportSectionType;
  text?: string[];
  kpis?: MarkdownKpi[];
  table?: MarkdownTable;
  alerts?: MarkdownAlert[];
}

export interface ReportDocument {
  command: string;
  title: string;
  generatedAt: string;
  schemaVersion?: string;
  sections: ReportSection[];
  dataCompleteness?: DataCompleteness;
}
