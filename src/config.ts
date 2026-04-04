import { existsSync, readFileSync } from "node:fs";
import { resolve as resolvePath } from "node:path";
import type { ParsedCliOptions, TimeRange } from "./types/command.types";
import type { IntegrationMode, MarketCategory } from "./types/domain.types";
import type {
  AmbientEnvResolution,
  ConfigReportMode,
  PaginationLimitMode,
  RedactedConfigView,
  ResolvedConfigSources,
  RuntimeConfig
} from "./types/config.types";
import { redactSecretValue } from "./security/redaction";
import { ENV_VARS } from "./configEnv";

const DEFAULT_CATEGORY: MarketCategory = "linear";
const DEFAULT_SOURCE_MODE: IntegrationMode = "market";
const DEFAULT_FORMAT = "md" as const;
const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_WINDOW_DAYS = 30;
const DEFAULT_PROFILES_FILE = ".bybit-profiles.json";
const DEFAULT_PAGINATION_LIMIT_MODE: PaginationLimitMode = "error";
const DEFAULT_CONFIG_REPORT_MODE: ConfigReportMode = "safe";

function parseWindow(windowValue: string): number | null {
  const match = /^(\d+)(d)$/i.exec(windowValue.trim());
  if (!match) {
    return null;
  }
  const amount = Number(match[1]);
  if (!Number.isFinite(amount) || amount <= 0) {
    return null;
  }
  return amount;
}

