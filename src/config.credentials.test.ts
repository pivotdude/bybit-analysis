import { afterEach, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveRuntimeConfig } from "./config";

const createdDirs: string[] = [];

function createProfilesFile(contents: Record<string, unknown>): string {
  const dir = mkdtempSync(join(tmpdir(), "bybit-analysis-test-"));
  createdDirs.push(dir);
  const path = join(dir, ".bybit-profiles.json");
  writeFileSync(path, JSON.stringify(contents), "utf8");
  return path;
}

afterEach(() => {
  for (const dir of createdDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("resolveRuntimeConfig credential priority", () => {
  it("prefers profile credentials over env and legacy cli flags", () => {
    const profilesFile = createProfilesFile({
      prod: {
        apiKey: "profile_key",
        apiSecret: "profile_secret"
      }
    });

    const config = resolveRuntimeConfig(
      {
        profile: "prod",
        profilesFile,
        apiKey: "cli_key",
        apiSecret: "cli_secret"
      },
      {
        BYBIT_ALLOW_INSECURE_CLI_SECRETS: "1",
        BYBIT_API_KEY: "env_key",
        BYBIT_SECRET: "env_secret"
      }
    );

    expect(config.apiKey).toBe("profile_key");
    expect(config.apiSecret).toBe("profile_secret");
    expect(config.sources.apiKey).toBe("profile");
    expect(config.sources.apiSecret).toBe("profile");
  });

  it("prefers env credentials over legacy cli flags", () => {
    const config = resolveRuntimeConfig(
      {
        apiKey: "cli_key",
        apiSecret: "cli_secret"
      },
      {
        BYBIT_ALLOW_INSECURE_CLI_SECRETS: "1",
        BYBIT_API_KEY: "env_key",
        BYBIT_SECRET: "env_secret"
      }
    );

    expect(config.apiKey).toBe("env_key");
    expect(config.apiSecret).toBe("env_secret");
    expect(config.sources.apiKey).toBe("env");
    expect(config.sources.apiSecret).toBe("env");
  });

  it("uses legacy cli flags only when explicit insecure override is enabled", () => {
    const enabledConfig = resolveRuntimeConfig(
      {
        apiKey: "cli_key",
        apiSecret: "cli_secret"
      },
      {
        BYBIT_ALLOW_INSECURE_CLI_SECRETS: "true"
      }
    );

    expect(enabledConfig.apiKey).toBe("cli_key");
    expect(enabledConfig.apiSecret).toBe("cli_secret");
    expect(enabledConfig.sources.apiKey).toBe("cli");
    expect(enabledConfig.sources.apiSecret).toBe("cli");

    const disabledConfig = resolveRuntimeConfig(
      {
        apiKey: "cli_key",
        apiSecret: "cli_secret"
      },
      {}
    );

    expect(disabledConfig.apiKey).toBe("");
    expect(disabledConfig.apiSecret).toBe("");
    expect(disabledConfig.sources.apiKey).toBe("default");
    expect(disabledConfig.sources.apiSecret).toBe("default");
  });
});
