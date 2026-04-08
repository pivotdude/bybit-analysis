import type { TimeRange } from "../types/command.types";

export function parseWindow(windowValue: string): number | null {
  const match = /^(\d+)(d)$/i.exec(windowValue.trim());
  if (!match) {
    return null;
  }

  const amount = Number(match[1]);
  return Number.isFinite(amount) && amount > 0 ? amount : null;
}

export function parseCsvIds(input: string | undefined): string[] {
  if (!input) {
    return [];
  }

  return input
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

export function isTruthyEnvValue(value: string | undefined): boolean {
  if (!value) {
    return false;
  }

  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

export function parseIdList(input: unknown): string[] | undefined {
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

export function asNonEmptyString(input: unknown): string | undefined {
  if (typeof input !== "string") {
    return undefined;
  }

  const trimmed = input.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function toIso(input: string, field: string): string {
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid ${field}: ${input}`);
  }

  return date.toISOString();
}

export function parseOptionalPositiveInt(raw: string | undefined, fieldName: string): number | undefined {
  if (raw === undefined || raw.trim().length === 0) {
    return undefined;
  }

  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Invalid ${fieldName}: ${raw}. Expected a positive integer`);
  }

  return parsed;
}

export function hasListConfigValue(value: string[] | undefined): boolean {
  return Boolean(value && value.length > 0);
}

export function buildDefaultTimeRange(now: Date, windowDays: number): TimeRange {
  const to = now.toISOString();
  const fromDate = new Date(now);
  fromDate.setUTCDate(fromDate.getUTCDate() - windowDays);
  return { from: fromDate.toISOString(), to };
}
