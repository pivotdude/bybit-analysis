import { createHmac } from "node:crypto";
import type { RuntimeConfig } from "../../types/config.types";
import type { MarketCategory } from "../../types/domain.types";

interface BybitApiResponse<T> {
  retCode: number;
  retMsg: string;
  result: T;
  time: number;
}

const BASE_URL = "https://api.bybit.com";
const WRITE_ENDPOINT_GUARD = [
  "/v5/order",
  "/v5/position/set",
  "/v5/asset/transfer",
  "/v5/account/set",
  "/v5/spot-lever-token",
  "/v5/loan"
];

type HttpMethod = "GET" | "POST";

function checkReadonlyEndpoint(path: string): void {
  const normalized = path.toLowerCase();
  if (WRITE_ENDPOINT_GUARD.some((prefix) => normalized.startsWith(prefix))) {
    throw new Error(`Blocked endpoint by read-only guard: ${path}`);
  }
}

function toQueryString(params: Record<string, string | number | undefined>): string {
  const entries = Object.entries(params)
    .filter((entry): entry is [string, string | number] => entry[1] !== undefined)
    .sort(([left], [right]) => left.localeCompare(right));

  return entries.map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`).join("&");
}

export class BybitReadonlyClient {
  constructor(private readonly config: RuntimeConfig) {}

  async getServerTime(timeoutMs?: number): Promise<{ timeNano: string; timeSecond: string }> {
    return this.requestPublic("/v5/market/time", {}, timeoutMs ?? this.config.timeoutMs);
  }

  async getApiKeyInfo(timeoutMs?: number): Promise<unknown> {
    return this.requestPrivate("GET", "/v5/user/query-api", {
      query: {},
      timeoutMs: timeoutMs ?? this.config.timeoutMs
    });
  }

  async getWalletBalance(category: MarketCategory, timeoutMs?: number): Promise<unknown> {
    const effectiveTimeout = timeoutMs ?? this.config.timeoutMs;
    const preferredAccountType = category === "spot" ? "SPOT" : "UNIFIED";

    try {
      return await this.requestPrivate("GET", "/v5/account/wallet-balance", {
        query: { accountType: preferredAccountType },
        timeoutMs: effectiveTimeout
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const shouldRetryWithUnified =
        preferredAccountType === "SPOT" &&
        message.includes("Bybit API error 10001") &&
        message.toUpperCase().includes("ACCOUNTTYPE ONLY SUPPORT UNIFIED");

      if (!shouldRetryWithUnified) {
        throw error;
      }

      return this.requestPrivate("GET", "/v5/account/wallet-balance", {
        query: { accountType: "UNIFIED" },
        timeoutMs: effectiveTimeout
      });
    }
  }

  async getPositions(category: MarketCategory, cursor?: string, timeoutMs?: number): Promise<unknown> {
    if (category === "bot") {
      throw new Error("getPositions does not support category=bot");
    }

    return this.requestPrivate("GET", "/v5/position/list", {
      query: {
        category,
        settleCoin: category === "linear" ? "USDT" : undefined,
        limit: 200,
        cursor
      },
      timeoutMs: timeoutMs ?? this.config.timeoutMs
    });
  }

  async getClosedPnl(category: MarketCategory, from: string, to: string, cursor?: string, timeoutMs?: number): Promise<unknown> {
    if (category === "bot") {
      throw new Error("getClosedPnl does not support category=bot");
    }

    return this.requestPrivate("GET", "/v5/position/closed-pnl", {
      query: {
        category,
        startTime: new Date(from).getTime(),
        endTime: new Date(to).getTime(),
        limit: 100,
        cursor
      },
      timeoutMs: timeoutMs ?? this.config.timeoutMs
    });
  }

  async getExecutionList(
    category: MarketCategory,
    from: string,
    to: string,
    cursor?: string,
    timeoutMs?: number,
    symbol?: string
  ): Promise<unknown> {
    if (category === "bot") {
      throw new Error("getExecutionList does not support category=bot");
    }

    return this.requestPrivate("GET", "/v5/execution/list", {
      query: {
        category,
        startTime: new Date(from).getTime(),
        endTime: new Date(to).getTime(),
        symbol,
        execType: "Trade",
        limit: 100,
        cursor
      },
      timeoutMs: timeoutMs ?? this.config.timeoutMs
    });
  }

  async getFuturesGridBotDetail(botId: string, timeoutMs?: number): Promise<unknown> {
    return this.requestPrivate("POST", "/v5/fgridbot/detail", {
      body: { bot_id: botId },
      timeoutMs: timeoutMs ?? this.config.timeoutMs
    });
  }

  async getSpotGridBotDetail(gridId: string, timeoutMs?: number): Promise<unknown> {
    return this.requestPrivate("POST", "/v5/grid/query-grid-detail", {
      body: { grid_id: gridId },
      timeoutMs: timeoutMs ?? this.config.timeoutMs
    });
  }

  private async requestPrivate<T>(
    method: HttpMethod,
    path: string,
    args: {
      query?: Record<string, string | number | undefined>;
      body?: Record<string, unknown>;
      timeoutMs: number;
    }
  ): Promise<T> {
    checkReadonlyEndpoint(path);

    const recvWindow = "5000";
    const query = toQueryString(args.query ?? {});
    const bodyString = args.body ? JSON.stringify(args.body) : "";
    const timestamp = Date.now().toString();
    const payload = method === "GET" ? query : bodyString;
    const signaturePayload = `${timestamp}${this.config.apiKey}${recvWindow}${payload}`;
    const signature = createHmac("sha256", this.config.apiSecret).update(signaturePayload).digest("hex");

    const url = `${BASE_URL}${path}${query ? `?${query}` : ""}`;
    const response = await fetch(url, {
      method,
      headers: {
        "X-BAPI-API-KEY": this.config.apiKey,
        "X-BAPI-SIGN": signature,
        "X-BAPI-SIGN-TYPE": "2",
        "X-BAPI-TIMESTAMP": timestamp,
        "X-BAPI-RECV-WINDOW": recvWindow,
        ...(method === "POST" ? { "Content-Type": "application/json" } : {})
      },
      body: method === "POST" ? bodyString : undefined,
      signal: AbortSignal.timeout(args.timeoutMs)
    });

    const payloadBody = (await response.json()) as BybitApiResponse<T>;
    if (!response.ok) {
      throw new Error(`Bybit HTTP error ${response.status}: ${response.statusText}`);
    }
    if (payloadBody.retCode !== 0) {
      throw new Error(`Bybit API error ${payloadBody.retCode}: ${payloadBody.retMsg}`);
    }
    return payloadBody.result;
  }

  private async requestPublic<T>(path: string, params: Record<string, string | number | undefined>, timeoutMs: number): Promise<T> {
    const query = toQueryString(params);
    const url = `${BASE_URL}${path}${query ? `?${query}` : ""}`;

    const response = await fetch(url, {
      method: "GET",
      signal: AbortSignal.timeout(timeoutMs)
    });
    const payload = (await response.json()) as BybitApiResponse<T>;

    if (!response.ok) {
      throw new Error(`Bybit HTTP error ${response.status}: ${response.statusText}`);
    }
    if (payload.retCode !== 0) {
      throw new Error(`Bybit API error ${payload.retCode}: ${payload.retMsg}`);
    }

    return payload.result;
  }
}

export function createBybitClient(config: RuntimeConfig): BybitReadonlyClient {
  return new BybitReadonlyClient(config);
}
