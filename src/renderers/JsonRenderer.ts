import { classifyReportOutcome } from "../cli/exitCodes";
import type { OutputFormat } from "../types/command.types";
import type { ReportDocument } from "../types/report.types";
import type { ReportRenderer } from "./ReportRenderer";

export const JSON_REPORT_SCHEMA_VERSION = "report-json-v1";

export class JsonRenderer implements ReportRenderer {
  render(report: ReportDocument, format: OutputFormat): string {
    if (format !== "json") {
      throw new Error(`JsonRenderer only supports json format, received: ${format}`);
    }

    return `${JSON.stringify(
      {
        jsonSchemaVersion: JSON_REPORT_SCHEMA_VERSION,
        reportSchemaVersion: report.schemaVersion,
        command: report.command,
        title: report.title,
        generatedAt: report.generatedAt,
        asOf: report.asOf ?? null,
        outcome: classifyReportOutcome(report),
        dataCompleteness: report.dataCompleteness ?? null,
        healthStatus: report.healthStatus ?? "ok",
        sources: report.sources ?? [],
        sections: report.sections,
        data: report.data ?? {}
      },
      null,
      2
    )}\n`;
  }
}
