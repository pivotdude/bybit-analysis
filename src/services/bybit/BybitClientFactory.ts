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

export interface BybitRetryPolicy {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  jitterRatio: number;
  retryOnTransportErrors: boolean;
  retryOnHttp5xx: boolean;
  retryableHttpStatuses: number[];
  retryableRetCodes: number[];
}

export interface BybitRetryInfo {
  attempts: number;
  retries: number;
  maxAttempts: number;
  delaysMs: number[];
  totalDelayMs: number;
  failureClass: string;
}

export interface BybitClientOptions {
  retryPolicy?: Partial<BybitRetryPolicy>;
  sleep?: (delayMs: number) => Promise<void>;
  random?: () => number;
  fetchFn?: typeof fetch;
}

const ERROR_BODY_FRAGMENT_MAX_CHARS = 512;
const BASE_URL = "https://api.bybit.com";
const READONLY_PRIVATE_ENDPOINT_ALLOWLIST = new Set([
  "GET /v5/user/query-api",
  "GET /v5/account/wallet-balance",
  "GET /v5/position/list",
  "GET /v5/position/closed-pnl",
  "GET /v5/execution/list",
  "POST /v5/fgridbot/detail",
  "POST /v5/grid/query-grid-detail"
]);
const RETRYABLE_TRANSPORT_ERROR_PATTERNS = [
  "timed out",
  "timeout",
  "network",
  "reset",
  "econnreset",
  "econnrefused",
  "enotfound",
  "eai_again",
  "temporarily unavailable"
];

export const DEFAULT_BYBIT_RETRY_POLICY: BybitRetryPolicy = {
  maxAttempts: 4,
  baseDelayMs: 250,
  maxDelayMs: 4_000,
  jitterRatio: 0.2,
  retryOnTransportErrors: true,
  retryOnHttp5xx: true,
  retryableHttpStatuses: [429],
  retryableRetCodes: [10000, 10006, 10016]
};

interface BybitClientRuntimeOptions {
  retryPolicy: BybitRetryPolicy;
  sleep: (delayMs: number) => Promise<void>;
  random: () => number;
  fetchFn: typeof fetch;
}

