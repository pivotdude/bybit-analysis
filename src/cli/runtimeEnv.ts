import { ENV_VARS } from "../configEnv";
import type { AmbientEnvResolution } from "../types/config.types";

function isTruthyEnvValue(value: string | undefined): boolean {
  if (!value) {
    return false;
  }

  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

function hasNoEnvFlag(argv: string[]): boolean {
  return argv.includes("--no-env");
}

function cloneEnv(env: Record<string, string | undefined>): Record<string, string | undefined> {
  return Object.fromEntries(Object.entries(env));
}

export interface CliRuntimeEnv {
  ambientEnv: AmbientEnvResolution;
  values: Record<string, string | undefined>;
}

export function createProcessEnvMap(
  env: Record<string, string | undefined> = process.env
): Record<string, string | undefined> {
  return cloneEnv(env);
}

export function resolveCliRuntimeEnv(
  argv: string[],
  env: Record<string, string | undefined> = createProcessEnvMap()
): CliRuntimeEnv {
  const disabledByCli = hasNoEnvFlag(argv);
  const disabledByEnv = isTruthyEnvValue(env[ENV_VARS.disableEnv]);
  const enabled = !disabledByCli && !disabledByEnv;

  return {
    ambientEnv: {
      enabled,
      source: disabledByCli ? "cli" : disabledByEnv ? "env" : "default",
      usedVars: []
    },
    values: enabled ? cloneEnv(env) : {}
  };
}
