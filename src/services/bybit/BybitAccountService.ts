import type {
  AccountDataService,
  ApiKeyPermissionInfo,
  HealthCheckResult,
  ServiceRequestContext
} from "../contracts/AccountDataService";
import type { CacheStore } from "../cache/CacheStore";
import { cacheKeys } from "../cache/cacheKeys";
import type { BybitReadonlyClient } from "./BybitClientFactory";
import { normalizeAccountSnapshot } from "./normalizers/accountSnapshot.normalizer";
import type { LiveAccountSnapshot } from "../../types/domain.types";
import { redactIpWhitelist, redactSecretValue } from "../../security/redaction";
import {
  buildUnsupportedFeatureIssue,
  degradedDataCompleteness,
  mergeDataCompleteness
} from "../reliability/dataCompleteness";

const WALLET_TTL_MS = 15_000;
const SERVER_TIME_TTL_MS = 10_000;
const API_KEY_INFO_TTL_MS = 15_000;
const ROI_CAPITAL_EFFICIENCY_UNSUPPORTED_MESSAGE =
  "ROI and capital efficiency are unsupported: historical equity source is unavailable in Bybit account snapshots.";

function withExplicitRoiUnsupported(snapshot: LiveAccountSnapshot): LiveAccountSnapshot {
  const hasEquityHistory = Array.isArray(snapshot.equityHistory) && snapshot.equityHistory.length > 0;
  if (hasEquityHistory) {
    return snapshot;
  }

  return {
    ...snapshot,
    equityHistory: undefined,
    dataCompleteness: mergeDataCompleteness(
      snapshot.dataCompleteness,
      degradedDataCompleteness([
        buildUnsupportedFeatureIssue({
          scope: "equity_history",
          message: ROI_CAPITAL_EFFICIENCY_UNSUPPORTED_MESSAGE
        })
      ])
    )
  };
}
export class BybitAccountService implements AccountDataService {
  constructor(
    private readonly client: BybitReadonlyClient,
    private readonly cache: CacheStore
  ) {}

  async getWalletSnapshot(context: ServiceRequestContext): Promise<LiveAccountSnapshot> {
    const key = cacheKeys.walletBalance(context.category);
    const cached = this.cache.getWithStatus<unknown>(key);

    const walletPayload =
      cached.value ??
      (await this.client.getWalletBalance(
        context.category,
        context.timeoutMs
      ));

    if (!cached.value) {
      this.cache.set(key, walletPayload, WALLET_TTL_MS);
    }

    return withExplicitRoiUnsupported({
      ...normalizeAccountSnapshot(
        walletPayload,
        context.category
      ),
      cacheStatus: cached.status
    });
  }

  async checkHealth(context: ServiceRequestContext): Promise<HealthCheckResult> {
    const diagnostics: string[] = [];
    let connectivity: "ok" | "failed" = "ok";
    let auth: "ok" | "failed" = "ok";
    const startedAt = Date.now();

    let serverTime: { timeNano: string; timeSecond: string } | undefined;
    let cacheStatus: HealthCheckResult["cacheStatus"] = "unknown";

    try {
      const key = cacheKeys.serverTime();
      const cachedServerTime = this.cache.getWithStatus<{ timeNano: string; timeSecond: string }>(key);
      serverTime = cachedServerTime.value;
      cacheStatus = cachedServerTime.status;
      if (!serverTime) {
        serverTime = await this.client.getServerTime(context.timeoutMs);
        this.cache.set(key, serverTime, SERVER_TIME_TTL_MS);
      }
      diagnostics.push("server_time_ok");
    } catch (error) {
      connectivity = "failed";
      diagnostics.push(`server_time_failed: ${error instanceof Error ? error.message : String(error)}`);
    }

    try {
      const authCategory = context.category;
      await this.client.getWalletBalance(authCategory, context.timeoutMs);
      diagnostics.push("auth_ok");
    } catch (error) {
      auth = "failed";
      diagnostics.push(`auth_failed: ${error instanceof Error ? error.message : String(error)}`);
    }

    const latencyMs = Date.now() - startedAt;
    const serverTimeIso = serverTime?.timeSecond
      ? new Date(Number(serverTime.timeSecond) * 1000).toISOString()
      : undefined;
    const timeDriftMs = serverTime?.timeSecond
      ? Math.abs(Date.now() - Number(serverTime.timeSecond) * 1000)
      : undefined;

    return {
      connectivity,
      auth,
      latencyMs,
      serverTime: serverTimeIso,
      timeDriftMs,
      diagnostics,
      cacheStatus
    };
  }

  async getApiKeyPermissionInfo(context: ServiceRequestContext): Promise<ApiKeyPermissionInfo> {
    const key = cacheKeys.apiKeyInfo();
    const cached = this.cache.getWithStatus<ApiKeyPermissionInfo>(key);
    if (cached.value) {
      return {
        ...cached.value,
        cacheStatus: "hit"
      };
    }

    const raw = (await this.client.getApiKeyInfo(context.timeoutMs)) as Record<string, unknown>;
    const permissionsRaw =
      typeof raw.permissions === "object" && raw.permissions !== null
        ? (raw.permissions as Record<string, unknown>)
        : {};

    const permissions: Record<string, string[]> = {};
    for (const [scope, value] of Object.entries(permissionsRaw)) {
      if (Array.isArray(value)) {
        permissions[scope] = value.map((item) => String(item));
      }
    }

    const apiKey = raw.apiKey ? String(raw.apiKey) : undefined;
    const ipWhitelist = Array.isArray(raw.ips) ? raw.ips.map((item) => String(item)) : [];
    const apiKeyRedaction = redactSecretValue(apiKey);
    const ipWhitelistRedaction = redactIpWhitelist(ipWhitelist);

    const normalized: ApiKeyPermissionInfo = {
      apiKeyStatus: apiKeyRedaction.presence,
      apiKeyDisplay: apiKeyRedaction.display,
      note: raw.note ? String(raw.note) : undefined,
      readOnly: String(raw.readOnly ?? "1") !== "0",
      isMaster: raw.isMaster !== undefined ? String(raw.isMaster) === "1" : undefined,
      ipWhitelistRestricted: ipWhitelistRedaction.restricted,
      ipWhitelistCount: ipWhitelistRedaction.count,
      ipWhitelistDisplay: ipWhitelistRedaction.display,
      permissions,
      cacheStatus: "miss"
    };

    this.cache.set(key, normalized, API_KEY_INFO_TTL_MS);
    return normalized;
  }
}
