import type { OutputFormat } from "../types/command.types";
import type { ReportDocument } from "../types/report.types";
import type { ReportRenderer } from "./ReportRenderer";
import { renderAlerts } from "./sections/alerts.section";
import { renderKpis } from "./sections/kpi.section";
import { renderTable } from "./sections/table.section";

export class MarkdownRenderer implements ReportRenderer {
  render(report: ReportDocument, format: OutputFormat): string {
    const lines: string[] = [];
    lines.push(`# ${report.title}`);
    lines.push("");
    lines.push(`Generated at: ${new Date(report.generatedAt).toISOString()}`);
    if (report.schemaVersion) {
      lines.push(`Schema: ${report.schemaVersion}`);
    }

    for (const section of report.sections) {
      lines.push("");
      lines.push(section.id ? `## [${section.id}] ${section.title}` : `## ${section.title}`);

      switch (section.type) {
        case "kpi":
          if (section.kpis) {
            lines.push(...renderKpis(section.kpis));
          }
          break;
        case "table":
          if (section.table) {
            const maxRows = format === "compact" ? 10 : undefined;
            lines.push(...renderTable(section.table, maxRows));
          }
          break;
        case "alerts":
          if (section.alerts) {
            lines.push(...renderAlerts(section.alerts));
          }
          break;
        case "text":
          if (section.text) {
            const textLines = format === "compact" ? section.text.slice(0, 6) : section.text;
            lines.push(...textLines);
          }
          break;
        default:
          break;
      }
    }

    lines.push("");
    return lines.join("\n");
  }
}
