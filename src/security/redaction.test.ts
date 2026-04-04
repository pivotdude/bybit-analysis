import { describe, expect, it } from "bun:test";
import { redactIpWhitelist, redactSecretValue } from "./redaction";

describe("redaction helpers", () => {
  it("redacts present secrets without exposing any characters", () => {
    const redacted = redactSecretValue("bybit-api-key-123456");

    expect(redacted.presence).toBe("present");
    expect(redacted.display).toBe("<redacted>");
    expect(redacted.display).not.toContain("123456");
  });

  it("marks empty secrets as missing", () => {
    expect(redactSecretValue("   ")).toEqual({
      presence: "missing",
      display: "<missing>"
    });
  });

  it("summarizes whitelist without exposing IP values", () => {
    const summary = redactIpWhitelist(["10.20.30.40", "192.168.1.100"]);

    expect(summary.restricted).toBe(true);
    expect(summary.count).toBe(2);
    expect(summary.display).toBe("configured (2 entries)");
    expect(summary.display).not.toContain("10.20.30.40");
    expect(summary.display).not.toContain("192.168.1.100");
  });
});
