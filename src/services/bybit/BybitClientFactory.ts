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

  async getWalletBalance(category: MarketCategory, timeoutMs?: number): Promise<unknown> {
    const accountType = category === "spot" ? "SPOT" : "UNIFIED";
    return this.requestPrivate("/v5/account/wallet-balance", { accountType }, timeoutMs ?? this.config.timeoutMs);
  }

  async getPositions(category: MarketCategory, cursor?: string, timeoutMs?: number): Promise<unknown> {
    return this.requestPrivate(
      "/v5/position/list",
      {
        category,
        settleCoin: category === "linear" ? "USDT" : undefined,
        limit: 200,
        cursor
      },
      timeoutMs ?? this.config.timeoutMs
    );
  }

  async getClosedPnl(category: MarketCategory, from: string, to: string, cursor?: string, timeoutMs?: number): Promise<unknown> {
    return this.requestPrivate(
      "/v5/position/closed-pnl",
      {
        category,
        startTime: new Date(from).getTime(),
        endTime: new Date(to).getTime(),
        limit: 100,
        cursor
      },
      timeoutMs ?? this.config.timeoutMs
    );
  }

  private async requestPrivate<T>(path: string, params: Record<string, string | number | undefined>, timeoutMs: number): Promise<T> {
    checkReadonlyEndpoint(path);

    const query = toQueryString(params);
    const timestamp = Date.now().toString();
    const recvWindow = "5000";
    const signaturePayload = `${timestamp}${this.config.apiKey}${recvWindow}${query}`;
    const signature = createHmac("sha256", this.config.apiSecret).update(signaturePayload).digest("hex");

    const url = `${BASE_URL}${path}${query ? `?${query}` : ""}`;
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "X-BAPI-API-KEY": this.config.apiKey,
        "X-BAPI-SIGN": signature,
        "X-BAPI-SIGN-TYPE": "2",
        "X-BAPI-TIMESTAMP": timestamp,
        "X-BAPI-RECV-WINDOW": recvWindow
      },
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
