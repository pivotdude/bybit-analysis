import type { AccountSnapshot, MarketCategory } from "../../types/domain.types";

export interface ServiceRequestContext {
  category: MarketCategory;
  futuresGridBotIds: string[];
  spotGridBotIds: string[];
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
  apiKey?: string;
  note?: string;
  readOnly: boolean;
  isMaster?: boolean;
  ips: string[];
  permissions: Record<string, string[]>;
}

export interface AccountDataService {
  getAccountSnapshot(context: ServiceRequestContext): Promise<AccountSnapshot>;
  checkHealth(context: ServiceRequestContext): Promise<HealthCheckResult>;
  getApiKeyPermissionInfo(context: ServiceRequestContext): Promise<ApiKeyPermissionInfo>;
}
