import { afterEach, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createProcessEnvMap, resolveCliRuntimeEnv } from "./runtimeEnv";

const createdDirs: string[] = [];

function createTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "bybit-runtime-env-"));
  createdDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of createdDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("createProcessEnvMap", () => {
  it("loads .env values from the working directory", () => {
    const dir = createTempDir();
    writeFileSync(join(dir, ".env"), "GRID_BOT_API_KEY=grid_key\nGRID_BOT_API_SECRET=grid_secret\n", "utf8");

    const env = createProcessEnvMap({}, dir);

    expect(env.GRID_BOT_API_KEY).toBe("grid_key");
    expect(env.GRID_BOT_API_SECRET).toBe("grid_secret");
  });

  it("keeps inherited env higher priority than .env", () => {
    const dir = createTempDir();
    writeFileSync(join(dir, ".env"), "BYBIT_CATEGORY=spot\n", "utf8");

    const env = createProcessEnvMap({ BYBIT_CATEGORY: "linear" }, dir);

    expect(env.BYBIT_CATEGORY).toBe("linear");
  });
});

describe("resolveCliRuntimeEnv", () => {
  it("keeps inherited env available by default", () => {
    const runtimeEnv = resolveCliRuntimeEnv(["config"], {
      BYBIT_CATEGORY: "spot"
    });

    expect(runtimeEnv.ambientEnv.enabled).toBe(true);
    expect(runtimeEnv.ambientEnv.source).toBe("default");
    expect(runtimeEnv.values.BYBIT_CATEGORY).toBe("spot");
  });

  it("disables ambient env with --no-env", () => {
    const runtimeEnv = resolveCliRuntimeEnv(["config", "--no-env"], {
      BYBIT_CATEGORY: "spot"
    });

    expect(runtimeEnv.ambientEnv.enabled).toBe(false);
    expect(runtimeEnv.ambientEnv.source).toBe("cli");
    expect(runtimeEnv.values).toEqual({});
  });

  it("disables ambient env with BYBIT_DISABLE_ENV=1", () => {
    const runtimeEnv = resolveCliRuntimeEnv(["config"], {
      BYBIT_DISABLE_ENV: "1",
      BYBIT_CATEGORY: "spot"
    });

    expect(runtimeEnv.ambientEnv.enabled).toBe(false);
    expect(runtimeEnv.ambientEnv.source).toBe("env");
    expect(runtimeEnv.values).toEqual({});
  });
});
