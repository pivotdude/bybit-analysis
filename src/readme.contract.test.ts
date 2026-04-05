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
    expect(readme).toContain("`3` degraded success");
    expect(readme).toContain("`4` health-check failure");
    expect(readme).toContain("`1` runtime failure");
    expect(readme).toContain("`2` usage/config failure");
  });

  it("documents fixed execution metadata ordering", () => {
    const readme = readFileSync(new URL("../README.md", import.meta.url), "utf8");

    expect(readme).toContain("Report metadata lines are fixed and ordered:");
    expect(readme).toContain("`Outcome`");
    expect(readme).toContain("`Exit Code`");
    expect(readme).toContain("`Partial Data`");
  });
});
