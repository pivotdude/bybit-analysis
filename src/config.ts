import { existsSync, readFileSync } from "node:fs";
import { resolve as resolvePath } from "node:path";
import type { ParsedCliOptions, TimeRange } from "./types/command.types";
import type { MarketCategory } from "./types/domain.types";
import type {
  ConfigReportMode,
  PaginationLimitMode,
  RedactedConfigView,
  ResolvedConfigSources,
  RuntimeConfig
} from "./types/config.types";
import { redactSecretValue } from "./security/redaction";

const DEFAULT_CATEGORY: MarketCategory = "linear";
const DEFAULT_FORMAT = "md" as const;
const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_WINDOW_DAYS = 30;
const DEFAULT_PROFILES_FILE = ".bybit-profiles.json";
const DEFAULT_PAGINATION_LIMIT_MODE: PaginationLimitMode = "error";
const ALLOW_INSECURE_SECRET_FLAGS_ENV = "BYBIT_ALLOW_INSECURE_CLI_SECRETS";
const CONFIG_DIAGNOSTICS_ENV = "BYBIT_CONFIG_DIAGNOSTICS";
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

  return {
    apiKey: asNonEmptyString(raw.apiKey ?? raw.BYBIT_API_KEY),
    apiSecret: asNonEmptyString(raw.apiSecret ?? raw.secret ?? raw.BYBIT_SECRET ?? raw.BYBIT_API_SECRET),
    category,
    futuresGridBotIds: parseIdList(raw.futuresGridBotIds ?? raw.BYBIT_FGRID_BOT_IDS),
    spotGridBotIds: parseIdList(raw.spotGridBotIds ?? raw.BYBIT_SPOT_GRID_IDS)
  };
}

function resolveProfilesPath(options: ParsedCliOptions, env: Record<string, string | undefined>): string {
  const fromOptions = options.profilesFile;
  const fromEnv = env.BYBIT_PROFILES_FILE;
  const path = fromOptions ?? fromEnv ?? DEFAULT_PROFILES_FILE;
  return resolvePath(path);
}

