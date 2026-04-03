import type { AccountDataService, HealthCheckResult, ServiceRequestContext } from "../contracts/AccountDataService";
import type { PositionDataService } from "../contracts/PositionDataService";
import type { CacheStore } from "../cache/CacheStore";
import { cacheKeys } from "../cache/cacheKeys";
import type { BybitReadonlyClient } from "./BybitClientFactory";
import { normalizeAccountSnapshot } from "../normalizers/accountSnapshot.normalizer";
import type { AccountSnapshot } from "../../types/domain.types";

const WALLET_TTL_MS = 15_000;
const SERVER_TIME_TTL_MS = 10_000;

export class BybitAccountService implements AccountDataService {
  constructor(
    private readonly client: BybitReadonlyClient,
    private readonly positionsService: PositionDataService,
    private readonly cache: CacheStore
  ) {}

  async getAccountSnapshot(context: ServiceRequestContext): Promise<AccountSnapshot> {
    const key = cacheKeys.walletBalance(context.category);
    const cached = this.cache.get<unknown>(key);

    const walletPayload =
      cached ??
      (await this.client.getWalletBalance(
        context.category,
        context.timeoutMs
      ));

    if (!cached) {
      this.cache.set(key, walletPayload, WALLET_TTL_MS);
    }

    const positions = await this.positionsService.getOpenPositions(context);
    return normalizeAccountSnapshot(walletPayload, context.category, positions);
  }

  async checkHealth(context: ServiceRequestContext): Promise<HealthCheckResult> {
    const diagnostics: string[] = [];
    let connectivity: "ok" | "failed" = "ok";
    let auth: "ok" | "failed" = "ok";
    const startedAt = Date.now();

    let serverTime: { timeNano: string; timeSecond: string } | undefined;

    try {
      const key = cacheKeys.serverTime();
      serverTime = this.cache.get<{ timeNano: string; timeSecond: string }>(key);
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
      await this.client.getWalletBalance(context.category, context.timeoutMs);
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
      diagnostics
    };
  }
}
