import type { MarketCategory } from "./domain.types";
import type { OutputFormat, TimeRange } from "./command.types";

export type ConfigSource = "cli" | "profile" | "env" | "default";

export interface ResolvedConfigSources {
  profile: "cli" | "env" | "default";
  profilesFile: "cli" | "env" | "default";
  apiKey: ConfigSource;
  apiSecret: ConfigSource;
  category: ConfigSource;
  futuresGridBotIds: ConfigSource;
  spotGridBotIds: ConfigSource;
  format: ConfigSource;
  lang: ConfigSource;
  timeoutMs: ConfigSource;
  timeRange: ConfigSource;
}

export interface RuntimeConfig {
  profile?: string;
  profilesFile?: string;
  apiKey: string;
  apiSecret: string;
  category: MarketCategory;
  futuresGridBotIds: string[];
  spotGridBotIds: string[];
  format: OutputFormat;
  lang: string;
  timeoutMs: number;
  timeRange: TimeRange;
  sources: ResolvedConfigSources;
}

export interface RedactedConfigView {
  profile?: string;
  profilesFile?: string;
  category: MarketCategory;
  futuresGridBotIds: string[];
  spotGridBotIds: string[];
  format: OutputFormat;
  lang: string;
  timeoutMs: number;
  timeRange: TimeRange;
  apiKey: string;
  apiSecret: string;
  sources: ResolvedConfigSources;
}
