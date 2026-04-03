import type { OutputFormat } from "../types/command.types";
import type { ReportDocument } from "../types/report.types";

export interface ReportRenderer {
  render(report: ReportDocument, format: OutputFormat): string;
}
