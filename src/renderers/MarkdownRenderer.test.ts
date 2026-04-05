import { describe, expect, it } from "bun:test";
import type { ReportDocument } from "../types/report.types";
import { MarkdownRenderer } from "./MarkdownRenderer";

function extractSectionBody(markdown: string, sectionTitle: string): string[] {
  const lines = markdown.split("\n");
  const headingIndex = lines.findIndex((line) => /^#{1,6}\s/.test(line) && line.includes(sectionTitle));

  expect(headingIndex).toBeGreaterThanOrEqual(0);

  const body: string[] = [];
  for (let index = headingIndex + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (line === undefined) {
      continue;
    }
    if (/^#{1,6}\s/.test(line)) {
      break;
    }
    body.push(line);
  }

  return body;
}

function parseMarkdownRow(line: string): string[] {
  const trimmed = line.trim();
  const withoutLeading = trimmed.startsWith("|") ? trimmed.slice(1) : trimmed;
  const withoutTrailing = withoutLeading.endsWith("|") ? withoutLeading.slice(0, -1) : withoutLeading;
  return withoutTrailing.split("|").map((cell) => cell.trim());
}

function extractTableDataRows(markdown: string, sectionTitle: string): string[][] {
  const sectionBody = extractSectionBody(markdown, sectionTitle);
  const tableLines = sectionBody.filter((line) => line.trim().startsWith("|"));
  const tableRows = tableLines.map(parseMarkdownRow);

  expect(tableRows.length).toBeGreaterThanOrEqual(2);

  return tableRows.slice(2);
}

function extractTextLines(markdown: string, sectionTitle: string): string[] {
  const sectionBody = extractSectionBody(markdown, sectionTitle);
  return sectionBody.filter((line) => line.trim().length > 0 && !line.trim().startsWith("|"));
}

describe("MarkdownRenderer", () => {
  it("keeps compact output lossless while changing only presentation", () => {
    const tableRows = Array.from({ length: 15 }, (_, index) => [`key-${index + 1}`, `value-${index + 1}`]);
    const textLines = Array.from({ length: 8 }, (_, index) => `line ${index + 1}`);

    const report: ReportDocument = {
      command: "summary",
      title: "Lossless Compact Test",
      generatedAt: "2026-01-31T00:00:00.000Z",
      schemaVersion: "test-markdown-v1",
      sections: [
        {
          id: "sample.table",
          title: "Sample Table",
          type: "table",
          table: {
            headers: ["Key", "Value"],
            rows: tableRows
          }
        },
        {
          id: "sample.text",
          title: "Sample Text",
          type: "text",
          text: textLines
        }
      ]
    };

    const renderer = new MarkdownRenderer();
    const markdown = renderer.render(report, "md");
    const compact = renderer.render(report, "compact");

    const markdownTableRows = extractTableDataRows(markdown, "Sample Table");
    const compactTableRows = extractTableDataRows(compact, "Sample Table");
    const markdownTextLines = extractTextLines(markdown, "Sample Text");
    const compactTextLines = extractTextLines(compact, "Sample Text");

    expect(markdownTableRows).toEqual(tableRows);
    expect(compactTableRows).toEqual(tableRows);
    expect(markdownTextLines).toEqual(textLines);
    expect(compactTextLines).toEqual(textLines);
    expect(compactTableRows.length).toBe(markdownTableRows.length);
    expect(compactTextLines.length).toBe(markdownTextLines.length);
    expect(compact).not.toContain("_truncated");

    expect(markdown).toContain("## [sample.table] Sample Table");
    expect(compact).toContain("### [sample.table] Sample Table");
    expect(markdown).toContain("| Key | Value |");
    expect(compact).toContain("|Key|Value|");
  });

  it("renders fixed execution metadata and deterministic empty table state", () => {
    const report: ReportDocument = {
      command: "health",
      title: "Health Status",
      generatedAt: "2026-01-31T00:00:00.000Z",
      asOf: "2026-01-31T00:00:10.000Z",
      schemaVersion: "health-markdown-v1",
      healthStatus: "failed",
      dataCompleteness: {
        state: "unsupported",
        partial: true,
        warnings: ["Data completeness is not tracked for health check reports."],
        issues: []
      },
      sources: [
        {
          id: "health_check",
          kind: "health_check",
          provider: "bybit",
          fetchedAt: "2026-01-31T00:00:00.000Z",
          capturedAt: "2026-01-31T00:00:10.000Z",
          exchangeServerTime: "2026-01-31T00:00:10.000Z",
          cacheStatus: "unknown"
        }
      ],
      sections: [
        {
          id: "health.checks",
          title: "Checks",
          type: "table",
          table: {
            headers: ["Check", "Status"],
            rows: []
          }
        }
      ]
    };

    const markdown = new MarkdownRenderer().render(report, "md");

    expect(markdown).toContain("Command: health");
    expect(markdown).toContain("Outcome: failed");
    expect(markdown).toContain("As Of: 2026-01-31T00:00:10.000Z");
    expect(markdown).toContain("Exit Code: 5 (health_check_failed)");
    expect(markdown).toContain("Data Completeness: unsupported");
    expect(markdown).toContain("Health Status: failed");
    expect(markdown).toContain("Source Freshness: 1 source(s)");
    expect(markdown).toContain("Source: health_check:");
    expect(markdown).toContain("| <empty> | <empty> |");
  });
});