function resolveProfile(
  options: ParsedCliOptions,
  env: Record<string, string | undefined>
): { name: string; value: ProfileConfig } | null {
  const profileName = options.profile ?? env.BYBIT_PROFILE;
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
  if (options.configDiagnostics || isTruthyEnvValue(env[CONFIG_DIAGNOSTICS_ENV])) {
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

  if (env.WINDOW) {
    const days = parseWindow(env.WINDOW);
    if (days === null) {
      throw new Error(`Invalid WINDOW value: ${env.WINDOW}`);
    }
    const to = now.toISOString();
    const fromDate = new Date(now);
    fromDate.setUTCDate(fromDate.getUTCDate() - days);
    return { value: { from: fromDate.toISOString(), to }, source: "env" };
  }

  return { value: defaultTimeRange(now), source: "default" };
}

export function resolveRuntimeConfig(options: ParsedCliOptions, env: Record<string, string | undefined> = Bun.env): RuntimeConfig {
  const now = new Date();
  const resolvedProfile = resolveProfile(options, env);
  const profile = resolvedProfile?.value;
  const profilesFile = resolveProfilesPath(options, env);
  const allowInsecureSecretFlags = isTruthyEnvValue(env[ALLOW_INSECURE_SECRET_FLAGS_ENV]);
  const legacyCliApiKey = allowInsecureSecretFlags ? options.apiKey : undefined;
  const legacyCliApiSecret = allowInsecureSecretFlags ? options.apiSecret : undefined;

  const apiKey = profile?.apiKey ?? env.BYBIT_API_KEY ?? legacyCliApiKey ?? "";
  const apiSecret = profile?.apiSecret ?? env.BYBIT_SECRET ?? env.BYBIT_API_SECRET ?? legacyCliApiSecret ?? "";
  const category = (options.category ?? profile?.category ?? env.DEFAULT_CATEGORY ?? DEFAULT_CATEGORY) as MarketCategory;
  const futuresGridBotIds =
    options.futuresGridBotIds ??
    profile?.futuresGridBotIds ??
    parseCsvIds(env.BYBIT_FGRID_BOT_IDS);
  const spotGridBotIds =
    options.spotGridBotIds ??
    profile?.spotGridBotIds ??
    parseCsvIds(env.BYBIT_SPOT_GRID_IDS);
  const format = (options.format ?? (env.DEFAULT_FORMAT as "md" | "compact") ?? DEFAULT_FORMAT);
  const timeoutMs = options.timeoutMs ?? Number(env.DEFAULT_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS);
  const timeRange = resolveTimeRange(options, env, now);
  const positionsMaxPages =
    options.positionsMaxPages ?? parseOptionalPositiveInt(env.BYBIT_POSITIONS_MAX_PAGES, "BYBIT_POSITIONS_MAX_PAGES");
  const executionsMaxPagesPerChunk =
    options.executionsMaxPagesPerChunk ??
    parseOptionalPositiveInt(
      env.BYBIT_EXECUTIONS_MAX_PAGES_PER_CHUNK,
      "BYBIT_EXECUTIONS_MAX_PAGES_PER_CHUNK"
    );
  const paginationLimitMode = resolvePaginationLimitMode(
    options.paginationLimitMode ?? env.BYBIT_PAGINATION_LIMIT_MODE,
    options.paginationLimitMode ? "--pagination-limit-mode" : "BYBIT_PAGINATION_LIMIT_MODE"
  );
  const configReportMode = resolveConfigReportMode(options, env);

  if (category !== "linear" && category !== "spot" && category !== "bot") {
    throw new Error(`Invalid category: ${category}. Expected linear|spot|bot`);
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

  return {
    profile: resolvedProfile?.name,
    profilesFile: resolvedProfile ? profilesFile : undefined,
    apiKey,
    apiSecret,
    category,
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
    sources: {
      profile: options.profile ? "cli" : env.BYBIT_PROFILE ? "env" : "default",
      profilesFile: options.profilesFile ? "cli" : env.BYBIT_PROFILES_FILE ? "env" : "default",
      apiKey: profile?.apiKey ? "profile" : env.BYBIT_API_KEY ? "env" : legacyCliApiKey ? "cli" : "default",
      apiSecret: profile?.apiSecret
        ? "profile"
        : env.BYBIT_SECRET || env.BYBIT_API_SECRET
          ? "env"
          : legacyCliApiSecret
            ? "cli"
            : "default",
      category: options.category ? "cli" : profile?.category ? "profile" : env.DEFAULT_CATEGORY ? "env" : "default",
      futuresGridBotIds: options.futuresGridBotIds
        ? "cli"
        : profile?.futuresGridBotIds
          ? "profile"
          : env.BYBIT_FGRID_BOT_IDS
            ? "env"
            : "default",
      spotGridBotIds: options.spotGridBotIds
        ? "cli"
        : profile?.spotGridBotIds
          ? "profile"
          : env.BYBIT_SPOT_GRID_IDS
            ? "env"
            : "default",
      format: options.format ? "cli" : env.DEFAULT_FORMAT ? "env" : "default",
      timeoutMs: options.timeoutMs ? "cli" : env.DEFAULT_TIMEOUT_MS ? "env" : "default",
      timeRange: timeRange.source,
      positionsMaxPages: options.positionsMaxPages
        ? "cli"
        : env.BYBIT_POSITIONS_MAX_PAGES
          ? "env"
          : "default",
      executionsMaxPagesPerChunk: options.executionsMaxPagesPerChunk
        ? "cli"
        : env.BYBIT_EXECUTIONS_MAX_PAGES_PER_CHUNK
          ? "env"
          : "default",
      paginationLimitMode: options.paginationLimitMode
        ? "cli"
        : env.BYBIT_PAGINATION_LIMIT_MODE
          ? "env"
          : "default"
    }
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
    sources: config.sources
  };
}
