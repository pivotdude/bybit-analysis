import type { MarkdownTable } from "../../types/report.types";

function sanitizeMarkdownTableCell(cell: string): string {
  return (
    cell
      // Keep every cell single-line for stable markdown table parsing.
      .replace(/\r\n?/g, "\n")
      .replace(/\n/g, "<br />")
      // Escape markdown table separators while preserving original text.
      .replace(/\\/g, "\\\\")
      .replace(/\|/g, "\\|")
  );
}

export function renderTable(table: MarkdownTable, compact = false): string[] {
  const lines: string[] = [];
  const renderRow = (cells: string[]) => {
    const safeCells = cells.map(sanitizeMarkdownTableCell);
    return compact ? `|${safeCells.join("|")}|` : `| ${safeCells.join(" | ")} |`;
  };

  if (table.rows.length === 0 && table.emptyMessage && table.emptyMode === "message_only") {
    lines.push(`> ${table.emptyMessage}`);
    return lines;
  }

  lines.push(renderRow(table.headers));
  lines.push(renderRow(table.headers.map(() => "---")));

  if (table.rows.length === 0) {
    if (table.emptyMessage) {
      lines.push(`> ${table.emptyMessage}`);
    }
    return lines;
  }

  for (const row of table.rows) {
    lines.push(renderRow(row));
  }

  return lines;
}
