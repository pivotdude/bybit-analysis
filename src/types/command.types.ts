import type { MarketCategory } from "./domain.types";

export type CommandName =
  | "summary"
  | "balance"
  | "pnl"
  | "positions"
  | "exposure"
  | "performance"
  | "risk"
  | "bots"
  | "config"
  | "health";

export type OutputFormat = "md" | "compact";

export interface TimeRange {
  from: string;
  to: string;
}

export interface ParsedCliOptions {
  apiKey?: string;
  apiSecret?: string;
  category?: MarketCategory;
  format?: OutputFormat;
  from?: string;
  to?: string;
  window?: string;
  lang?: string;
  timeoutMs?: number;
  help?: boolean;
}

export interface ParsedCliArgs {
  command?: CommandName;
  options: ParsedCliOptions;
  errors: string[];
}
