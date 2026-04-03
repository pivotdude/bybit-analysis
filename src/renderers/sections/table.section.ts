import type { MarkdownTable } from "../../types/report.types";

export function renderTable(table: MarkdownTable, maxRows?: number): string[] {
  const lines: string[] = [];
  const rows = typeof maxRows === "number" ? table.rows.slice(0, maxRows) : table.rows;

  lines.push(`| ${table.headers.join(" | ")} |`);
  lines.push(`| ${table.headers.map(() => "---").join(" | ")} |`);

  for (const row of rows) {
    lines.push(`| ${row.join(" | ")} |`);
  }

  if (typeof maxRows === "number" && table.rows.length > rows.length) {
    lines.push(`_truncated ${table.rows.length - rows.length} rows_`);
  }

  return lines;
}
