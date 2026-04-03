import type { ParsedCliOptions, TimeRange } from "./types/command.types";
import type { MarketCategory } from "./types/domain.types";
import type { RedactedConfigView, ResolvedConfigSources, RuntimeConfig } from "./types/config.types";

const DEFAULT_CATEGORY: MarketCategory = "linear";
const DEFAULT_FORMAT = "md" as const;
const DEFAULT_LANG = "en";
const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_WINDOW_DAYS = 30;

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

function maskSecret(input: string): string {
  if (!input) {
    return "<missing>";
  }
  if (input.length <= 8) {
    return "*".repeat(input.length);
  }
  return `${input.slice(0, 4)}...${input.slice(-4)}`;
}

export function resolveRuntimeConfig(options: ParsedCliOptions, env: Record<string, string | undefined> = Bun.env): RuntimeConfig {
  const now = new Date();

  const apiKey = options.apiKey ?? env.BYBIT_API_KEY ?? "";
  const apiSecret = options.apiSecret ?? env.BYBIT_SECRET ?? "";
  const category = (options.category ?? env.DEFAULT_CATEGORY ?? DEFAULT_CATEGORY) as MarketCategory;
  const format = (options.format ?? (env.DEFAULT_FORMAT as "md" | "compact") ?? DEFAULT_FORMAT);
  const lang = options.lang ?? env.DEFAULT_LANG ?? DEFAULT_LANG;
  const timeoutMs = options.timeoutMs ?? Number(env.DEFAULT_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS);
  const timeRange = resolveTimeRange(options, env, now);

  if (category !== "linear" && category !== "spot") {
    throw new Error(`Invalid category: ${category}. Expected linear|spot`);
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
    apiKey,
    apiSecret,
    category,
    format,
    lang,
    timeoutMs,
    timeRange: timeRange.value,
    sources: {
      apiKey: options.apiKey ? "cli" : env.BYBIT_API_KEY ? "env" : "default",
      apiSecret: options.apiSecret ? "cli" : env.BYBIT_SECRET ? "env" : "default",
      category: options.category ? "cli" : env.DEFAULT_CATEGORY ? "env" : "default",
      format: options.format ? "cli" : env.DEFAULT_FORMAT ? "env" : "default",
      lang: options.lang ? "cli" : env.DEFAULT_LANG ? "env" : "default",
      timeoutMs: options.timeoutMs ? "cli" : env.DEFAULT_TIMEOUT_MS ? "env" : "default",
      timeRange: timeRange.source
    }
  };
}

export function validateCredentials(config: RuntimeConfig): void {
  if (!config.apiKey || !config.apiSecret) {
    throw new Error("Missing credentials: BYBIT_API_KEY and BYBIT_SECRET are required for this command");
  }
}

export function toRedactedConfigView(config: RuntimeConfig): RedactedConfigView {
  return {
    category: config.category,
    format: config.format,
    lang: config.lang,
    timeoutMs: config.timeoutMs,
    timeRange: config.timeRange,
    apiKey: maskSecret(config.apiKey),
    apiSecret: maskSecret(config.apiSecret),
    sources: config.sources
  };
}
