import { createHmac } from "node:crypto";
import type { RuntimeConfig } from "../../types/config.types";
import type { MarketCategory } from "../../types/domain.types";

type HttpMethod = "GET" | "POST";

interface BybitApiResponse<T> {
  retCode: number;
  retMsg: string;
  result: T;
  time: number;
}

export interface BybitRequestContext {
  method: HttpMethod;
  endpoint: string;
  url: string;
  timeoutMs: number;
  query?: Record<string, string | number | undefined>;
  hasRequestBody: boolean;
}

const ERROR_BODY_FRAGMENT_MAX_CHARS = 512;
const BASE_URL = "https://api.bybit.com";
const WRITE_ENDPOINT_GUARD = [
  "/v5/order",
  "/v5/position/set",
  "/v5/asset/transfer",
  "/v5/account/set",
  "/v5/spot-lever-token",
  "/v5/loan"
];

export class BybitTransportError extends Error {
  readonly endpoint: string;
  readonly requestContext: BybitRequestContext;

  constructor(requestContext: BybitRequestContext, cause: unknown) {
    const reason = cause instanceof Error ? cause.message : String(cause);
    super(`Bybit transport failure while requesting ${requestContext.method} ${requestContext.endpoint}: ${reason}`, { cause });
    this.name = "BybitTransportError";
    this.endpoint = requestContext.endpoint;
    this.requestContext = requestContext;
  }
}

export class BybitHttpError extends Error {
  readonly status: number;
  readonly statusText: string;
  readonly endpoint: string;
  readonly requestContext: BybitRequestContext;
  readonly rawBodyFragment?: string;
  readonly bybitRetCode?: number;
  readonly bybitRetMsg?: string;

  constructor(args: {
    status: number;
    statusText: string;
    requestContext: BybitRequestContext;
    rawBodyFragment?: string;
    bybitRetCode?: number;
    bybitRetMsg?: string;
  }) {
    const bybitContext =
      args.bybitRetCode !== undefined
        ? `; bybitRetCode=${args.bybitRetCode}${args.bybitRetMsg ? `; bybitRetMsg=${args.bybitRetMsg}` : ""}`
        : "";
    super(`Bybit HTTP error ${args.status}: ${args.statusText} [${args.requestContext.method} ${args.requestContext.endpoint}]${bybitContext}`);
    this.name = "BybitHttpError";
    this.status = args.status;
    this.statusText = args.statusText;
    this.endpoint = args.requestContext.endpoint;
    this.requestContext = args.requestContext;
    this.rawBodyFragment = args.rawBodyFragment;
    this.bybitRetCode = args.bybitRetCode;
    this.bybitRetMsg = args.bybitRetMsg;
  }
}

export class BybitApiError extends Error {
  readonly retCode: number;
  readonly retMsg: string;
  readonly endpoint: string;
  readonly requestContext: BybitRequestContext;

  constructor(retCode: number, retMsg: string, requestContext: BybitRequestContext) {
    super(`Bybit API error ${retCode}: ${retMsg} [${requestContext.method} ${requestContext.endpoint}]`);
    this.name = "BybitApiError";
    this.retCode = retCode;
    this.retMsg = retMsg;
    this.endpoint = requestContext.endpoint;
    this.requestContext = requestContext;
  }
}

export class BybitMalformedResponseError extends Error {
  readonly endpoint: string;
  readonly requestContext: BybitRequestContext;
  readonly contentType?: string;
  readonly rawBodyFragment?: string;

  constructor(args: {
    reason: string;
    requestContext: BybitRequestContext;
    contentType?: string;
    rawBodyFragment?: string;
  }) {
    super(`Bybit response parse error: ${args.reason} [${args.requestContext.method} ${args.requestContext.endpoint}]`);
    this.name = "BybitMalformedResponseError";
    this.endpoint = args.requestContext.endpoint;
    this.requestContext = args.requestContext;
    this.contentType = args.contentType;
    this.rawBodyFragment = args.rawBodyFragment;
  }
}

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

function createBodyFragment(bodyText: string): string | undefined {
  const compacted = bodyText.replace(/\s+/g, " ").trim();
  if (!compacted) {
    return undefined;
  }
  if (compacted.length <= ERROR_BODY_FRAGMENT_MAX_CHARS) {
    return compacted;
  }
  return `${compacted.slice(0, ERROR_BODY_FRAGMENT_MAX_CHARS)}...<truncated>`;
}

function isLikelyJsonBody(bodyText: string, contentType: string | null): boolean {
  const normalizedType = contentType?.toLowerCase() ?? "";
  if (normalizedType.includes("application/json") || normalizedType.includes("+json")) {
    return true;
  }
  const firstNonWhitespace = bodyText.trimStart()[0];
  return firstNonWhitespace === "{" || firstNonWhitespace === "[";
}

