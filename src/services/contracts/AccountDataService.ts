import type { IntegrationMode, LiveAccountSnapshot, MarketCategory, SourceCacheStatus } from "../../types/domain.types";

export interface ServiceRequestContext {
  category: MarketCategory;
  sourceMode: IntegrationMode;
  providerContext?: Record<string, unknown>;
  from: string;
  to: string;
  timeoutMs: number;
}

export interface HealthCheckResult {
  connectivity: "ok" | "failed";
  auth: "ok" | "failed";
  latencyMs: number;
  serverTime?: string;
  timeDriftMs?: number;
  diagnostics: string[];
  cacheStatus?: SourceCacheStatus;
}

export interface ApiKeyPermissionInfo {
  cacheStatus?: SourceCacheStatus;
  apiKeyStatus: "present" | "missing";
  apiKeyDisplay: string;
  note?: string;
  readOnly: boolean;
  isMaster?: boolean;
  ipWhitelistRestricted: boolean;
  ipWhitelistCount: number;
  ipWhitelistDisplay: string;
  permissions: Record<string, string[]>;
}

export interface AccountDataService {
  getWalletSnapshot(context: ServiceRequestContext): Promise<LiveAccountSnapshot>;
  checkHealth(context: ServiceRequestContext): Promise<HealthCheckResult>;
  getApiKeyPermissionInfo(context: ServiceRequestContext): Promise<ApiKeyPermissionInfo>;
}
