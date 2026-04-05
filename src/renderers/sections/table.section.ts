import type { MarkdownTable } from "../../types/report.types";

const EMPTY_ROW_PLACEHOLDER = "<empty>";

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

  const rows = table.rows.length > 0 ? table.rows : [table.headers.map(() => EMPTY_ROW_PLACEHOLDER)];
  for (const row of rows) {
    lines.push(renderRow(row));
  }

  return lines;
}
