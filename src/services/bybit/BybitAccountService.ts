import type {
  AccountDataService,
  ApiKeyPermissionInfo,
  HealthCheckResult,
  ServiceRequestContext
} from "../contracts/AccountDataService";
import type { PositionDataService } from "../contracts/PositionDataService";
import type { BotDataService } from "../contracts/BotDataService";
import type { CacheStore } from "../cache/CacheStore";
import { cacheKeys } from "../cache/cacheKeys";
import type { BybitReadonlyClient } from "./BybitClientFactory";
import { normalizeAccountSnapshot } from "../normalizers/accountSnapshot.normalizer";
import type { AccountSnapshot, AssetBalance, BotReport } from "../../types/domain.types";
import { redactIpWhitelist, redactSecretValue } from "../../security/redaction";

const WALLET_TTL_MS = 15_000;
const SERVER_TIME_TTL_MS = 10_000;
const API_KEY_INFO_TTL_MS = 15_000;

function aggregateBotBalances(report: BotReport): AssetBalance[] {
  const grouped = new Map<string, AssetBalance>();

  for (const bot of report.bots) {
    const asset = (bot.quoteAsset ?? "USD").toUpperCase();
    const walletBalance = bot.allocatedCapitalUsd ?? 0;
    const availableBalance = bot.availableBalanceUsd ?? 0;
    const usdValue = bot.equityUsd ?? walletBalance + (bot.unrealizedPnlUsd ?? 0);

    const current = grouped.get(asset) ?? {
      asset,
      walletBalance: 0,
      availableBalance: 0,
      usdValue: 0
    };

    current.walletBalance += walletBalance;
    current.availableBalance += availableBalance;
    current.usdValue += usdValue;

    grouped.set(asset, current);
  }

  return Array.from(grouped.values()).sort((a, b) => b.usdValue - a.usdValue);
}

export class BybitAccountService implements AccountDataService {
  constructor(
    private readonly client: BybitReadonlyClient,
    private readonly positionsService: PositionDataService,
    private readonly botService: BotDataService,
    private readonly cache: CacheStore
  ) {}

  async getAccountSnapshot(context: ServiceRequestContext): Promise<AccountSnapshot> {
    if (context.category === "bot") {
      const botReport = await this.botService.getBotReport(context);
      const positionsResult = await this.positionsService.getOpenPositions(context);
      const balances = aggregateBotBalances(botReport);

      const walletBalanceUsd = botReport.totalAllocatedUsd ?? 0;
      const unrealizedPnlUsd = botReport.bots.reduce((sum, bot) => sum + (bot.unrealizedPnlUsd ?? 0), 0);
      const availableBalanceUsd = botReport.bots.reduce((sum, bot) => sum + (bot.availableBalanceUsd ?? 0), 0);
      const totalEquityUsd =
        botReport.bots.reduce((sum, bot) => sum + (bot.equityUsd ?? 0), 0) ||
        walletBalanceUsd + unrealizedPnlUsd;

      return {
        source: "bybit",
        exchange: "bybit",
        category: context.category,
        capturedAt: new Date().toISOString(),
        accountId: "BOT",
        totalEquityUsd,
        walletBalanceUsd,
        availableBalanceUsd,
        unrealizedPnlUsd,
        positions: positionsResult.positions,
        balances,
        dataCompleteness: positionsResult.dataCompleteness
      };
    }

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

    const positionsResult = await this.positionsService.getOpenPositions(context);
    return normalizeAccountSnapshot(
      walletPayload,
      context.category,
      positionsResult.positions,
      positionsResult.dataCompleteness
    );
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
      const authCategory = context.category === "bot" ? "linear" : context.category;
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
      diagnostics
    };
  }

  async getApiKeyPermissionInfo(context: ServiceRequestContext): Promise<ApiKeyPermissionInfo> {
    const key = cacheKeys.apiKeyInfo();
    const cached = this.cache.get<ApiKeyPermissionInfo>(key);
    if (cached) {
      return cached;
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
      permissions
    };

    this.cache.set(key, normalized, API_KEY_INFO_TTL_MS);
    return normalized;
  }
}
