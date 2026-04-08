import { redactSecretValue } from "../security/redaction";
import { describeBybitProviderContext } from "../services/bybit/bybitProviderContext";
import type { ConfigReportMode, RedactedConfigView, RuntimeConfig } from "../types/config.types";

const DEFAULT_CONFIG_REPORT_MODE: ConfigReportMode = "safe";

export function validateCredentials(config: RuntimeConfig): void {
  if (!config.apiKey || !config.apiSecret) {
    throw new Error(
      "Missing credentials: set BYBIT_API_KEY and BYBIT_SECRET (or BYBIT_API_SECRET), or use apiKeyEnv/apiSecretEnv in the selected profile"
    );
  }
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
    exchangeProvider: config.exchangeProvider,
    category: config.category,
    sourceMode: config.sourceMode,
    providerContext: describeBybitProviderContext(config.providerContext, diagnostic),
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
