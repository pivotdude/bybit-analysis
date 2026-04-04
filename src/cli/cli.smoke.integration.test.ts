import { describe, expect, it } from "bun:test";

const decoder = new TextDecoder();
const BYBIT_ENV_KEYS = [
  "BYBIT_API_KEY",
  "BYBIT_API_SECRET",
  "BYBIT_SECRET",
  "BYBIT_PROFILE",
  "BYBIT_PROFILES_FILE",
  "BYBIT_FGRID_BOT_IDS",
  "BYBIT_SPOT_GRID_IDS",
  "BYBIT_CONFIG_DIAGNOSTICS"
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

function runCli(
  args: string[],
  envOverrides: Record<string, string> = {}
): { exitCode: number; stdout: string; stderr: string } {
  const processResult = Bun.spawnSync({
    cmd: ["bun", "run", "src/index.ts", ...args],
    cwd: process.cwd(),
    env: {
      ...createCliEnv(),
      ...envOverrides
    },
    stdout: "pipe",
    stderr: "pipe"
  });

  return {
    exitCode: processResult.exitCode,
    stdout: decoder.decode(processResult.stdout),
    stderr: decoder.decode(processResult.stderr)
  };
}

function countTableDataRows(markdown: string): number {
  const separatorRowRegex = /^\|\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?$/;
  return markdown
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("|") && !separatorRowRegex.test(line))
    .length;
}

describe("CLI smoke/integration", () => {
  it("renders config report successfully and keeps safe redaction defaults", () => {
    const apiKey = "integration-test-api-key";
    const apiSecret = "integration-test-api-secret";

    const result = runCli([
      "config",
      "--api-key",
      apiKey,
      "--api-secret",
      apiSecret,
      "--from",
      "2026-01-01T00:00:00.000Z",
      "--to",
      "2026-01-02T00:00:00.000Z"
    ], {
      BYBIT_ALLOW_INSECURE_CLI_SECRETS: "1"
    });

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain("# Runtime Configuration");
    expect(result.stdout).toContain("## Effective Configuration");
    expect(result.stdout).toContain("<configured>");
    expect(result.stdout).not.toContain(apiKey);
    expect(result.stdout).not.toContain(apiSecret);
  });

  it("suppresses bot identifiers by default and reveals them only in diagnostic mode", () => {
    const botId = "bot-sensitive-id-123";
    const baseArgs = [
      "config",
      "--fgrid-bot-ids",
      botId,
      "--from",
      "2026-01-01T00:00:00.000Z",
      "--to",
      "2026-01-02T00:00:00.000Z"
    ];
    const safe = runCli(baseArgs);
    const diagnostic = runCli([...baseArgs, "--config-diagnostics"]);

    expect(safe.exitCode).toBe(0);
    expect(safe.stdout).toContain("configured (1 id)");
    expect(safe.stdout).not.toContain(botId);

    expect(diagnostic.exitCode).toBe(0);
    expect(diagnostic.stdout).toContain(botId);
    expect(diagnostic.stdout).toContain("| configReportMode | diagnostic |");
  });

  it("supports compact output mode in a successful end-to-end run", () => {
    const result = runCli([
      "config",
      "--format",
      "compact",
      "--from",
      "2026-01-01T00:00:00.000Z",
      "--to",
      "2026-01-02T00:00:00.000Z"
    ]);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain("# Runtime Configuration");
  });

  it("keeps compact output lossless for table records vs markdown", () => {
    const baseArgs = [
      "config",
      "--from",
      "2026-01-01T00:00:00.000Z",
      "--to",
      "2026-01-02T00:00:00.000Z"
    ];
    const markdown = runCli(baseArgs);
    const compact = runCli([...baseArgs, "--format", "compact"]);

    expect(markdown.exitCode).toBe(0);
    expect(markdown.stderr).toBe("");
    expect(compact.exitCode).toBe(0);
    expect(compact.stderr).toBe("");
    expect(compact.stdout).not.toContain("_truncated");
    expect(countTableDataRows(compact.stdout)).toBe(countTableDataRows(markdown.stdout));
    expect(compact.stdout).toContain("Secrets are masked by default and never printed in plaintext.");
    expect(compact.stdout).toContain("Safe mode suppresses credential-adjacent and operational identifiers.");
  });
});
