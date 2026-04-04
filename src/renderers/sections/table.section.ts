import type { MarkdownTable } from "../../types/report.types";

export function renderTable(table: MarkdownTable, compact = false): string[] {
  const lines: string[] = [];
  const renderRow = (cells: string[]) => (compact ? `|${cells.join("|")}|` : `| ${cells.join(" | ")} |`);

  lines.push(renderRow(table.headers));
  lines.push(renderRow(table.headers.map(() => "---")));

  for (const row of table.rows) {
    lines.push(renderRow(row));
  }

  return lines;
}
