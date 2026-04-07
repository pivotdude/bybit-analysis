import { describe, expect, it } from "bun:test";
import { renderTable } from "./table.section";

function countUnescapedPipes(line: string): number {
  let count = 0;
  for (let index = 0; index < line.length; index += 1) {
    if (line[index] !== "|") {
      continue;
    }

    let backslashes = 0;
    let pointer = index - 1;
    while (pointer >= 0 && line[pointer] === "\\") {
      backslashes += 1;
      pointer -= 1;
    }

    if (backslashes % 2 === 0) {
      count += 1;
    }
  }

  return count;
}

describe("renderTable", () => {
  it("escapes markdown-sensitive cell content", () => {
    const lines = renderTable({
      headers: ["Field", "Value"],
      rows: [["closeReason", "tp|sl\r\nmanual\\override"]]
    });

    expect(lines[0]).toBe("| Field | Value |");
    expect(lines[2]).toBe("| closeReason | tp\\|sl<br />manual\\\\override |");
    expect(countUnescapedPipes(lines[2]!)).toBe(3);
  });

  it("applies the same escaping in compact mode", () => {
    const lines = renderTable(
      {
        headers: ["Field", "Value"],
        rows: [["note", "risk|ops\nline2"]]
      },
      true
    );

    expect(lines[0]).toBe("|Field|Value|");
    expect(lines[2]).toBe("|note|risk\\|ops<br />line2|");
    expect(countUnescapedPipes(lines[2]!)).toBe(3);
  });

  it("keeps long cell text without truncation", () => {
    const longText = "x".repeat(4_096);
    const lines = renderTable({
      headers: ["Field", "Value"],
      rows: [["message", longText]]
    });

    expect(lines[2]).toContain(longText);
    expect(lines[2]!.includes("...")).toBe(false);
  });

  it("renders only headers when table has no data rows", () => {
    const lines = renderTable({
      headers: ["Field", "Value"],
      rows: []
    });

    expect(lines).toEqual(["| Field | Value |", "| --- | --- |"]);
  });

  it("renders an explicit empty message with headers by default", () => {
    const lines = renderTable({
      headers: ["Field", "Value"],
      rows: [],
      emptyMessage: "No data"
    });

    expect(lines).toEqual(["| Field | Value |", "| --- | --- |", "> No data"]);
  });

  it("renders only an empty message when message_only mode is requested", () => {
    const lines = renderTable({
      headers: ["Field", "Value"],
      rows: [],
      emptyMessage: "No data",
      emptyMode: "message_only"
    });

    expect(lines).toEqual(["> No data"]);
  });
});
