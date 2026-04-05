import { readFileSync } from "node:fs";
import { describe, expect, it } from "bun:test";

describe("README contract", () => {
  it("does not document removed --lang option", () => {
    const readme = readFileSync(new URL("../README.md", import.meta.url), "utf8");

    expect(readme).not.toContain("--lang");
  });

  it("documents automation exit semantics", () => {
    const readme = readFileSync(new URL("../README.md", import.meta.url), "utf8");

    expect(readme).toContain("## Exit Codes (Automation Contract)");
    expect(readme).toContain("`0` complete success");
    expect(readme).toContain("`3` optional partial success");
    expect(readme).toContain("`4` critical incomplete / unsupported analytics");
    expect(readme).toContain("`5` health-check failure");
    expect(readme).toContain("`1` runtime failure");
    expect(readme).toContain("`2` usage/config failure");
  });

  it("documents fixed execution metadata ordering", () => {
    const readme = readFileSync(new URL("../README.md", import.meta.url), "utf8");

    expect(readme).toContain("Report metadata lines are fixed and ordered:");
    expect(readme).toContain("`As Of`");
    expect(readme).toContain("`Outcome`");
    expect(readme).toContain("`Exit Code`");
    expect(readme).toContain("`Source Freshness`");
    expect(readme).not.toContain("`Partial Data`");
  });

  it("documents versioned json output", () => {
    const readme = readFileSync(new URL("../README.md", import.meta.url), "utf8");

    expect(readme).toContain("## JSON Contract");
    expect(readme).toContain("`--format json` emits `report-json-v1`");
    expect(readme).toContain("machine-usable numeric/report payloads");
  });
});
