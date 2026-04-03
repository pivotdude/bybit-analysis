import type { MarkdownKpi } from "../../types/report.types";

export function renderKpis(items: MarkdownKpi[]): string[] {
  return items.map((item) => `- **${item.label}:** ${item.value}`);
}
