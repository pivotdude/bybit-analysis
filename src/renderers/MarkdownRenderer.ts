import type { OutputFormat } from "../types/command.types";
import type { ReportDocument, ReportSourceMetadata } from "../types/report.types";
import type { ReportRenderer } from "./ReportRenderer";
import { classifyReportOutcome } from "../cli/exitCodes";
import { renderAlerts } from "./sections/alerts.section";
import { renderKpis } from "./sections/kpi.section";
import { renderTable } from "./sections/table.section";

function renderSourceMetadata(source: ReportSourceMetadata): string {
  const parts = [
    `kind=${source.kind}`,
    `provider=${source.provider}`,
    source.exchange ? `exchange=${source.exchange}` : undefined,
    source.category ? `category=${source.category}` : undefined,
    source.sourceMode ? `mode=${source.sourceMode}` : undefined,
    `fetchedAt=${new Date(source.fetchedAt).toISOString()}`,
    source.capturedAt ? `capturedAt=${new Date(source.capturedAt).toISOString()}` : undefined,
    source.exchangeServerTime
      ? `exchangeServerTime=${new Date(source.exchangeServerTime).toISOString()}`
      : undefined,
    source.periodFrom && source.periodTo ? `window=${source.periodFrom} -> ${source.periodTo}` : undefined,
    `cache=${source.cacheStatus ?? "unknown"}`
  ].filter((value): value is string => value !== undefined);

  return `${source.id}: ${parts.join("; ")}`;
}

export class MarkdownRenderer implements ReportRenderer {
  render(report: ReportDocument, format: OutputFormat): string {
    if (format === "json") {
      throw new Error("MarkdownRenderer does not support json format");
    }

    const compact = format === "compact";
    const sectionHeadingPrefix = compact ? "###" : "##";
    const outcome = classifyReportOutcome(report);
    const lines: string[] = [];

    lines.push(`# ${report.title}`);
    if (!compact) {
      lines.push("");
    }

    lines.push(`Generated at: ${new Date(report.generatedAt).toISOString()}`);
    if (report.asOf) {
      lines.push(`As Of: ${new Date(report.asOf).toISOString()}`);
    }
    lines.push(`Schema: ${report.schemaVersion}`);
    lines.push(`Command: ${report.command}`);
    lines.push(`Outcome: ${outcome.status}`);
    lines.push(`Exit Code: ${outcome.exitCode} (${outcome.exitCodeLabel})`);
    lines.push(`Data Completeness: ${outcome.dataCompletenessState}`);
    lines.push(`Health Status: ${outcome.healthStatus}`);
    if (report.sources && report.sources.length > 0) {
      lines.push(`Source Freshness: ${report.sources.length} source(s)`);
      for (const source of report.sources) {
        lines.push(`Source: ${renderSourceMetadata(source)}`);
      }
    }

    for (const section of report.sections) {
      if (!compact) {
        lines.push("");
      }
      lines.push(`${sectionHeadingPrefix} [${section.id}] ${section.title}`);

      switch (section.type) {
        case "kpi":
          lines.push(...renderKpis(section.kpis));
          break;
        case "table":
          lines.push(...renderTable(section.table, compact));
          break;
        case "alerts":
          lines.push(...renderAlerts(section.alerts));
          break;
        case "text":
          lines.push(...section.text);
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
