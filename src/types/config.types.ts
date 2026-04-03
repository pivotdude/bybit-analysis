import type { MarketCategory } from "./domain.types";
import type { OutputFormat, TimeRange } from "./command.types";

export interface ResolvedConfigSources {
  apiKey: "cli" | "env" | "default";
  apiSecret: "cli" | "env" | "default";
  category: "cli" | "env" | "default";
  format: "cli" | "env" | "default";
  lang: "cli" | "env" | "default";
  timeoutMs: "cli" | "env" | "default";
  timeRange: "cli" | "env" | "default";
}

export interface RuntimeConfig {
  apiKey: string;
  apiSecret: string;
  category: MarketCategory;
  format: OutputFormat;
  lang: string;
  timeoutMs: number;
  timeRange: TimeRange;
  sources: ResolvedConfigSources;
}

export interface RedactedConfigView {
  category: MarketCategory;
  format: OutputFormat;
  lang: string;
  timeoutMs: number;
  timeRange: TimeRange;
  apiKey: string;
  apiSecret: string;
  sources: ResolvedConfigSources;
}
