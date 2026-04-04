import { describe, expect, it } from "bun:test";

const decoder = new TextDecoder();
const BYBIT_ENV_KEYS = [
  "BYBIT_API_KEY",
  "BYBIT_SECRET",
  "BYBIT_API_SECRET",
  "BYBIT_PROFILE",
  "BYBIT_PROFILES_FILE",
  "BYBIT_SOURCE_MODE",
  "BYBIT_FGRID_BOT_IDS",
  "BYBIT_SPOT_GRID_IDS",
  "BYBIT_CONFIG_DIAGNOSTICS",
  "BYBIT_ALLOW_INSECURE_CLI_SECRETS"
] as const;

function createCliEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) {
      env[key] = value;
    }
  }

  for (const key of BYBIT_ENV_KEYS) {
    delete env[key];
  }

  return env;
}

function runCli(args: string[]): { exitCode: number; stdout: string; stderr: string } {
  const processResult = Bun.spawnSync({
    cmd: ["bun", "run", "src/index.ts", ...args],
    cwd: process.cwd(),
    env: createCliEnv(),
    stdout: "pipe",
    stderr: "pipe"
  });

  return {
    exitCode: processResult.exitCode,
    stdout: decoder.decode(processResult.stdout),
    stderr: decoder.decode(processResult.stderr)
  };
}

describe("CLI stdout/stderr contract", () => {
  it("writes parse errors to stderr and keeps stdout empty for invalid command", () => {
    const result = runCli(["frobnicate"]);

    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("Unknown command: frobnicate");
    expect(result.stderr).toContain("Hint: run with --help to see usage.");
  });

  it("keeps parse failure on stderr even when --help is also present", () => {
    const result = runCli(["frobnicate", "--help"]);

    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("Unknown command: frobnicate");
  });

  it("prints help to stdout and exits 0 for --help", () => {
    const result = runCli(["--help"]);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain("Usage:");
  });

  it("prints command-specific help to stdout and exits 0 for <command> --help", () => {
    const result = runCli(["summary", "--help"]);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain("# bybit-analysis summary");
    expect(result.stdout).toContain("bybit-analysis summary [options]");
  });

  it("returns usage diagnostics to stderr when command is missing", () => {
    const result = runCli([]);

    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("Command is required");
    expect(result.stderr).toContain("Hint: run with --help to see usage.");
  });

  it("routes runtime usage errors to stderr and keeps stdout empty", () => {
    const result = runCli(["summary", "--source", "bot"]);

    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("For --source bot provide --fgrid-bot-ids and/or --spot-grid-ids");
  });

  it("rejects insecure credential flags in argv by default", () => {
    const result = runCli(["summary", "--api-key", "cli_key", "--api-secret", "cli_secret"]);

    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("Option --api-key is insecure and disabled by default");
    expect(result.stderr).toContain("Option --api-secret is insecure and disabled by default");
  });
});
