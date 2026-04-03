import type { MarkdownAlert } from "../../types/report.types";

export function renderAlerts(items: MarkdownAlert[]): string[] {
  return items.map((item) => `- [${item.severity.toUpperCase()}] ${item.message}`);
}