function createSleep(delayMs: number): Promise<void> {
  if (delayMs <= 0) {
    return Promise.resolve();
  }
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

export class BybitTransportError extends Error {
  readonly endpoint: string;
  readonly requestContext: BybitRequestContext;
  retryInfo?: BybitRetryInfo;

  constructor(requestContext: BybitRequestContext, cause: unknown, retryInfo?: BybitRetryInfo) {
    const reason = cause instanceof Error ? cause.message : String(cause);
    super(`Bybit transport failure while requesting ${requestContext.method} ${requestContext.endpoint}: ${reason}`, { cause });
    this.name = "BybitTransportError";
    this.endpoint = requestContext.endpoint;
    this.requestContext = requestContext;
    this.retryInfo = retryInfo;
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
  readonly retryAfterMs?: number;
  retryInfo?: BybitRetryInfo;

  constructor(args: {
    status: number;
    statusText: string;
    requestContext: BybitRequestContext;
    rawBodyFragment?: string;
    bybitRetCode?: number;
    bybitRetMsg?: string;
    retryAfterMs?: number;
    retryInfo?: BybitRetryInfo;
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
    this.retryAfterMs = args.retryAfterMs;
    this.retryInfo = args.retryInfo;
  }
}

export class BybitApiError extends Error {
  readonly retCode: number;
  readonly retMsg: string;
  readonly endpoint: string;
  readonly requestContext: BybitRequestContext;
  retryInfo?: BybitRetryInfo;

  constructor(retCode: number, retMsg: string, requestContext: BybitRequestContext, retryInfo?: BybitRetryInfo) {
    super(`Bybit API error ${retCode}: ${retMsg} [${requestContext.method} ${requestContext.endpoint}]`);
    this.name = "BybitApiError";
    this.retCode = retCode;
    this.retMsg = retMsg;
    this.endpoint = requestContext.endpoint;
    this.requestContext = requestContext;
    this.retryInfo = retryInfo;
  }
}

export class BybitMalformedResponseError extends Error {
  readonly endpoint: string;
  readonly requestContext: BybitRequestContext;
  readonly contentType?: string;
  readonly rawBodyFragment?: string;
  retryInfo?: BybitRetryInfo;

  constructor(args: {
    reason: string;
    requestContext: BybitRequestContext;
    contentType?: string;
    rawBodyFragment?: string;
    retryInfo?: BybitRetryInfo;
  }) {
    super(`Bybit response parse error: ${args.reason} [${args.requestContext.method} ${args.requestContext.endpoint}]`);
    this.name = "BybitMalformedResponseError";
    this.endpoint = args.requestContext.endpoint;
    this.requestContext = args.requestContext;
    this.contentType = args.contentType;
    this.rawBodyFragment = args.rawBodyFragment;
    this.retryInfo = args.retryInfo;
  }
}

function checkReadonlyEndpoint(method: HttpMethod, path: string): void {
  const normalizedKey = `${method} ${path.toLowerCase()}`;
  if (!READONLY_PRIVATE_ENDPOINT_ALLOWLIST.has(normalizedKey)) {
    throw new Error(`Blocked private endpoint outside read-only allowlist: ${method} ${path}`);
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

function resolveRetryPolicy(policy?: Partial<BybitRetryPolicy>): BybitRetryPolicy {
  const retryableHttpStatuses = policy?.retryableHttpStatuses?.length
    ? [...new Set(policy.retryableHttpStatuses.filter((status) => Number.isInteger(status) && status >= 100 && status <= 599))]
    : DEFAULT_BYBIT_RETRY_POLICY.retryableHttpStatuses;
  const retryableRetCodes = policy?.retryableRetCodes?.length
    ? [...new Set(policy.retryableRetCodes.filter((retCode) => Number.isInteger(retCode) && retCode >= 0))]
    : DEFAULT_BYBIT_RETRY_POLICY.retryableRetCodes;

  return {
    maxAttempts: Math.max(1, Math.floor(policy?.maxAttempts ?? DEFAULT_BYBIT_RETRY_POLICY.maxAttempts)),
    baseDelayMs: Math.max(0, Math.floor(policy?.baseDelayMs ?? DEFAULT_BYBIT_RETRY_POLICY.baseDelayMs)),
    maxDelayMs: Math.max(0, Math.floor(policy?.maxDelayMs ?? DEFAULT_BYBIT_RETRY_POLICY.maxDelayMs)),
    jitterRatio: Math.min(1, Math.max(0, policy?.jitterRatio ?? DEFAULT_BYBIT_RETRY_POLICY.jitterRatio)),
    retryOnTransportErrors: policy?.retryOnTransportErrors ?? DEFAULT_BYBIT_RETRY_POLICY.retryOnTransportErrors,
    retryOnHttp5xx: policy?.retryOnHttp5xx ?? DEFAULT_BYBIT_RETRY_POLICY.retryOnHttp5xx,
    retryableHttpStatuses,
    retryableRetCodes
  };
}

function parseRetryAfterMs(headerValue: string | null): number | undefined {
  if (!headerValue) {
    return undefined;
  }

  const trimmed = headerValue.trim();
  if (!trimmed) {
    return undefined;
  }

  const asSeconds = Number(trimmed);
  if (Number.isFinite(asSeconds) && asSeconds >= 0) {
    return Math.round(asSeconds * 1_000);
  }

  const asDateMs = Date.parse(trimmed);
  if (Number.isNaN(asDateMs)) {
    return undefined;
  }

  return Math.max(0, asDateMs - Date.now());
}

function hasTransientTransportSignature(cause: unknown): boolean {
  if (!(cause instanceof Error)) {
    return false;
  }

  const normalized = `${cause.name} ${cause.message}`.toLowerCase();
  return RETRYABLE_TRANSPORT_ERROR_PATTERNS.some((pattern) => normalized.includes(pattern));
}

function isRetryableHttpStatus(status: number, policy: BybitRetryPolicy): boolean {
  return policy.retryableHttpStatuses.includes(status) || (policy.retryOnHttp5xx && status >= 500 && status <= 599);
}

function isRetryableRetCode(retCode: number, policy: BybitRetryPolicy): boolean {
  return policy.retryableRetCodes.includes(retCode);
}

function classifyFailure(error: unknown): string {
  if (error instanceof BybitTransportError) {
    return "transport";
  }

  if (error instanceof BybitHttpError) {
    if (error.status === 429) {
      return "http_rate_limit";
    }
    if (error.status >= 500 && error.status <= 599) {
      return "http_server_error";
    }
    return "http_client_error";
  }

  if (error instanceof BybitApiError) {
    switch (error.retCode) {
      case 10000:
        return "api_timeout";
      case 10006:
        return "api_rate_limit";
      case 10016:
        return "api_service_unavailable";
      default:
        return `api_ret_code_${error.retCode}`;
    }
  }

  if (error instanceof BybitMalformedResponseError) {
    return "malformed_response";
  }

  return "unknown";
}

export class BybitReadonlyClient {
  private readonly runtimeOptions: BybitClientRuntimeOptions;

  constructor(private readonly config: RuntimeConfig, options?: BybitClientOptions) {
    this.runtimeOptions = {
      retryPolicy: resolveRetryPolicy(options?.retryPolicy),
      sleep: options?.sleep ?? createSleep,
      random: options?.random ?? Math.random,
      fetchFn: options?.fetchFn ?? fetch
    };
  }

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
    return this.requestPrivate("GET", "/v5/position/list", {
      query: {
        category,
        limit: 200,
        cursor
      },
      timeoutMs: timeoutMs ?? this.config.timeoutMs
    });
  }

  async getClosedPnl(category: MarketCategory, from: string, to: string, cursor?: string, timeoutMs?: number): Promise<unknown> {
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
    checkReadonlyEndpoint(method, path);

    const recvWindow = "5000";
    const query = toQueryString(args.query ?? {});
    const bodyString = args.body ? JSON.stringify(args.body) : "";

    const url = `${BASE_URL}${path}${query ? `?${query}` : ""}`;
    const requestContext: BybitRequestContext = {
      method,
      endpoint: path,
      url,
      timeoutMs: args.timeoutMs,
      query: args.query,
      hasRequestBody: method === "POST"
    };

    return this.executeWithRetry<T>(async () => {
      const timestamp = Date.now().toString();
      const payload = method === "GET" ? query : bodyString;
      const signaturePayload = `${timestamp}${this.config.apiKey}${recvWindow}${payload}`;
      const signature = createHmac("sha256", this.config.apiSecret).update(signaturePayload).digest("hex");

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
    });
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

    return this.executeWithRetry<T>(async () => {
      const response = await this.fetchWithTransportContext({
        method: "GET",
        signal: AbortSignal.timeout(timeoutMs)
      }, requestContext);

      return this.handleResponse<T>(response, requestContext);
    });
  }

  private async fetchWithTransportContext(init: RequestInit, requestContext: BybitRequestContext): Promise<Response> {
    try {
      return await this.runtimeOptions.fetchFn(requestContext.url, init);
    } catch (error) {
      throw new BybitTransportError(requestContext, error);
    }
  }

  private async executeWithRetry<T>(operation: () => Promise<T>): Promise<T> {
    const delaysMs: number[] = [];
    const policy = this.runtimeOptions.retryPolicy;

    for (let attempt = 1; attempt <= policy.maxAttempts; attempt += 1) {
      try {
        return await operation();
      } catch (error) {
        const shouldRetry = this.shouldRetryError(error, attempt);
        if (!shouldRetry) {
          throw this.attachRetryInfo(error, attempt, delaysMs);
        }

        const delayMs = this.calculateRetryDelayMs(error, attempt);
        delaysMs.push(delayMs);
        await this.runtimeOptions.sleep(delayMs);
      }
    }

    throw new Error("retry loop terminated unexpectedly");
  }

  private shouldRetryError(error: unknown, attempt: number): boolean {
    const hasAttemptsLeft = attempt < this.runtimeOptions.retryPolicy.maxAttempts;
    if (!hasAttemptsLeft) {
      return false;
    }

    if (error instanceof BybitHttpError) {
      return isRetryableHttpStatus(error.status, this.runtimeOptions.retryPolicy);
    }

    if (error instanceof BybitTransportError) {
      if (!this.runtimeOptions.retryPolicy.retryOnTransportErrors) {
        return false;
      }
      return hasTransientTransportSignature(error.cause) || error.cause instanceof TypeError;
    }

    if (error instanceof BybitApiError) {
      return isRetryableRetCode(error.retCode, this.runtimeOptions.retryPolicy);
    }

    return false;
  }

  private calculateRetryDelayMs(error: unknown, attempt: number): number {
    const policy = this.runtimeOptions.retryPolicy;
    const exponentialBase = Math.min(policy.maxDelayMs, policy.baseDelayMs * 2 ** (attempt - 1));
    const jitterWindow = exponentialBase * policy.jitterRatio;
    const jittered = Math.round(exponentialBase + (this.runtimeOptions.random() * 2 - 1) * jitterWindow);
    const bounded = Math.max(0, jittered);

    if (error instanceof BybitHttpError && error.retryAfterMs !== undefined) {
      return Math.max(bounded, error.retryAfterMs);
    }

    return bounded;
  }

  private attachRetryInfo(error: unknown, attempts: number, delaysMs: number[]): unknown {
    const retryInfo = this.createRetryInfo(attempts, delaysMs, classifyFailure(error));
    if (error instanceof BybitTransportError || error instanceof BybitHttpError || error instanceof BybitApiError || error instanceof BybitMalformedResponseError) {
      error.retryInfo = retryInfo;
      return error;
    }
    return error;
  }

  private createRetryInfo(attempts: number, delaysMs: number[], failureClass: string): BybitRetryInfo {
    return {
      attempts,
      retries: Math.max(0, attempts - 1),
      maxAttempts: this.runtimeOptions.retryPolicy.maxAttempts,
      delaysMs: [...delaysMs],
      totalDelayMs: delaysMs.reduce((total, delay) => total + delay, 0),
      failureClass
    };
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
    const retryAfterMs = parseRetryAfterMs(response.headers.get("retry-after"));

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
      bybitRetMsg,
      retryAfterMs
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

export function createBybitClient(config: RuntimeConfig, options?: BybitClientOptions): BybitReadonlyClient {
  return new BybitReadonlyClient(config, options);
}
