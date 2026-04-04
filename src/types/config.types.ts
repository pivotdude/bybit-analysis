import type { IntegrationMode, MarketCategory } from "./domain.types";
import type { OutputFormat, TimeRange } from "./command.types";

export type ConfigSource = "cli" | "profile" | "env" | "default";
export type PaginationLimitMode = "error" | "partial";
export type ConfigReportMode = "safe" | "diagnostic";

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
  category: ConfigSource;
  sourceMode: ConfigSource;
  futuresGridBotIds: ConfigSource;
  spotGridBotIds: ConfigSource;
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
  category: MarketCategory;
  sourceMode: IntegrationMode;
  futuresGridBotIds: string[];
  spotGridBotIds: string[];
  format: OutputFormat;
  timeoutMs: number;
  timeRange: TimeRange;
  pagination: PaginationSafetyConfig;
  sources: ResolvedConfigSources;
  configReportMode?: ConfigReportMode;
}

export interface RedactedConfigView {
  profile?: string;
  profilesFile?: string;
  category: MarketCategory;
  sourceMode: IntegrationMode;
  futuresGridBotIds: string;
  spotGridBotIds: string;
  format: OutputFormat;
  timeoutMs: number;
  timeRange: TimeRange;
  pagination: PaginationSafetyConfig;
  apiKey: string;
  apiSecret: string;
  configReportMode: ConfigReportMode;
  sources: ResolvedConfigSources;
}
