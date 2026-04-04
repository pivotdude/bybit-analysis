import { describe, expect, it } from "bun:test";
import { resolveCliRuntimeEnv } from "./runtimeEnv";

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
