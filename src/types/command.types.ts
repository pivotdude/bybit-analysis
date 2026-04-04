import type { IntegrationMode, MarketCategory } from "./domain.types";

export type CommandName =
  | "summary"
  | "balance"
  | "pnl"
  | "positions"
  | "exposure"
  | "performance"
  | "risk"
  | "bots"
  | "permissions"
  | "config"
  | "health";

export type OutputFormat = "md" | "compact";

export interface TimeRange {
  from: string;
  to: string;
}

export interface ParsedCliOptions {
  noEnv?: boolean;
  apiKey?: string;
  apiSecret?: string;
  profile?: string;
  profilesFile?: string;
  category?: MarketCategory;
  sourceMode?: IntegrationMode;
  futuresGridBotIds?: string[];
  spotGridBotIds?: string[];
  format?: OutputFormat;
  from?: string;
  to?: string;
  window?: string;
  timeoutMs?: number;
  positionsMaxPages?: number;
  executionsMaxPagesPerChunk?: number;
  paginationLimitMode?: "error" | "partial";
  configDiagnostics?: boolean;
  help?: boolean;
}

export interface ParsedCliArgs {
  command?: CommandName;
  options: ParsedCliOptions;
  errors: string[];
}
