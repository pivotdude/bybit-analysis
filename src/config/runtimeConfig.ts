import type { ParsedCliOptions, TimeRange } from "../types/command.types";
import type { ExchangeId, IntegrationMode, MarketCategory } from "../types/domain.types";
import type {
  AmbientEnvResolution,
  ConfigReportMode,
  PaginationLimitMode,
  ResolvedConfigSources,
  RuntimeConfig
} from "../types/config.types";
import { ENV_VARS } from "../configEnv";
import { buildBybitProviderContext } from "../services/bybit/bybitProviderContext";
import { resolveProfile, resolveProfilesPath, type ProfileConfig } from "./profile";
import {
  asNonEmptyString,
  buildDefaultTimeRange,
  hasListConfigValue,
  isTruthyEnvValue,
  parseCsvIds,
  parseOptionalPositiveInt,
  parseWindow,
  toIso
} from "./shared";

const DEFAULT_EXCHANGE_PROVIDER: ExchangeId = "bybit";
const DEFAULT_CATEGORY: MarketCategory = "linear";
const DEFAULT_SOURCE_MODE: IntegrationMode = "market";
const DEFAULT_FORMAT = "md" as const;
const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_WINDOW_DAYS = 30;
const DEFAULT_PAGINATION_LIMIT_MODE: PaginationLimitMode = "error";
const DEFAULT_CONFIG_REPORT_MODE: ConfigReportMode = "safe";

const DIRECT_ENV_SOURCE_MAPPINGS = [
  ["profile", ENV_VARS.profile],
  ["profilesFile", ENV_VARS.profilesFile],
  ["exchangeProvider", ENV_VARS.exchangeProvider],
  ["category", ENV_VARS.category],
  ["sourceMode", ENV_VARS.sourceMode],
  ["format", ENV_VARS.format],
  ["timeoutMs", ENV_VARS.timeoutMs],
  ["timeRange", ENV_VARS.window],
  ["positionsMaxPages", ENV_VARS.positionsMaxPages],
  ["executionsMaxPagesPerChunk", ENV_VARS.executionsMaxPagesPerChunk],
  ["paginationLimitMode", ENV_VARS.paginationLimitMode]
] as const satisfies ReadonlyArray<readonly [keyof ResolvedConfigSources, string]>;

interface ResolvedCredentials {
  profileApiKey?: string;
  profileApiSecret?: string;
  envApiKey?: string;
  envApiSecret?: string;
  legacyCliApiKey?: string;
  legacyCliApiSecret?: string;
  apiKey: string;
  apiSecret: string;
}

function resolvePaginationLimitMode(raw: string | undefined, fieldName: string): PaginationLimitMode {
  if (!raw || raw.trim().length === 0) {
    return DEFAULT_PAGINATION_LIMIT_MODE;
  }

  if (raw === "error" || raw === "partial") {
    return raw;
  }

  throw new Error(`Invalid ${fieldName}: ${raw}. Expected error|partial`);
}

function resolveConfigReportMode(
  options: ParsedCliOptions,
  env: Record<string, string | undefined>
): ConfigReportMode {
  return options.configDiagnostics || isTruthyEnvValue(env[ENV_VARS.configDiagnostics])
    ? "diagnostic"
    : DEFAULT_CONFIG_REPORT_MODE;
}

function resolveTimeRange(
  options: ParsedCliOptions,
  env: Record<string, string | undefined>,
  now: Date
): { value: TimeRange; source: ResolvedConfigSources["timeRange"] } {
  if (options.from || options.to) {
    if (!options.from || !options.to) {
      throw new Error("Both --from and --to are required together");
    }

    return {
      value: { from: toIso(options.from, "--from"), to: toIso(options.to, "--to") },
      source: "cli"
    };
  }

  if (options.window) {
    const days = parseWindow(options.window);
    if (days === null) {
      throw new Error(`Invalid --window value: ${options.window}. Expected format like 7d, 30d, 90d`);
    }

    return {
      value: buildDefaultTimeRange(now, days),
      source: "cli"
    };
  }

  const envWindow = env[ENV_VARS.window];
  if (envWindow) {
    const days = parseWindow(envWindow);
    if (days === null) {
      throw new Error(`Invalid ${ENV_VARS.window} value: ${envWindow}`);
    }

    return {
      value: buildDefaultTimeRange(now, days),
      source: "env"
    };
  }

  return {
    value: buildDefaultTimeRange(now, DEFAULT_WINDOW_DAYS),
    source: "default"
  };
}

