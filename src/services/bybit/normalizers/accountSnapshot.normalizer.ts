import type {
  AssetBalance,
  DataCompleteness,
  DataCompletenessIssue,
  EquitySnapshot,
  LiveAccountSnapshot,
  MarketCategory
} from "../../../types/domain.types";
import {
  completeDataCompleteness,
  degradedDataCompleteness,
  mergeDataCompleteness
} from "../../reliability/dataCompleteness";

interface NumberParseResult {
  value?: number;
  valid: boolean;
}

function parseNumber(input: unknown): NumberParseResult {
  if (input === null || input === undefined) {
    return { valid: false };
  }
  if (typeof input === "string" && input.trim().length === 0) {
    return { valid: false };
  }
  const value = Number(input);
  return Number.isFinite(value) ? { value, valid: true } : { valid: false };
}

function parseRequiredNumber(
  issues: DataCompletenessIssue[],
  field: string,
  input: unknown
): number {
  const parsed = parseNumber(input);
  if (parsed.valid && typeof parsed.value === "number") {
    return parsed.value;
  }

  issues.push({
    code: "invalid_payload_field",
    scope: "wallet_snapshot",
    severity: "critical",
    criticality: "critical",
    message: `Wallet snapshot field ${field} is invalid and was not used in analytics totals.`
  });
  return 0;
}

function parseOptionalNumber(
  issues: DataCompletenessIssue[],
  field: string,
  input: unknown
): number | undefined {
  if (input === undefined || input === null || input === "") {
    return undefined;
  }

  const parsed = parseNumber(input);
  if (parsed.valid) {
    return parsed.value;
  }

  issues.push({
    code: "invalid_payload_field",
    scope: "wallet_snapshot",
    severity: "warning",
    criticality: "optional",
    message: `Wallet snapshot field ${field} is invalid and was omitted from the normalized payload.`
  });
  return undefined;
}

function parseTimestamp(input: unknown): string | undefined {
  if (typeof input !== "string" && typeof input !== "number") {
    return undefined;
  }

  const date = new Date(input);
  if (Number.isNaN(date.getTime())) {
    return undefined;
  }

  return date.toISOString();
}

function normalizeBalances(input: unknown, issues: DataCompletenessIssue[]): AssetBalance[] {
  const wallet = input as { list?: Array<{ coin?: Array<Record<string, unknown>> }> } | undefined;
  const account = wallet?.list?.[0];
  const coins = account?.coin ?? [];

  return coins
    .map((coin, index): AssetBalance | undefined => {
      const asset = typeof coin.coin === "string" ? coin.coin.trim() : "";
      const walletBalance = parseNumber(coin.walletBalance);
      const lockedValue = parseNumber(coin.locked);
      let availableBalance: NumberParseResult;
      const rawAvailable = coin.availableToWithdraw ?? coin.free;
      const hasAvailable = rawAvailable !== undefined && rawAvailable !== null && rawAvailable !== "";
      if (!hasAvailable && walletBalance.valid && lockedValue.valid) {
        availableBalance = { value: walletBalance.value! - lockedValue.value!, valid: true };
      } else {
        availableBalance = parseNumber(rawAvailable);
      }
      const usdValue = parseNumber(coin.usdValue ?? coin.equity);

      if (!asset || !walletBalance.valid || !availableBalance.valid || !usdValue.valid) {
        issues.push({
          code: "invalid_payload_row",
          scope: "wallet_snapshot",
          severity: "critical",
          criticality: "critical",
          message: `Wallet balance row ${index + 1} is malformed and was excluded from normalized balances.`
        });
        return undefined;
      }

      return {
        asset,
        walletBalance: walletBalance.value!,
        availableBalance: availableBalance.value!,
        usdValue: usdValue.value!
      };
    })
    .filter((item): item is AssetBalance => item !== undefined)
    .sort((left, right) => right.usdValue - left.usdValue || left.asset.localeCompare(right.asset));
}

