import type { OutputFormat } from "../types/command.types";
import type { ReportDocument } from "../types/report.types";
import type { ReportRenderer } from "./ReportRenderer";
import { renderAlerts } from "./sections/alerts.section";
import { renderKpis } from "./sections/kpi.section";
import { renderTable } from "./sections/table.section";

export class MarkdownRenderer implements ReportRenderer {
  render(report: ReportDocument, format: OutputFormat): string {
    const compact = format === "compact";
    const sectionHeadingPrefix = compact ? "###" : "##";
    const lines: string[] = [];

    lines.push(`# ${report.title}`);
    if (!compact) {
      lines.push("");
    }

    lines.push(`Generated at: ${new Date(report.generatedAt).toISOString()}`);
    if (report.schemaVersion) {
      lines.push(`Schema: ${report.schemaVersion}`);
    }

    for (const section of report.sections) {
      if (!compact) {
        lines.push("");
      }
      lines.push(
        section.id
          ? `${sectionHeadingPrefix} [${section.id}] ${section.title}`
          : `${sectionHeadingPrefix} ${section.title}`
      );

      switch (section.type) {
        case "kpi":
          if (section.kpis) {
            lines.push(...renderKpis(section.kpis));
          }
          break;
        case "table":
          if (section.table) {
            lines.push(...renderTable(section.table, compact));
          }
          break;
        case "alerts":
          if (section.alerts) {
            lines.push(...renderAlerts(section.alerts));
          }
          break;
        case "text":
          if (section.text) {
            lines.push(...section.text);
          }
          break;
        default:
          break;
      }
    }

    if (!compact) {
      lines.push("");
    }
    return lines.join("\n");
  }
}
