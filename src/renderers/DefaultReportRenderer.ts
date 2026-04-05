import type { OutputFormat } from "../types/command.types";
import type { ReportDocument } from "../types/report.types";
import type { ReportRenderer } from "./ReportRenderer";
import { JsonRenderer } from "./JsonRenderer";
import { MarkdownRenderer } from "./MarkdownRenderer";

export class DefaultReportRenderer implements ReportRenderer {
  private readonly markdownRenderer = new MarkdownRenderer();
  private readonly jsonRenderer = new JsonRenderer();

  render(report: ReportDocument, format: OutputFormat): string {
    if (format === "json") {
      return this.jsonRenderer.render(report, format);
    }

    return this.markdownRenderer.render(report, format);
  }
}
