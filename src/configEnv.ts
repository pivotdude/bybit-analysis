export const ENV_VARS = {
  disableEnv: "BYBIT_DISABLE_ENV",
  allowInsecureCliSecrets: "BYBIT_ALLOW_INSECURE_CLI_SECRETS",
  configDiagnostics: "BYBIT_CONFIG_DIAGNOSTICS",
  profile: "BYBIT_PROFILE",
  profilesFile: "BYBIT_PROFILES_FILE",
  apiKey: "BYBIT_API_KEY",
  secret: "BYBIT_SECRET",
  apiSecret: "BYBIT_API_SECRET",
  category: "BYBIT_CATEGORY",
  sourceMode: "BYBIT_SOURCE_MODE",
  futuresGridBotIds: "BYBIT_FGRID_BOT_IDS",
  spotGridBotIds: "BYBIT_SPOT_GRID_IDS",
  format: "BYBIT_FORMAT",
  timeoutMs: "BYBIT_TIMEOUT_MS",
  window: "BYBIT_WINDOW",
  positionsMaxPages: "BYBIT_POSITIONS_MAX_PAGES",
  executionsMaxPagesPerChunk: "BYBIT_EXECUTIONS_MAX_PAGES_PER_CHUNK",
  paginationLimitMode: "BYBIT_PAGINATION_LIMIT_MODE"
} as const;

export const SUPPORTED_ENV_VARS = [
  ENV_VARS.disableEnv,
  ENV_VARS.apiKey,
  ENV_VARS.secret,
  ENV_VARS.apiSecret,
  ENV_VARS.allowInsecureCliSecrets,
  ENV_VARS.profile,
  ENV_VARS.profilesFile,
  ENV_VARS.category,
  ENV_VARS.sourceMode,
  ENV_VARS.futuresGridBotIds,
  ENV_VARS.spotGridBotIds,
  ENV_VARS.format,
  ENV_VARS.timeoutMs,
  ENV_VARS.window,
  ENV_VARS.positionsMaxPages,
  ENV_VARS.executionsMaxPagesPerChunk,
  ENV_VARS.paginationLimitMode,
  ENV_VARS.configDiagnostics
] as const;

export const LEGACY_UNSUPPORTED_ENV_VARS = [
  "WINDOW",
  "DEFAULT_CATEGORY",
  "DEFAULT_FORMAT",
  "DEFAULT_TIMEOUT_MS"
] as const;