function tryParseJson(bodyText: string): unknown | undefined {
  try {
    return JSON.parse(bodyText) as unknown;
  } catch {
    return undefined;
  }
}

function isBybitEnvelopeLike(payload: unknown): payload is { retCode: number; retMsg: string; result?: unknown } {
  if (!payload || typeof payload !== "object") {
    return false;
  }
  const record = payload as Record<string, unknown>;
  return typeof record.retCode === "number" && typeof record.retMsg === "string";
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
    const requestContext: BybitRequestContext = {
      method,
      endpoint: path,
      url,
      timeoutMs: args.timeoutMs,
      query: args.query,
      hasRequestBody: method === "POST"
    };

    const response = await this.fetchWithTransportContext({
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
    }, requestContext);

    return this.handleResponse<T>(response, requestContext);
  }

  private async requestPublic<T>(path: string, params: Record<string, string | number | undefined>, timeoutMs: number): Promise<T> {
    const query = toQueryString(params);
    const url = `${BASE_URL}${path}${query ? `?${query}` : ""}`;

    const requestContext: BybitRequestContext = {
      method: "GET",
      endpoint: path,
      url,
      timeoutMs,
      query: params,
      hasRequestBody: false
    };

    const response = await this.fetchWithTransportContext({
      method: "GET",
      signal: AbortSignal.timeout(timeoutMs)
    }, requestContext);

    return this.handleResponse<T>(response, requestContext);
  }

  private async fetchWithTransportContext(init: RequestInit, requestContext: BybitRequestContext): Promise<Response> {
    try {
      return await fetch(requestContext.url, init);
    } catch (error) {
      throw new BybitTransportError(requestContext, error);
    }
  }

  private async handleResponse<T>(response: Response, requestContext: BybitRequestContext): Promise<T> {
    if (!response.ok) {
      throw await this.createHttpError(response, requestContext);
    }

    const payload = await this.parseSuccessPayload<T>(response, requestContext);
    if (payload.retCode !== 0) {
      throw new BybitApiError(payload.retCode, payload.retMsg, requestContext);
    }

    return payload.result;
  }

  private async createHttpError(response: Response, requestContext: BybitRequestContext): Promise<BybitHttpError> {
    const { bodyText, readError } = await this.readBodyTextSafe(response);
    const contentType = response.headers.get("content-type");
    const rawBodyFragment = readError ? `<unavailable: ${readError}>` : createBodyFragment(bodyText);

    let bybitRetCode: number | undefined;
    let bybitRetMsg: string | undefined;

    if (bodyText && isLikelyJsonBody(bodyText, contentType)) {
      const parsedBody = tryParseJson(bodyText);
      if (isBybitEnvelopeLike(parsedBody)) {
        bybitRetCode = parsedBody.retCode;
        bybitRetMsg = parsedBody.retMsg;
      }
    }

    return new BybitHttpError({
      status: response.status,
      statusText: response.statusText,
      requestContext,
      rawBodyFragment,
      bybitRetCode,
      bybitRetMsg
    });
  }

  private async parseSuccessPayload<T>(response: Response, requestContext: BybitRequestContext): Promise<BybitApiResponse<T>> {
    const { bodyText, readError } = await this.readBodyTextSafe(response);
    const contentType = response.headers.get("content-type") ?? undefined;

    if (readError) {
      throw new BybitMalformedResponseError({
        reason: `unable to read response body (${readError})`,
        requestContext,
        contentType
      });
    }

    if (!bodyText.trim()) {
      throw new BybitMalformedResponseError({
        reason: "empty response body",
        requestContext,
        contentType
      });
    }

    const parsedBody = tryParseJson(bodyText);
    if (parsedBody === undefined) {
      throw new BybitMalformedResponseError({
        reason: "invalid JSON body",
        requestContext,
        contentType,
        rawBodyFragment: createBodyFragment(bodyText)
      });
    }

    if (!isBybitEnvelopeLike(parsedBody)) {
      throw new BybitMalformedResponseError({
        reason: "missing retCode/retMsg fields",
        requestContext,
        contentType,
        rawBodyFragment: createBodyFragment(bodyText)
      });
    }

    if (parsedBody.retCode === 0 && !("result" in parsedBody)) {
      throw new BybitMalformedResponseError({
        reason: "missing result field for successful response",
        requestContext,
        contentType,
        rawBodyFragment: createBodyFragment(bodyText)
      });
    }

    return parsedBody as BybitApiResponse<T>;
  }

  private async readBodyTextSafe(response: Response): Promise<{ bodyText: string; readError?: string }> {
    try {
      return { bodyText: await response.text() };
    } catch (error) {
      const readError = error instanceof Error ? error.message : String(error);
      return { bodyText: "", readError };
    }
  }
}

export function createBybitClient(config: RuntimeConfig): BybitReadonlyClient {
  return new BybitReadonlyClient(config);
}