function resolveProfileCredentialValue(
  env: Record<string, string | undefined>,
  envVarName: string | undefined
): string | undefined {
  return asNonEmptyString(envVarName ? env[envVarName] : undefined);
}

function resolveEnvApiSecret(env: Record<string, string | undefined>): string | undefined {
  return asNonEmptyString(env[ENV_VARS.secret] ?? env[ENV_VARS.apiSecret]);
}

function resolveCredentialPriority(
  profileCredentialValue: string | undefined,
  envCredentialValue: string | undefined,
  legacyCliCredentialValue: string | undefined
): string {
  return profileCredentialValue ?? envCredentialValue ?? legacyCliCredentialValue ?? "";
}

function resolveCredentialSource(
  profileCredentialValue: string | undefined,
  envCredentialValue: string | undefined,
  legacyCliCredentialValue: string | undefined
): "profile" | "env" | "cli" | "default" {
  if (profileCredentialValue !== undefined) {
    return "profile";
  }
  if (envCredentialValue !== undefined) {
    return "env";
  }
  if (legacyCliCredentialValue !== undefined) {
    return "cli";
  }
  return "default";
}

function resolveNamedConfigSource(
  cliValue: unknown,
  profileValue: unknown,
  envValue: unknown
): "cli" | "profile" | "env" | "default" {
  if (cliValue) {
    return "cli";
  }
  if (profileValue) {
    return "profile";
  }
  if (envValue) {
    return "env";
  }
  return "default";
}

function resolveValue<T>(
  cliValue: T | undefined,
  profileValue: T | undefined,
  envValue: T | undefined,
  fallback: T
): T {
  return (cliValue ?? profileValue ?? envValue ?? fallback) as T;
}

function resolveConfiguredIds(
  cliValue: string[] | undefined,
  profileValue: string[] | undefined,
  envValue: string | undefined
): string[] {
  return cliValue ?? profileValue ?? parseCsvIds(envValue);
}

function resolveEnvPositiveInt(
  env: Record<string, string | undefined>,
  envVarName: string
): number | undefined {
  return parseOptionalPositiveInt(env[envVarName], envVarName);
}

function resolveCredentials(
  options: ParsedCliOptions,
  env: Record<string, string | undefined>,
  profile?: ProfileConfig
): ResolvedCredentials {
  const allowInsecureSecretFlags = isTruthyEnvValue(env[ENV_VARS.allowInsecureCliSecrets]);
  const legacyCliApiKey = asNonEmptyString(allowInsecureSecretFlags ? options.apiKey : undefined);
  const legacyCliApiSecret = asNonEmptyString(allowInsecureSecretFlags ? options.apiSecret : undefined);
  const profileApiKey = resolveProfileCredentialValue(env, profile?.apiKeyEnv);
  const profileApiSecret = resolveProfileCredentialValue(env, profile?.apiSecretEnv);
  const envApiKey = asNonEmptyString(env[ENV_VARS.apiKey]);
  const envApiSecret = resolveEnvApiSecret(env);

  return {
    profileApiKey,
    profileApiSecret,
    envApiKey,
    envApiSecret,
    legacyCliApiKey,
    legacyCliApiSecret,
    apiKey: resolveCredentialPriority(profileApiKey, envApiKey, legacyCliApiKey),
    apiSecret: resolveCredentialPriority(profileApiSecret, envApiSecret, legacyCliApiSecret)
  };
}

