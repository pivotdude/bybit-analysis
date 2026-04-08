import { afterEach, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveProfile, resolveProfilesPath } from "./config/profile";

const createdDirs: string[] = [];

function createTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "bybit-profile-path-"));
  createdDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of createdDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("resolveProfilesPath", () => {
  it("uses <projectRoot>/.bybit-profiles.json by default", () => {
    const projectRoot = createTempDir();

    expect(resolveProfilesPath({ projectRoot }, {})).toBe(join(projectRoot, ".bybit-profiles.json"));
  });

  it("resolves relative profiles file against project root", () => {
    const projectRoot = createTempDir();

    expect(resolveProfilesPath({ projectRoot, profilesFile: "profiles/custom.json" }, {})).toBe(
      join(projectRoot, "profiles/custom.json")
    );
  });

  it("keeps absolute profiles file paths unchanged", () => {
    const projectRoot = createTempDir();
    const absoluteProfilesFile = join(createTempDir(), "profiles.json");

    expect(resolveProfilesPath({ projectRoot, profilesFile: absoluteProfilesFile }, {})).toBe(absoluteProfilesFile);
  });
});

describe("resolveProfile", () => {
  it("loads profiles from the project root by default", () => {
    const projectRoot = createTempDir();
    writeFileSync(
      join(projectRoot, ".bybit-profiles.json"),
      JSON.stringify({
        main: {
          apiKeyEnv: "MAIN_API_KEY",
          apiSecretEnv: "MAIN_API_SECRET"
        }
      }),
      "utf8"
    );

    const resolved = resolveProfile({ projectRoot, profile: "main" }, {});

    expect(resolved).toEqual({
      name: "main",
      value: {
        apiKeyEnv: "MAIN_API_KEY",
        apiSecretEnv: "MAIN_API_SECRET",
        exchangeProvider: undefined,
        category: undefined,
        sourceMode: undefined,
        futuresGridBotIds: undefined,
        spotGridBotIds: undefined
      }
    });
  });
});
