import { describe, expect, it } from "bun:test";
import { parseArgs, renderHelp } from "./parseArgs";

describe("parseArgs secret flags", () => {
  it("rejects insecure secret flags by default", () => {
    const parsed = parseArgs(["summary", "--api-key", "cli_key", "--api-secret", "cli_secret"], {});

    expect(parsed.options.apiKey).toBeUndefined();
    expect(parsed.options.apiSecret).toBeUndefined();
    expect(parsed.errors).toContain(
      "Option --api-key is insecure and disabled by default. Use BYBIT_API_KEY / BYBIT_SECRET (or BYBIT_API_SECRET), .env, or a credential profile. If you must bypass this temporarily, set BYBIT_ALLOW_INSECURE_CLI_SECRETS=1."
    );
    expect(parsed.errors).toContain(
      "Option --api-secret is insecure and disabled by default. Use BYBIT_API_KEY / BYBIT_SECRET (or BYBIT_API_SECRET), .env, or a credential profile. If you must bypass this temporarily, set BYBIT_ALLOW_INSECURE_CLI_SECRETS=1."
    );
  });

  it("allows insecure secret flags only with explicit legacy override", () => {
    const parsed = parseArgs(
      ["summary", "--api-key", "cli_key", "--api-secret", "cli_secret"],
      { BYBIT_ALLOW_INSECURE_CLI_SECRETS: "1" }
    );

    expect(parsed.errors).toEqual([]);
    expect(parsed.options.apiKey).toBe("cli_key");
    expect(parsed.options.apiSecret).toBe("cli_secret");
  });
});

describe("parseArgs config diagnostics", () => {
  it("enables expanded config diagnostics only with explicit flag", () => {
    const parsed = parseArgs(["config", "--config-diagnostics"], {});

    expect(parsed.errors).toEqual([]);
    expect(parsed.options.configDiagnostics).toBe(true);
  });
});

describe("renderHelp", () => {
  it("marks raw credential flags as deprecated and insecure", () => {
    const help = renderHelp();

    expect(help).toContain("--api-key <value>  [deprecated, insecure; disabled by default]");
    expect(help).toContain("--api-secret <value>  [deprecated, insecure; disabled by default]");
    expect(help).toContain("BYBIT_ALLOW_INSECURE_CLI_SECRETS=1");
    expect(help).toContain("--config-diagnostics  show expanded config diagnostics (sensitive identifiers)");
    expect(help).toContain("BYBIT_CONFIG_DIAGNOSTICS=1 enables expanded config details");
  });
});
