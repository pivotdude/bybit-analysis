import type { ExchangeId, IntegrationMode, MarketCategory } from "./domain.types";
import type { OutputFormat, TimeRange } from "./command.types";

export type ConfigSource = "cli" | "profile" | "env" | "default";
export type PaginationLimitMode = "error" | "partial";
export type ConfigReportMode = "safe" | "diagnostic";
export type AmbientEnvSource = "default" | "cli" | "env";

export interface AmbientEnvResolution {
  enabled: boolean;
  source: AmbientEnvSource;
  usedVars: string[];
}

export interface PaginationSafetyConfig {
  positionsMaxPages?: number;
  executionsMaxPagesPerChunk?: number;
  limitMode: PaginationLimitMode;
}

export interface ResolvedConfigSources {
  profile: "cli" | "env" | "default";
  profilesFile: "cli" | "env" | "default";
  apiKey: ConfigSource;
  apiSecret: ConfigSource;
  exchangeProvider: ConfigSource;
  category: ConfigSource;
  sourceMode: ConfigSource;
  providerContext: ConfigSource;
  format: ConfigSource;
  timeoutMs: ConfigSource;
  timeRange: ConfigSource;
  positionsMaxPages: ConfigSource;
  executionsMaxPagesPerChunk: ConfigSource;
  paginationLimitMode: ConfigSource;
}

export interface RuntimeConfig {
  profile?: string;
  profilesFile?: string;
  apiKey: string;
  apiSecret: string;
  exchangeProvider: ExchangeId;
  category: MarketCategory;
  sourceMode: IntegrationMode;
  providerContext: Record<string, unknown>;
  format: OutputFormat;
  timeoutMs: number;
  timeRange: TimeRange;
  pagination: PaginationSafetyConfig;
  sources: ResolvedConfigSources;
  ambientEnv: AmbientEnvResolution;
  configReportMode?: ConfigReportMode;
}

export interface RedactedConfigView {
  profile?: string;
  profilesFile?: string;
  exchangeProvider: ExchangeId;
  category: MarketCategory;
  sourceMode: IntegrationMode;
  providerContext: string;
  format: OutputFormat;
  timeoutMs: number;
  timeRange: TimeRange;
  pagination: PaginationSafetyConfig;
  apiKey: string;
  apiSecret: string;
  configReportMode: ConfigReportMode;
  sources: ResolvedConfigSources;
  ambientEnv: AmbientEnvResolution;
}
