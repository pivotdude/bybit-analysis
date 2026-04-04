import type { AccountSnapshot, IntegrationMode, MarketCategory } from "../../types/domain.types";

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
}

export interface ApiKeyPermissionInfo {
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
  getAccountSnapshot(context: ServiceRequestContext): Promise<AccountSnapshot>;
  checkHealth(context: ServiceRequestContext): Promise<HealthCheckResult>;
  getApiKeyPermissionInfo(context: ServiceRequestContext): Promise<ApiKeyPermissionInfo>;
}
