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

  lines.push(renderRow(table.headers));
  lines.push(renderRow(table.headers.map(() => "---")));

  for (const row of table.rows) {
    lines.push(renderRow(row));
  }

  return lines;
}
