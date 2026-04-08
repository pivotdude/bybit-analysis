import { existsSync, readFileSync } from "node:fs";
import { resolve as resolvePath } from "node:path";
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

function parseEnvValue(rawValue: string): string {
  const trimmed = rawValue.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }

  return trimmed;
}

function readEnvFile(cwd: string): Record<string, string | undefined> {
  const envFilePath = resolvePath(cwd, ".env");
  if (!existsSync(envFilePath)) {
    return {};
  }

  const parsed: Record<string, string | undefined> = {};
  for (const line of readFileSync(envFilePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex <= 0) {
      continue;
    }

    const rawKey = trimmed.slice(0, separatorIndex).trim();
    const key = rawKey.startsWith("export ") ? rawKey.slice(7).trim() : rawKey;
    if (!key) {
      continue;
    }

    parsed[key] = parseEnvValue(trimmed.slice(separatorIndex + 1));
  }

  return parsed;
}

export interface CliRuntimeEnv {
  ambientEnv: AmbientEnvResolution;
  values: Record<string, string | undefined>;
}

export function createProcessEnvMap(
  env: Record<string, string | undefined> = process.env,
  cwd: string = process.cwd()
): Record<string, string | undefined> {
  return {
    ...readEnvFile(cwd),
    ...cloneEnv(env)
  };
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