function normalizeEquityHistory(input: unknown, issues: DataCompletenessIssue[]): EquitySnapshot[] | undefined {
  if (!Array.isArray(input)) {
    return undefined;
  }

  const history = input
    .map((item, index): EquitySnapshot | undefined => {
      if (typeof item !== "object" || item === null) {
        issues.push({
          code: "invalid_payload_row",
          scope: "equity_history",
          severity: "critical",
          criticality: "critical",
          message: `Equity history row ${index + 1} is malformed and was excluded from ROI inputs.`
        });
        return undefined;
      }

      const row = item as Record<string, unknown>;
      const timestamp = parseTimestamp(row.timestamp ?? row.capturedAt ?? row.time ?? row.ts);
      const totalEquity = parseNumber(row.totalEquityUsd ?? row.totalEquity ?? row.equityUsd ?? row.equity);

      if (!timestamp || !totalEquity.valid) {
        issues.push({
          code: "invalid_payload_row",
          scope: "equity_history",
          severity: "critical",
          criticality: "critical",
          message: `Equity history row ${index + 1} is missing a valid timestamp or total equity and was excluded.`
        });
        return undefined;
      }

      return {
        timestamp,
        totalEquityUsd: totalEquity.value!,
        totalExposureUsd: parseNumber(row.totalExposureUsd ?? row.totalExposure ?? row.exposureUsd).value ?? 0,
        grossExposureUsd:
          parseNumber(row.grossExposureUsd ?? row.grossExposure ?? row.totalExposureUsd ?? row.totalExposure).value ?? 0,
        netExposureUsd: parseNumber(row.netExposureUsd ?? row.netExposure).value ?? 0
      };
    })
    .filter((item): item is EquitySnapshot => item !== undefined)
    .sort(
      (left, right) =>
        new Date(left.timestamp).getTime() - new Date(right.timestamp).getTime() ||
        left.totalEquityUsd - right.totalEquityUsd ||
        left.totalExposureUsd - right.totalExposureUsd ||
        left.grossExposureUsd - right.grossExposureUsd ||
        left.netExposureUsd - right.netExposureUsd
    );

  return history.length > 0 ? history : undefined;
}

export interface AccountSnapshotNormalizationOptions {
  equityHistoryInput?: unknown;
}

export function normalizeAccountSnapshot(
  input: unknown,
  category: MarketCategory,
  dataCompleteness: DataCompleteness = completeDataCompleteness(),
  options: AccountSnapshotNormalizationOptions = {}
): LiveAccountSnapshot {
  const wallet = input as { list?: Array<Record<string, unknown>> } | undefined;
  const row = wallet?.list?.[0] ?? {};
  const issues: DataCompletenessIssue[] = [];
  const balances = normalizeBalances(input, issues);
  const equityHistory = normalizeEquityHistory(options.equityHistoryInput, issues);

  const normalized: LiveAccountSnapshot = {
    source: "bybit",
    exchange: "bybit",
    category,
    capturedAt: new Date().toISOString(),
    accountId: typeof row.accountType === "string" ? row.accountType : undefined,
    totalEquityUsd: parseRequiredNumber(issues, "totalEquity", row.totalEquity),
    walletBalanceUsd: parseRequiredNumber(issues, "totalWalletBalance", row.totalWalletBalance),
    availableBalanceUsd: parseRequiredNumber(issues, "totalAvailableBalance", row.totalAvailableBalance),
    marginBalanceUsd: parseOptionalNumber(issues, "totalMarginBalance", row.totalMarginBalance),
    totalInitialMarginUsd: parseOptionalNumber(issues, "totalInitialMargin", row.totalInitialMargin),
    totalMaintenanceMarginUsd: parseOptionalNumber(issues, "totalMaintenanceMargin", row.totalMaintenanceMargin),
    unrealizedPnlUsd: parseRequiredNumber(issues, "totalPerpUPL", row.totalPerpUPL),
    equityHistory,
    balances,
    dataCompleteness
  };

  return {
    ...normalized,
    dataCompleteness:
      issues.length > 0
        ? mergeDataCompleteness(normalized.dataCompleteness, degradedDataCompleteness(issues))
        : normalized.dataCompleteness
  };
}
