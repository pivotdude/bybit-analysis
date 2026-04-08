import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, resolve as resolvePath } from "node:path";
import type { ParsedCliOptions } from "../types/command.types";
import type { ExchangeId, IntegrationMode, MarketCategory } from "../types/domain.types";
import { ENV_VARS } from "../configEnv";
import { asNonEmptyString, parseIdList } from "./shared";

export interface ProfileConfig {
  apiKeyEnv?: string;
  apiSecretEnv?: string;
  exchangeProvider?: ExchangeId;
  category?: MarketCategory;
  sourceMode?: IntegrationMode;
  futuresGridBotIds?: string[];
  spotGridBotIds?: string[];
}

const DEFAULT_PROFILES_FILE = ".bybit-profiles.json";

const FORBIDDEN_PROFILE_SECRET_FIELDS = [
  "apiKey",
  "apiSecret",
  "secret",
  "BYBIT_API_KEY",
  "BYBIT_SECRET",
  "BYBIT_API_SECRET"
] as const;

function failIfProfileContainsPlaintextSecrets(profileName: string, raw: Record<string, unknown>): void {
  const forbiddenFields = FORBIDDEN_PROFILE_SECRET_FIELDS.filter((field) => asNonEmptyString(raw[field]) !== undefined);
  if (forbiddenFields.length === 0) {
    return;
  }

  throw new Error(
    `Invalid profile "${profileName}": plaintext secret fields are not allowed (${forbiddenFields.join(", ")}). Use apiKeyEnv/apiSecretEnv to reference environment variable names.`
  );
}

function parseProfileEntry(profileName: string, value: unknown): ProfileConfig {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Invalid profile "${profileName}": expected an object`);
  }

  const raw = value as Record<string, unknown>;
  failIfProfileContainsPlaintextSecrets(profileName, raw);

  return {
    apiKeyEnv: asNonEmptyString(raw.apiKeyEnv),
    apiSecretEnv: asNonEmptyString(raw.apiSecretEnv ?? raw.secretEnv),
    exchangeProvider: asNonEmptyString(raw.exchangeProvider ?? raw.BYBIT_EXCHANGE_PROVIDER) as ExchangeId | undefined,
    category: asNonEmptyString(raw.category) as MarketCategory | undefined,
    sourceMode: asNonEmptyString(raw.sourceMode ?? raw.BYBIT_SOURCE_MODE) as IntegrationMode | undefined,
    futuresGridBotIds: parseIdList(raw.futuresGridBotIds ?? raw.BYBIT_FGRID_BOT_IDS),
    spotGridBotIds: parseIdList(raw.spotGridBotIds ?? raw.BYBIT_SPOT_GRID_IDS)
  };
}

export function resolveProfilesPath(options: ParsedCliOptions, env: Record<string, string | undefined>): string {
  const baseDir = options.projectRoot ?? process.cwd();
  const configuredPath = options.profilesFile ?? env[ENV_VARS.profilesFile] ?? DEFAULT_PROFILES_FILE;
  return isAbsolute(configuredPath) ? configuredPath : resolvePath(baseDir, configuredPath);
}

export function resolveProfile(
  options: ParsedCliOptions,
  env: Record<string, string | undefined>
): { name: string; value: ProfileConfig } | null {
  const profileName = options.profile ?? env[ENV_VARS.profile];
  if (!profileName) {
    return null;
  }

  const profilesFilePath = resolveProfilesPath(options, env);
  if (!existsSync(profilesFilePath)) {
    throw new Error(`Profile "${profileName}" requested but profile file does not exist: ${profilesFilePath}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(profilesFilePath, "utf8"));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to parse profile file ${profilesFilePath}: ${message}`);
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`Invalid profile file ${profilesFilePath}: expected a JSON object`);
  }

  const root = parsed as Record<string, unknown>;
  const profilesRoot =
    root.profiles && typeof root.profiles === "object" && !Array.isArray(root.profiles)
      ? (root.profiles as Record<string, unknown>)
      : root;

  if (!(profileName in profilesRoot)) {
    const availableProfiles = Object.keys(profilesRoot)
      .filter((key) => key !== "profiles")
      .sort();

    throw new Error(
      `Profile "${profileName}" not found in ${profilesFilePath}${availableProfiles.length > 0 ? `. Available profiles: ${availableProfiles.join(", ")}` : ""}`
    );
  }

  return {
    name: profileName,
    value: parseProfileEntry(profileName, profilesRoot[profileName])
  };
}
