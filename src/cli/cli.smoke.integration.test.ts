import { describe, expect, it } from "bun:test";

const decoder = new TextDecoder();
const BYBIT_ENV_KEYS = [
  "BYBIT_API_KEY",
  "BYBIT_API_SECRET",
  "BYBIT_SECRET",
  "BYBIT_PROFILE",
  "BYBIT_PROFILES_FILE",
  "BYBIT_FGRID_BOT_IDS",
  "BYBIT_SPOT_GRID_IDS"
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

describe("CLI smoke/integration", () => {
  it("renders config report successfully and redacts credentials", () => {
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
    ]);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain("# Runtime Configuration");
    expect(result.stdout).toContain("## Effective Configuration");
    expect(result.stdout).toContain("<redacted>");
    expect(result.stdout).not.toContain(apiKey);
    expect(result.stdout).not.toContain(apiSecret);
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
});