function parseCsvIds(input: string | undefined): string[] {
  if (!input) {
    return [];
  }
  return input
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function isTruthyEnvValue(value: string | undefined): boolean {
  if (!value) {
    return false;
  }

  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

function parseIdList(input: unknown): string[] | undefined {
  if (Array.isArray(input)) {
    const values = input
      .map((item) => (typeof item === "string" ? item.trim() : ""))
      .filter((item) => item.length > 0);
    return values.length > 0 ? values : undefined;
  }
  if (typeof input === "string") {
    const values = parseCsvIds(input);
    return values.length > 0 ? values : undefined;
  }
  return undefined;
}

function asNonEmptyString(input: unknown): string | undefined {
  if (typeof input !== "string") {
    return undefined;
  }
  const trimmed = input.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

interface ProfileConfig {
  apiKey?: string;
  apiSecret?: string;
  category?: MarketCategory;
  sourceMode?: IntegrationMode;
  futuresGridBotIds?: string[];
  spotGridBotIds?: string[];
}

function parseProfileEntry(profileName: string, value: unknown): ProfileConfig {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Invalid profile "${profileName}": expected an object`);
  }

  const raw = value as Record<string, unknown>;
  const categoryValue = asNonEmptyString(raw.category);
  const category = categoryValue as MarketCategory | undefined;
  const sourceModeValue = asNonEmptyString(raw.sourceMode ?? raw.BYBIT_SOURCE_MODE);
  const sourceMode = sourceModeValue as IntegrationMode | undefined;

  return {
    apiKey: asNonEmptyString(raw.apiKey ?? raw.BYBIT_API_KEY),
    apiSecret: asNonEmptyString(raw.apiSecret ?? raw.secret ?? raw.BYBIT_SECRET ?? raw.BYBIT_API_SECRET),
    category,
    sourceMode,
    futuresGridBotIds: parseIdList(raw.futuresGridBotIds ?? raw.BYBIT_FGRID_BOT_IDS),
    spotGridBotIds: parseIdList(raw.spotGridBotIds ?? raw.BYBIT_SPOT_GRID_IDS)
  };
}

function resolveProfilesPath(options: ParsedCliOptions, env: Record<string, string | undefined>): string {
  const fromOptions = options.profilesFile;
  const fromEnv = env[ENV_VARS.profilesFile];
  const path = fromOptions ?? fromEnv ?? DEFAULT_PROFILES_FILE;
  return resolvePath(path);
}

function resolveProfile(
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
  const rawProfile = profilesRoot[profileName];

  return {
    name: profileName,
    value: parseProfileEntry(profileName, rawProfile)
  };
}

function toIso(input: string, field: string): string {
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid ${field}: ${input}`);
  }
  return date.toISOString();
}

function defaultTimeRange(now: Date): TimeRange {
  const to = now.toISOString();
  const fromDate = new Date(now);
  fromDate.setUTCDate(fromDate.getUTCDate() - DEFAULT_WINDOW_DAYS);
  return { from: fromDate.toISOString(), to };
}

function parseOptionalPositiveInt(raw: string | undefined, fieldName: string): number | undefined {
  if (raw === undefined || raw.trim().length === 0) {
    return undefined;
  }

  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Invalid ${fieldName}: ${raw}. Expected a positive integer`);
  }

  return parsed;
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
  if (options.configDiagnostics || isTruthyEnvValue(env[ENV_VARS.configDiagnostics])) {
    return "diagnostic";
  }
  return DEFAULT_CONFIG_REPORT_MODE;
}

function resolveTimeRange(options: ParsedCliOptions, env: Record<string, string | undefined>, now: Date): { value: TimeRange; source: ResolvedConfigSources["timeRange"] } {
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
    const to = now.toISOString();
    const fromDate = new Date(now);
    fromDate.setUTCDate(fromDate.getUTCDate() - days);
    return { value: { from: fromDate.toISOString(), to }, source: "cli" };
  }

  const envWindow = env[ENV_VARS.window];
  if (envWindow) {
    const days = parseWindow(envWindow);
    if (days === null) {
      throw new Error(`Invalid ${ENV_VARS.window} value: ${envWindow}`);
    }
    const to = now.toISOString();
    const fromDate = new Date(now);
    fromDate.setUTCDate(fromDate.getUTCDate() - days);
    return { value: { from: fromDate.toISOString(), to }, source: "env" };
  }

  return { value: defaultTimeRange(now), source: "default" };
}

function resolveUsedEnvVars(
  options: ParsedCliOptions,
  env: Record<string, string | undefined>,
  sources: ResolvedConfigSources
): string[] {
  const usedVars = new Set<string>();

  if (sources.profile === "env") {
    usedVars.add(ENV_VARS.profile);
  }
  if (sources.profilesFile === "env") {
    usedVars.add(ENV_VARS.profilesFile);
  }
  if (sources.apiKey === "env") {
    usedVars.add(ENV_VARS.apiKey);
  }
  if (sources.apiSecret === "env") {
    usedVars.add(env[ENV_VARS.secret] ? ENV_VARS.secret : ENV_VARS.apiSecret);
  }
  if (sources.category === "env") {
    usedVars.add(ENV_VARS.category);
  }
  if (sources.sourceMode === "env") {
    usedVars.add(ENV_VARS.sourceMode);
  }
  if (sources.futuresGridBotIds === "env") {
    usedVars.add(ENV_VARS.futuresGridBotIds);
  }
  if (sources.spotGridBotIds === "env") {
    usedVars.add(ENV_VARS.spotGridBotIds);
  }
  if (sources.format === "env") {
    usedVars.add(ENV_VARS.format);
  }
  if (sources.timeoutMs === "env") {
    usedVars.add(ENV_VARS.timeoutMs);
  }
  if (sources.timeRange === "env") {
    usedVars.add(ENV_VARS.window);
  }
  if (sources.positionsMaxPages === "env") {
    usedVars.add(ENV_VARS.positionsMaxPages);
  }
  if (sources.executionsMaxPagesPerChunk === "env") {
    usedVars.add(ENV_VARS.executionsMaxPagesPerChunk);
  }
  if (sources.paginationLimitMode === "env") {
    usedVars.add(ENV_VARS.paginationLimitMode);
  }
  if (options.configDiagnostics || isTruthyEnvValue(env[ENV_VARS.configDiagnostics])) {
    if (!options.configDiagnostics && env[ENV_VARS.configDiagnostics]) {
      usedVars.add(ENV_VARS.configDiagnostics);
    }
  }
  if (isTruthyEnvValue(env[ENV_VARS.allowInsecureCliSecrets])) {
    usedVars.add(ENV_VARS.allowInsecureCliSecrets);
  }

  return [...usedVars].sort();
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
  const profilesFile = resolveProfilesPath(options, env);
  const allowInsecureSecretFlags = isTruthyEnvValue(env[ENV_VARS.allowInsecureCliSecrets]);
  const legacyCliApiKey = allowInsecureSecretFlags ? options.apiKey : undefined;
  const legacyCliApiSecret = allowInsecureSecretFlags ? options.apiSecret : undefined;

  const apiKey = profile?.apiKey ?? env[ENV_VARS.apiKey] ?? legacyCliApiKey ?? "";
  const apiSecret = profile?.apiSecret ?? env[ENV_VARS.secret] ?? env[ENV_VARS.apiSecret] ?? legacyCliApiSecret ?? "";
  const category = (options.category ?? profile?.category ?? env[ENV_VARS.category] ?? DEFAULT_CATEGORY) as MarketCategory;
  const sourceMode = (options.sourceMode ??
    profile?.sourceMode ??
    env[ENV_VARS.sourceMode] ??
    DEFAULT_SOURCE_MODE) as IntegrationMode;
  const futuresGridBotIds =
    options.futuresGridBotIds ??
    profile?.futuresGridBotIds ??
    parseCsvIds(env[ENV_VARS.futuresGridBotIds]);
  const spotGridBotIds =
    options.spotGridBotIds ??
    profile?.spotGridBotIds ??
    parseCsvIds(env[ENV_VARS.spotGridBotIds]);
  const format = (options.format ?? (env[ENV_VARS.format] as "md" | "compact") ?? DEFAULT_FORMAT);
  const timeoutMs =
    options.timeoutMs ??
    parseOptionalPositiveInt(env[ENV_VARS.timeoutMs], ENV_VARS.timeoutMs) ??
    DEFAULT_TIMEOUT_MS;
  const timeRange = resolveTimeRange(options, env, now);
  const positionsMaxPages =
    options.positionsMaxPages ??
    parseOptionalPositiveInt(env[ENV_VARS.positionsMaxPages], ENV_VARS.positionsMaxPages);
  const executionsMaxPagesPerChunk =
    options.executionsMaxPagesPerChunk ??
    parseOptionalPositiveInt(
      env[ENV_VARS.executionsMaxPagesPerChunk],
      ENV_VARS.executionsMaxPagesPerChunk
    );
  const paginationLimitMode = resolvePaginationLimitMode(
    options.paginationLimitMode ?? env[ENV_VARS.paginationLimitMode],
    options.paginationLimitMode ? "--pagination-limit-mode" : ENV_VARS.paginationLimitMode
  );
  const configReportMode = resolveConfigReportMode(options, env);

  if (category !== "linear" && category !== "spot") {
    throw new Error(`Invalid category: ${category}. Expected linear|spot`);
  }
  if (sourceMode !== "market" && sourceMode !== "bot") {
    throw new Error(`Invalid source mode: ${sourceMode}. Expected market|bot`);
  }
  if (format !== "md" && format !== "compact") {
    throw new Error(`Invalid format: ${format}. Expected md|compact`);
  }
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new Error(`Invalid timeout: ${timeoutMs}`);
  }
  if (timeRange.value.from >= timeRange.value.to) {
    throw new Error(`Invalid time range: --from must be earlier than --to`);
  }

  const sources: ResolvedConfigSources = {
    profile: options.profile ? "cli" : env[ENV_VARS.profile] ? "env" : "default",
    profilesFile: options.profilesFile ? "cli" : env[ENV_VARS.profilesFile] ? "env" : "default",
    apiKey: profile?.apiKey ? "profile" : env[ENV_VARS.apiKey] ? "env" : legacyCliApiKey ? "cli" : "default",
    apiSecret: profile?.apiSecret
      ? "profile"
      : env[ENV_VARS.secret] || env[ENV_VARS.apiSecret]
        ? "env"
        : legacyCliApiSecret
          ? "cli"
          : "default",
    category: options.category ? "cli" : profile?.category ? "profile" : env[ENV_VARS.category] ? "env" : "default",
    sourceMode: options.sourceMode
      ? "cli"
      : profile?.sourceMode
        ? "profile"
        : env[ENV_VARS.sourceMode]
          ? "env"
          : "default",
    futuresGridBotIds: options.futuresGridBotIds
      ? "cli"
      : profile?.futuresGridBotIds
        ? "profile"
        : env[ENV_VARS.futuresGridBotIds]
          ? "env"
          : "default",
    spotGridBotIds: options.spotGridBotIds
      ? "cli"
      : profile?.spotGridBotIds
        ? "profile"
        : env[ENV_VARS.spotGridBotIds]
          ? "env"
          : "default",
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
  const resolvedAmbientEnv: AmbientEnvResolution = {
    ...ambientEnv,
    usedVars: resolveUsedEnvVars(options, env, sources)
  };

  return {
    profile: resolvedProfile?.name,
    profilesFile: resolvedProfile ? profilesFile : undefined,
    apiKey,
    apiSecret,
    category,
    sourceMode,
    futuresGridBotIds,
    spotGridBotIds,
    format,
    timeoutMs,
    timeRange: timeRange.value,
    pagination: {
      positionsMaxPages,
      executionsMaxPagesPerChunk,
      limitMode: paginationLimitMode
    },
    configReportMode,
    sources,
    ambientEnv: resolvedAmbientEnv
  };
}

export function validateCredentials(config: RuntimeConfig): void {
  if (!config.apiKey || !config.apiSecret) {
    throw new Error("Missing credentials: BYBIT_API_KEY and BYBIT_SECRET (or BYBIT_API_SECRET) are required for this command");
  }
}

function summarizeConfiguredIds(ids: string[]): string {
  if (ids.length === 0) {
    return "<none>";
  }
  const suffix = ids.length === 1 ? "id" : "ids";
  return `configured (${ids.length} ${suffix})`;
}

function summarizeCredentialPresence(value: string): string {
  return redactSecretValue(value).presence === "present" ? "<configured>" : "<missing>";
}

export function toRedactedConfigView(
  config: RuntimeConfig,
  mode: ConfigReportMode = config.configReportMode ?? DEFAULT_CONFIG_REPORT_MODE
): RedactedConfigView {
  const diagnostic = mode === "diagnostic";
  const apiKeyRedacted = redactSecretValue(config.apiKey).display;
  const apiSecretRedacted = redactSecretValue(config.apiSecret).display;

  return {
    profile: config.profile,
    profilesFile: config.profilesFile,
    category: config.category,
    sourceMode: config.sourceMode,
    futuresGridBotIds: diagnostic
      ? config.futuresGridBotIds.join(",") || "<none>"
      : summarizeConfiguredIds(config.futuresGridBotIds),
    spotGridBotIds: diagnostic
      ? config.spotGridBotIds.join(",") || "<none>"
      : summarizeConfiguredIds(config.spotGridBotIds),
    format: config.format,
    timeoutMs: config.timeoutMs,
    timeRange: config.timeRange,
    pagination: config.pagination,
    apiKey: diagnostic ? apiKeyRedacted : summarizeCredentialPresence(config.apiKey),
    apiSecret: diagnostic ? apiSecretRedacted : summarizeCredentialPresence(config.apiSecret),
    configReportMode: mode,
    sources: config.sources,
    ambientEnv: config.ambientEnv
  };
}
