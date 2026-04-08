import { afterEach, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const decoder = new TextDecoder();
const createdDirs: string[] = [];
const BOT_UNAVAILABLE_MESSAGE =
  "Bot analytics are unavailable for the selected profile. Provide --fgrid-bot-ids and/or --spot-grid-ids (or env BYBIT_FGRID_BOT_IDS/BYBIT_SPOT_GRID_IDS)";
const SPOT_LIMITATION_MESSAGE =
  "Spot market exposure/risk is unsupported: spot balances are not modeled as exposure-bearing positions.";
const FIXTURE_MODE_ENV = "BYBIT_INTERNAL_TEST_FIXTURE_MODE";
const FIXTURE_API_KEY = "fixture-api-key";
const FIXTURE_API_SECRET = "fixture-api-secret";
const BYBIT_ENV_KEYS = [
  "BYBIT_API_KEY",
  "BYBIT_API_SECRET",
  "BYBIT_SECRET",
  "BYBIT_PROFILE",
  "BYBIT_PROFILES_FILE",
  "BYBIT_SOURCE_MODE",
  "BYBIT_FGRID_BOT_IDS",
  "BYBIT_SPOT_GRID_IDS",
  "BYBIT_DISABLE_ENV",
  "BYBIT_CONFIG_DIAGNOSTICS"
] as const;

interface JsonReportSection {
  id: string;
  type: string;
  table?: {
    rows?: string[][];
    emptyMessage?: string;
  };
}

interface JsonReportPayload {
  jsonSchemaVersion: string;
  reportSchemaVersion: string;
  command: string;
  outcome?: {
    exitCode?: number;
    exitCodeLabel?: string;
    dataCompletenessState?: string;
  };
  sections?: JsonReportSection[];
  data?: Record<string, unknown>;
}

function createTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "bybit-cli-smoke-"));
  createdDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of createdDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

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

function createProfilesFile(): string {
  const dir = createTempDir();
  const profilesFile = join(dir, ".bybit-profiles.json");
  writeFileSync(
    profilesFile,
    JSON.stringify(
      {
        FT_NFI: {
          apiKeyEnv: "FT_NFI_API_KEY",
          apiSecretEnv: "FT_NFI_API_SECRET",
          category: "spot"
        },
        GRID_BOT: {
          apiKeyEnv: "GRID_BOT_API_KEY",
          apiSecretEnv: "GRID_BOT_API_SECRET",
          category: "spot",
          sourceMode: "bot",
          spotGridBotIds: ["fixture-grid-btc", "fixture-grid-eth"]
        }
      },
      null,
      2
    ),
    "utf8"
  );
  return profilesFile;
}

