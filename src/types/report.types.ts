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

interface ReportSectionBase<TType extends ReportSectionType> {
  id: string;
  title: string;
  type: TType;
}

export type ReportTextSection = ReportSectionBase<"text"> & {
  text: string[];
};

export type ReportKpiSection = ReportSectionBase<"kpi"> & {
  kpis: MarkdownKpi[];
};

export type ReportTableSection = ReportSectionBase<"table"> & {
  table: MarkdownTable;
};

export type ReportAlertsSection = ReportSectionBase<"alerts"> & {
  alerts: MarkdownAlert[];
};

export type ReportSection = ReportTextSection | ReportKpiSection | ReportTableSection | ReportAlertsSection;

export interface ReportDocument {
  command: string;
  title: string;
  generatedAt: string;
  schemaVersion: string;
  sections: ReportSection[];
  dataCompleteness?: DataCompleteness;
}