function resolveSources(
  options: ParsedCliOptions,
  env: Record<string, string | undefined>,
  profile: ProfileConfig | undefined,
  credentials: ResolvedCredentials,
  timeRange: { source: ResolvedConfigSources["timeRange"] }
): ResolvedConfigSources {
  return {
    profile: options.profile ? "cli" : env[ENV_VARS.profile] ? "env" : "default",
    profilesFile: options.profilesFile ? "cli" : env[ENV_VARS.profilesFile] ? "env" : "default",
    apiKey: resolveCredentialSource(
      credentials.profileApiKey,
      credentials.envApiKey,
      credentials.legacyCliApiKey
    ),
    apiSecret: resolveCredentialSource(
      credentials.profileApiSecret,
      credentials.envApiSecret,
      credentials.legacyCliApiSecret
    ),
    exchangeProvider: resolveNamedConfigSource(options.exchangeProvider, profile?.exchangeProvider, env[ENV_VARS.exchangeProvider]),
    category: resolveNamedConfigSource(options.category, profile?.category, env[ENV_VARS.category]),
    sourceMode: resolveNamedConfigSource(options.sourceMode, profile?.sourceMode, env[ENV_VARS.sourceMode]),
    providerContext: resolveNamedConfigSource(
      hasListConfigValue(options.futuresGridBotIds) || hasListConfigValue(options.spotGridBotIds),
      hasListConfigValue(profile?.futuresGridBotIds) || hasListConfigValue(profile?.spotGridBotIds),
      env[ENV_VARS.futuresGridBotIds] || env[ENV_VARS.spotGridBotIds]
    ),
    format: options.format ? "cli" : env[ENV_VARS.format] ? "env" : "default",
    timeoutMs: options.timeoutMs ? "cli" : env[ENV_VARS.timeoutMs] ? "env" : "default",
    timeRange: timeRange.source,
    positionsMaxPages: options.positionsMaxPages ? "cli" : env[ENV_VARS.positionsMaxPages] ? "env" : "default",
    executionsMaxPagesPerChunk: options.executionsMaxPagesPerChunk
      ? "cli"
      : env[ENV_VARS.executionsMaxPagesPerChunk]
        ? "env"
        : "default",
    paginationLimitMode: options.paginationLimitMode
      ? "cli"
      : env[ENV_VARS.paginationLimitMode]
        ? "env"
        : "default"
  };
}

function resolveUsedEnvVars(
  options: ParsedCliOptions,
  env: Record<string, string | undefined>,
  sources: ResolvedConfigSources,
  profile?: ProfileConfig
): string[] {
  const usedVars = new Set<string>();

  for (const [sourceKey, envVar] of DIRECT_ENV_SOURCE_MAPPINGS) {
    if (sources[sourceKey] === "env") {
      usedVars.add(envVar);
    }
  }

  if (sources.apiKey === "profile" && profile?.apiKeyEnv && resolveProfileCredentialValue(env, profile.apiKeyEnv)) {
    usedVars.add(profile.apiKeyEnv);
  } else if (sources.apiKey === "env") {
    usedVars.add(ENV_VARS.apiKey);
  }

  if (sources.apiSecret === "profile" && profile?.apiSecretEnv && resolveProfileCredentialValue(env, profile.apiSecretEnv)) {
    usedVars.add(profile.apiSecretEnv);
  } else if (sources.apiSecret === "env") {
    usedVars.add(env[ENV_VARS.secret] ? ENV_VARS.secret : ENV_VARS.apiSecret);
  }

  if (sources.providerContext === "env") {
    if (env[ENV_VARS.futuresGridBotIds]) {
      usedVars.add(ENV_VARS.futuresGridBotIds);
    }
    if (env[ENV_VARS.spotGridBotIds]) {
      usedVars.add(ENV_VARS.spotGridBotIds);
    }
  }

  if (!options.configDiagnostics && env[ENV_VARS.configDiagnostics] && isTruthyEnvValue(env[ENV_VARS.configDiagnostics])) {
    usedVars.add(ENV_VARS.configDiagnostics);
  }
  if (isTruthyEnvValue(env[ENV_VARS.allowInsecureCliSecrets])) {
    usedVars.add(ENV_VARS.allowInsecureCliSecrets);
  }

  return [...usedVars].sort();
}

