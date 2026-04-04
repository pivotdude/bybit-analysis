import { readFileSync } from "node:fs";
import { describe, expect, it } from "bun:test";

describe("README contract", () => {
  it("does not document removed --lang option", () => {
    const readme = readFileSync(new URL("../README.md", import.meta.url), "utf8");

    expect(readme).not.toContain("--lang");
  });
});