function runCli(
  args: string[],
  envOverrides: Record<string, string> = {}
): { exitCode: number; stdout: string; stderr: string } {
  const processResult = Bun.spawnSync({
    cmd: ["bun", "--no-env-file", "run", "src/index.ts", ...args],
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

function runCliWithProfiles(
  args: string[],
  envOverrides: Record<string, string> = {}
): { exitCode: number; stdout: string; stderr: string } {
  return runCli(args, {
    BYBIT_PROFILES_FILE: createProfilesFile(),
    [FIXTURE_MODE_ENV]: "smoke",
    FT_NFI_API_KEY: FIXTURE_API_KEY,
    FT_NFI_API_SECRET: FIXTURE_API_SECRET,
    GRID_BOT_API_KEY: FIXTURE_API_KEY,
    GRID_BOT_API_SECRET: FIXTURE_API_SECRET,
    ...envOverrides
  });
}

const itFtNfiProfile = it;
const itGridBotProfile = it;

function parseJsonReport(stdout: string): JsonReportPayload {
  return JSON.parse(stdout) as JsonReportPayload;
}

function getJsonSection(payload: JsonReportPayload, sectionId: string): JsonReportSection | undefined {
  return payload.sections?.find((section) => section.id === sectionId);
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
    expect(result.stdout).toContain("## [config.effective_configuration] Effective Configuration");
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

  it("supports json output mode with machine-readable contract metadata", () => {
    const result = runCli([
      "config",
      "--format",
      "json",
      "--from",
      "2026-01-01T00:00:00.000Z",
      "--to",
      "2026-01-02T00:00:00.000Z"
    ]);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    const payload = JSON.parse(result.stdout) as Record<string, unknown>;
    expect(payload.jsonSchemaVersion).toBe("report-json-v1");
    expect(payload.command).toBe("config");
    expect(payload.reportSchemaVersion).toBe("config-markdown-v1");
    expect(Array.isArray(payload.sources)).toBe(true);
    expect(Array.isArray(payload.sections)).toBe(true);
    expect(typeof payload.data).toBe("object");
  });

  it("reports hermetic ambient env mode and used env vars", () => {
    const result = runCli([
      "config",
      "--no-env",
      "--from",
      "2026-01-01T00:00:00.000Z",
      "--to",
      "2026-01-02T00:00:00.000Z"
    ], {
      BYBIT_CATEGORY: "spot",
      BYBIT_TIMEOUT_MS: "15000"
    });

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain("| ambientEnv.enabled | false |");
    expect(result.stdout).toContain("| ambientEnv.source | cli |");
    expect(result.stdout).toContain("| ambientEnv.usedVars | <none> |");
    expect(result.stdout).toContain("| category | linear |");
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

  itFtNfiProfile("covers FT_NFI summary in markdown, compact, and json formats", () => {
    const baseArgs = ["summary", "--profile", "FT_NFI"];
    const markdown = runCliWithProfiles(baseArgs);
    const compact = runCliWithProfiles([...baseArgs, "--format", "compact"]);
    const json = runCliWithProfiles([...baseArgs, "--format", "json"]);

    expect(markdown.exitCode).toBe(3);
    expect(markdown.stderr).toBe("");
    expect(markdown.stdout).toContain("# Account Summary");
    expect(markdown.stdout).toContain("[summary.overview] Overview");
    expect(markdown.stdout).toContain("[summary.symbol_pnl] Symbol PnL");
    expect(markdown.stdout).toContain(`Spot limitation: ${SPOT_LIMITATION_MESSAGE}`);
    expect(markdown.stdout).toContain("> No tracked bots");

    expect(compact.exitCode).toBe(3);
    expect(compact.stderr).toBe("");
    expect(compact.stdout).toContain("[summary.overview] Overview");
    expect(compact.stdout).toContain("[summary.symbol_pnl] Symbol PnL");
    expect(compact.stdout).toContain("> No tracked bots");

    expect(json.exitCode).toBe(3);
    expect(json.stderr).toBe("");
    const payload = parseJsonReport(json.stdout);
    expect(payload.jsonSchemaVersion).toBe("report-json-v1");
    expect(payload.command).toBe("summary");
    expect(payload.reportSchemaVersion).toBe("summary-markdown-v1");
    expect(payload.outcome?.exitCode).toBe(3);
    expect(payload.outcome?.exitCodeLabel).toBe("partial_optional");
    expect(payload.outcome?.dataCompletenessState).toBe("partial_optional");
    expect(payload.sections?.map((section) => section.id)).toEqual(
      expect.arrayContaining(["summary.overview", "summary.symbol_pnl", "summary.bots"])
    );
    expect(getJsonSection(payload, "summary.bots")?.table?.emptyMessage).toBe("No tracked bots");
  });

  itGridBotProfile("covers GRID_BOT summary in compact and json formats", () => {
    const baseArgs = ["summary", "--profile", "GRID_BOT"];
    const compact = runCliWithProfiles([...baseArgs, "--format", "compact"]);
    const json = runCliWithProfiles([...baseArgs, "--format", "json"]);

    expect(compact.exitCode).toBe(3);
    expect(compact.stderr).toBe("");
    expect(compact.stdout).toContain("Context: spot / bot");
    expect(compact.stdout).toContain("[summary.overview] Overview");
    expect(compact.stdout).toContain("[summary.bots] Bots");

    expect(json.exitCode).toBe(3);
    expect(json.stderr).toBe("");
    const payload = parseJsonReport(json.stdout);
    expect(payload.command).toBe("summary");
    expect(payload.reportSchemaVersion).toBe("summary-markdown-v1");
    expect(payload.outcome?.exitCode).toBe(3);
    expect(payload.sections?.map((section) => section.id)).toEqual(
      expect.arrayContaining(["summary.overview", "summary.bots"])
    );

    const botsSection = getJsonSection(payload, "summary.bots");
    expect(botsSection?.table?.rows?.length ?? 0).toBeGreaterThan(0);
    const firstBotName = botsSection?.table?.rows?.[0]?.[0];
    expect(firstBotName).toBeTruthy();
    expect(compact.stdout).toContain(String(firstBotName));
  });

  itFtNfiProfile("covers bots unavailable UX for market profile", () => {
    const result = runCliWithProfiles(["bots", "--profile", "FT_NFI", "--format", "compact"]);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain("# Bots Analytics");
    expect(result.stdout).toContain(BOT_UNAVAILABLE_MESSAGE);
    expect(result.stdout).toContain(
      "This run is supported, but no bot analytics can be shown until bot ids are configured or a supported bot integration is available."
    );
  });

  itGridBotProfile("covers GRID_BOT bots in markdown, compact, and json formats", () => {
    const baseArgs = ["bots", "--profile", "GRID_BOT"];
    const markdown = runCliWithProfiles(baseArgs);
    const compact = runCliWithProfiles([...baseArgs, "--format", "compact"]);
    const json = runCliWithProfiles([...baseArgs, "--format", "json"]);

    expect(markdown.exitCode).toBe(0);
    expect(markdown.stderr).toBe("");
    expect(markdown.stdout).toContain("# Bots Analytics");
    expect(markdown.stdout).toContain("[bots.per_bot_table] Per-Bot Table");
    expect(markdown.stdout).toContain("[bots.technical_details] Technical Details");

    expect(compact.exitCode).toBe(0);
    expect(compact.stderr).toBe("");
    expect(compact.stdout).toContain("[bots.per_bot_table] Per-Bot Table");
    expect(compact.stdout).toContain("[bots.technical_details] Technical Details");

    expect(json.exitCode).toBe(0);
    expect(json.stderr).toBe("");
    const payload = parseJsonReport(json.stdout);
    expect(payload.jsonSchemaVersion).toBe("report-json-v1");
    expect(payload.command).toBe("bots");
    expect(payload.reportSchemaVersion).toBe("bots-markdown-v1");
    expect(payload.outcome?.exitCode).toBe(0);
    expect(payload.sections?.map((section) => section.id)).toEqual(
      expect.arrayContaining(["bots.summary", "bots.per_bot_table", "bots.technical_details"])
    );

    const perBotSection = getJsonSection(payload, "bots.per_bot_table");
    expect(perBotSection?.table?.rows?.length ?? 0).toBeGreaterThan(0);
    const firstBotName = perBotSection?.table?.rows?.[0]?.[0];
    expect(firstBotName).toBeTruthy();
    expect(markdown.stdout).toContain(String(firstBotName));
    expect(compact.stdout).toContain(String(firstBotName));
  });

  itFtNfiProfile("keeps protected spot unsupported commands successful", () => {
    const positions = runCliWithProfiles(["positions", "--profile", "FT_NFI", "--format", "compact"]);
    const exposure = runCliWithProfiles(["exposure", "--profile", "FT_NFI", "--format", "compact"]);

    expect(positions.exitCode).toBe(0);
    expect(positions.stderr).toBe("");
    expect(positions.stdout).toContain("# Positions Analytics");
    expect(positions.stdout).toContain("Data Completeness: unsupported");
    expect(positions.stdout).toContain("[positions.alerts] Alerts");
    expect(positions.stdout).toContain(SPOT_LIMITATION_MESSAGE);

    expect(exposure.exitCode).toBe(0);
    expect(exposure.stderr).toBe("");
    expect(exposure.stdout).toContain("# Exposure Analytics");
    expect(exposure.stdout).toContain("Data Completeness: unsupported");
    expect(exposure.stdout).toContain("[exposure.per_asset] Per-Asset Exposure");
    expect(exposure.stdout).toContain(SPOT_LIMITATION_MESSAGE);
  });
});
