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

describe("parseArgs CLI conventions", () => {
  const cases: Array<{
    name: string;
    argv: string[];
    assert: (parsed: ReturnType<typeof parseArgs>) => void;
  }> = [
    {
      name: "supports deterministic env opt-out flag",
      argv: ["summary", "--no-env"],
      assert: (parsed) => {
        expect(parsed.command).toBe("summary");
        expect(parsed.errors).toEqual([]);
        expect(parsed.options.noEnv).toBe(true);
      }
    },
    {
      name: "supports --flag=value syntax",
      argv: ["summary", "--format=compact", "--timeout-ms=15000"],
      assert: (parsed) => {
        expect(parsed.command).toBe("summary");
        expect(parsed.errors).toEqual([]);
        expect(parsed.options.format).toBe("compact");
        expect(parsed.options.timeoutMs).toBe(15000);
      }
    },
    {
      name: "parses explicit exchange provider selection",
      argv: ["summary", "--exchange-provider=bybit"],
      assert: (parsed) => {
        expect(parsed.command).toBe("summary");
        expect(parsed.errors).toEqual([]);
        expect(parsed.options.exchangeProvider).toBe("bybit");
      }
    },
    {
      name: "supports option terminator -- and keeps remaining args positional",
      argv: ["summary", "--", "--format=compact"],
      assert: (parsed) => {
        expect(parsed.command).toBe("summary");
        expect(parsed.options.format).toBeUndefined();
        expect(parsed.errors).toEqual(["Unexpected argument for summary: --format=compact"]);
      }
    },
    {
      name: "applies last-value-wins for repeated scalar options",
      argv: ["summary", "--format", "md", "--format", "json"],
      assert: (parsed) => {
        expect(parsed.errors).toEqual([]);
        expect(parsed.options.format).toBe("json");
      }
    },
    {
      name: "appends repeated list options in argument order",
      argv: ["summary", "--fgrid-bot-ids", "1,2", "--fgrid-bot-ids", "3", "--spot-grid-ids=9,10"],
      assert: (parsed) => {
        expect(parsed.errors).toEqual([]);
        expect(parsed.options.futuresGridBotIds).toEqual(["1", "2", "3"]);
        expect(parsed.options.spotGridBotIds).toEqual(["9", "10"]);
      }
    },
    {
      name: "supports command-specific help path",
      argv: ["summary", "--help"],
      assert: (parsed) => {
        expect(parsed.command).toBe("summary");
        expect(parsed.errors).toEqual([]);
        expect(parsed.options.help).toBe(true);
      }
    }
  ];

  for (const testCase of cases) {
    it(testCase.name, () => {
      const parsed = parseArgs(testCase.argv, {});
      testCase.assert(parsed);
    });
  }
});

describe("parseArgs config diagnostics", () => {
  it("enables expanded config diagnostics only with explicit flag", () => {
    const parsed = parseArgs(["config", "--config-diagnostics"], {});

    expect(parsed.errors).toEqual([]);
    expect(parsed.options.configDiagnostics).toBe(true);
  });

  it("rejects removed --lang option", () => {
    const parsed = parseArgs(["config", "--lang", "en"], {});

    expect(parsed.errors).toContain("Unknown option: --lang");
  });
});

describe("renderHelp", () => {
  it("marks raw credential flags as deprecated and insecure", () => {
    const help = renderHelp();

    expect(help).toContain("--api-key <value>  [deprecated, insecure; disabled by default]");
    expect(help).toContain("--api-secret <value>  [deprecated, insecure; disabled by default]");
    expect(help).toContain("--no-env  disable ambient BYBIT_* env resolution for deterministic runs");
    expect(help).toContain("BYBIT_ALLOW_INSECURE_CLI_SECRETS=1");
    expect(help).toContain("BYBIT_EXCHANGE_PROVIDER=<bybit>");
    expect(help).toContain("--config-diagnostics  show expanded config diagnostics (sensitive identifiers)");
    expect(help).toContain("--exchange-provider <bybit>");
    expect(help).toContain("--format <md|compact|json>");
    expect(help).toContain("json emits a versioned machine-readable report document");
    expect(help).toContain("BYBIT_CONFIG_DIAGNOSTICS=1 enables expanded config details");
    expect(help).toContain("BYBIT_DISABLE_ENV=1 disables ambient BYBIT_* env loading");
    expect(help).not.toContain("--lang");
  });

  it("renders command-specific usage when command is provided", () => {
    const help = renderHelp("summary");

    expect(help).toContain("# bybit-analysis summary");
    expect(help).toContain("Command type: period analytics");
    expect(help).toContain("bybit-analysis summary [options]");
    expect(help).toContain("CLI conventions:");
  });

  it("documents live snapshot commands as rejecting historical time flags", () => {
    const help = renderHelp("balance");

    expect(help).toContain("Command type: live snapshot");
    expect(help).toContain("period commands only: summary, pnl, performance, bots");
  });
});