function validateResolvedConfig(config: RuntimeConfig): void {
  if (config.exchangeProvider !== "bybit") {
    throw new Error(`Invalid exchange provider: ${config.exchangeProvider}. Expected bybit`);
  }
  if (config.category !== "linear" && config.category !== "spot") {
    throw new Error(`Invalid category: ${config.category}. Expected linear|spot`);
  }
  if (config.sourceMode !== "market" && config.sourceMode !== "bot") {
    throw new Error(`Invalid source mode: ${config.sourceMode}. Expected market|bot`);
  }
  if (config.format !== "md" && config.format !== "compact" && config.format !== "json") {
    throw new Error(`Invalid format: ${config.format}. Expected md|compact|json`);
  }
  if (!Number.isFinite(config.timeoutMs) || config.timeoutMs <= 0) {
    throw new Error(`Invalid timeout: ${config.timeoutMs}`);
  }
  if (config.timeRange.from >= config.timeRange.to) {
    throw new Error("Invalid time range: --from must be earlier than --to");
  }
}

export function resolveRuntimeConfig(
  options: ParsedCliOptions,
  env: Record<string, string | undefined> = {},
  ambientEnv: AmbientEnvResolution = {
    enabled: true,
    source: "default",
    usedVars: []
  }
): RuntimeConfig {
  const now = new Date();
  const resolvedProfile = resolveProfile(options, env);
  const profile = resolvedProfile?.value;
  const credentials = resolveCredentials(options, env, profile);
  const timeRange = resolveTimeRange(options, env, now);

  const exchangeProvider = resolveValue(
    options.exchangeProvider,
    profile?.exchangeProvider,
    env[ENV_VARS.exchangeProvider] as ExchangeId | undefined,
    DEFAULT_EXCHANGE_PROVIDER
  );
  const category = resolveValue(options.category, profile?.category, env[ENV_VARS.category] as MarketCategory | undefined, DEFAULT_CATEGORY);
  const sourceMode = resolveValue(
    options.sourceMode,
    profile?.sourceMode,
    env[ENV_VARS.sourceMode] as IntegrationMode | undefined,
    DEFAULT_SOURCE_MODE
  );
  const futuresGridBotIds = resolveConfiguredIds(options.futuresGridBotIds, profile?.futuresGridBotIds, env[ENV_VARS.futuresGridBotIds]);
  const spotGridBotIds = resolveConfiguredIds(options.spotGridBotIds, profile?.spotGridBotIds, env[ENV_VARS.spotGridBotIds]);
  const format = resolveValue(
    options.format,
    undefined,
    env[ENV_VARS.format] as "md" | "compact" | "json" | undefined,
    DEFAULT_FORMAT
  );
  const timeoutMs = options.timeoutMs ?? resolveEnvPositiveInt(env, ENV_VARS.timeoutMs) ?? DEFAULT_TIMEOUT_MS;
  const positionsMaxPages = options.positionsMaxPages ?? resolveEnvPositiveInt(env, ENV_VARS.positionsMaxPages);
  const executionsMaxPagesPerChunk =
    options.executionsMaxPagesPerChunk ?? resolveEnvPositiveInt(env, ENV_VARS.executionsMaxPagesPerChunk);
  const paginationLimitMode = resolvePaginationLimitMode(
    options.paginationLimitMode ?? env[ENV_VARS.paginationLimitMode],
    options.paginationLimitMode ? "--pagination-limit-mode" : ENV_VARS.paginationLimitMode
  );
  const sources = resolveSources(options, env, profile, credentials, timeRange);

  const config: RuntimeConfig = {
    profile: resolvedProfile?.name,
    profilesFile: resolvedProfile ? resolveProfilesPath(options, env) : undefined,
    apiKey: credentials.apiKey,
    apiSecret: credentials.apiSecret,
    exchangeProvider,
    category,
    sourceMode,
    providerContext: buildBybitProviderContext({ futuresGridBotIds, spotGridBotIds }),
    format,
    timeoutMs,
    timeRange: timeRange.value,
    pagination: {
      positionsMaxPages,
      executionsMaxPagesPerChunk,
      limitMode: paginationLimitMode
    },
    configReportMode: resolveConfigReportMode(options, env),
    sources,
    ambientEnv: {
      ...ambientEnv,
      usedVars: resolveUsedEnvVars(options, env, sources, profile)
    }
  };

  validateResolvedConfig(config);
  return config;
}
