import { afterEach, describe, expect, it } from "bun:test";
import type { RuntimeConfig } from "../../types/config.types";
import {
  type BybitClientOptions,
  BybitHttpError,
  BybitMalformedResponseError,
  BybitTransportError,
  createBybitClient
} from "./BybitClientFactory";

const originalFetch = globalThis.fetch;

const runtimeConfig = {
  apiKey: "test-api-key",
  apiSecret: "test-api-secret",
  timeoutMs: 5_000
} as RuntimeConfig;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function mockFetch(responseFactory: () => Response | Promise<Response>): void {
  globalThis.fetch = (async (..._args: Parameters<typeof fetch>) => responseFactory()) as unknown as typeof fetch;
}

function createTestClient(options?: BybitClientOptions) {
  return createBybitClient(runtimeConfig, {
    sleep: async () => undefined,
    random: () => 0,
    ...options
  });
}

describe("BybitReadonlyClient HTTP error parsing", () => {
  it("handles non-JSON 5xx responses without parse crashes and keeps diagnostics", async () => {
    mockFetch(
      async () =>
        new Response("<html><body>gateway down</body></html>", {
          status: 502,
          statusText: "Bad Gateway",
          headers: { "content-type": "text/html; charset=utf-8" }
        })
    );

    const client = createTestClient();

    try {
      await client.getServerTime();
      throw new Error("expected HTTP error");
    } catch (error) {
      expect(error).toBeInstanceOf(BybitHttpError);
      expect(error).not.toBeInstanceOf(SyntaxError);

      const httpError = error as BybitHttpError;
      expect(httpError.status).toBe(502);
      expect(httpError.statusText).toBe("Bad Gateway");
      expect(httpError.endpoint).toBe("/v5/market/time");
      expect(httpError.requestContext.method).toBe("GET");
      expect(httpError.requestContext.hasRequestBody).toBe(false);
      expect(httpError.rawBodyFragment).toContain("gateway down");
    }
  });

  it("handles malformed JSON 4xx responses as HTTP errors and preserves body fragments", async () => {
    mockFetch(
      async () =>
        new Response("{\"retCode\": 10001", {
          status: 401,
          statusText: "Unauthorized",
          headers: { "content-type": "application/json" }
        })
    );

    const client = createTestClient();

    try {
      await client.getApiKeyInfo();
      throw new Error("expected HTTP error");
    } catch (error) {
      expect(error).toBeInstanceOf(BybitHttpError);
      expect(error).not.toBeInstanceOf(SyntaxError);

      const httpError = error as BybitHttpError;
      expect(httpError.status).toBe(401);
      expect(httpError.endpoint).toBe("/v5/user/query-api");
      expect(httpError.requestContext.method).toBe("GET");
      expect(httpError.rawBodyFragment).toContain("{\"retCode\": 10001");
    }
  });

  it("extracts bybit retCode/retMsg from JSON 5xx payloads", async () => {
    mockFetch(
      async () =>
        new Response("{\"retCode\":10016,\"retMsg\":\"service unavailable\"}", {
          status: 503,
          statusText: "Service Unavailable",
          headers: { "content-type": "application/json" }
        })
    );

    const client = createTestClient();

    try {
      await client.getServerTime();
      throw new Error("expected HTTP error");
    } catch (error) {
      expect(error).toBeInstanceOf(BybitHttpError);
      const httpError = error as BybitHttpError;
      expect(httpError.bybitRetCode).toBe(10016);
      expect(httpError.bybitRetMsg).toBe("service unavailable");
    }
  });

  it("reports malformed success JSON as parse errors with endpoint context", async () => {
    mockFetch(
      async () =>
        new Response("{\"retCode\":0,\"retMsg\":\"OK\",\"result\":", {
          status: 200,
          statusText: "OK",
          headers: { "content-type": "application/json" }
        })
    );

    const client = createTestClient();

    try {
      await client.getServerTime();
      throw new Error("expected parse error");
    } catch (error) {
      expect(error).toBeInstanceOf(BybitMalformedResponseError);
      expect(error).not.toBeInstanceOf(SyntaxError);

      const parseError = error as BybitMalformedResponseError;
      expect(parseError.endpoint).toBe("/v5/market/time");
      expect(parseError.requestContext.method).toBe("GET");
      expect(parseError.rawBodyFragment).toContain("\"retCode\":0");
    }
  });

  it("keeps transport failures distinct from response parse errors", async () => {
    globalThis.fetch = (async (..._args: Parameters<typeof fetch>) => {
      throw new TypeError("network unavailable");
    }) as unknown as typeof fetch;

    const client = createTestClient();

    try {
      await client.getServerTime();
      throw new Error("expected transport error");
    } catch (error) {
      expect(error).toBeInstanceOf(BybitTransportError);
      expect(error).not.toBeInstanceOf(BybitMalformedResponseError);
      expect(error).not.toBeInstanceOf(BybitHttpError);
      expect((error as BybitTransportError).requestContext.endpoint).toBe("/v5/market/time");
    }
  });
});

describe("BybitReadonlyClient retry policy", () => {
  it("retries transient 5xx responses with exponential backoff", async () => {
    let callCount = 0;
    const delays: number[] = [];

    mockFetch(async () => {
      callCount += 1;
      if (callCount === 1) {
        return new Response("{\"retCode\":10016,\"retMsg\":\"service unavailable\"}", {
          status: 503,
          statusText: "Service Unavailable",
          headers: { "content-type": "application/json" }
        });
      }

      return new Response("{\"retCode\":0,\"retMsg\":\"OK\",\"result\":{\"timeNano\":\"1\",\"timeSecond\":\"1\"},\"time\":1}", {
        status: 200,
        statusText: "OK",
        headers: { "content-type": "application/json" }
      });
    });

    const client = createTestClient({
      sleep: async (delayMs) => {
        delays.push(delayMs);
      },
      retryPolicy: {
        maxAttempts: 3,
        baseDelayMs: 100,
        maxDelayMs: 1_000,
        jitterRatio: 0
      }
    });

    const serverTime = await client.getServerTime();
    expect(serverTime).toEqual({ timeNano: "1", timeSecond: "1" });
    expect(callCount).toBe(2);
    expect(delays).toEqual([100]);
  });

  it("respects Retry-After for 429 responses", async () => {
    let callCount = 0;
    const delays: number[] = [];

    mockFetch(async () => {
      callCount += 1;
      if (callCount === 1) {
        return new Response("{\"retCode\":10006,\"retMsg\":\"too many requests\"}", {
          status: 429,
          statusText: "Too Many Requests",
          headers: {
            "content-type": "application/json",
            "retry-after": "2"
          }
        });
      }

      return new Response("{\"retCode\":0,\"retMsg\":\"OK\",\"result\":{\"timeNano\":\"2\",\"timeSecond\":\"2\"},\"time\":2}", {
        status: 200,
        statusText: "OK",
        headers: { "content-type": "application/json" }
      });
    });

    const client = createTestClient({
      sleep: async (delayMs) => {
        delays.push(delayMs);
      },
      retryPolicy: {
        maxAttempts: 3,
        baseDelayMs: 100,
        maxDelayMs: 1_000,
        jitterRatio: 0
      }
    });

    const serverTime = await client.getServerTime();
    expect(serverTime).toEqual({ timeNano: "2", timeSecond: "2" });
    expect(callCount).toBe(2);
    expect(delays).toEqual([2_000]);
  });

  it("does not retry permanent 4xx responses", async () => {
    let callCount = 0;

    mockFetch(async () => {
      callCount += 1;
      return new Response("{\"retCode\":10003,\"retMsg\":\"invalid key\"}", {
        status: 401,
        statusText: "Unauthorized",
        headers: { "content-type": "application/json" }
      });
    });

    const client = createTestClient({
      retryPolicy: {
        maxAttempts: 4,
        baseDelayMs: 100,
        maxDelayMs: 1_000,
        jitterRatio: 0
      }
    });

    await expect(client.getApiKeyInfo()).rejects.toBeInstanceOf(BybitHttpError);
    expect(callCount).toBe(1);
  });

  it("stores retry metadata on final transport failure", async () => {
    const delays: number[] = [];

    globalThis.fetch = (async (..._args: Parameters<typeof fetch>) => {
      throw new TypeError("network reset by peer");
    }) as unknown as typeof fetch;

    const client = createTestClient({
      sleep: async (delayMs) => {
        delays.push(delayMs);
      },
      retryPolicy: {
        maxAttempts: 3,
        baseDelayMs: 50,
        maxDelayMs: 200,
        jitterRatio: 0
      }
    });

    try {
      await client.getServerTime();
      throw new Error("expected transport error");
    } catch (error) {
      expect(error).toBeInstanceOf(BybitTransportError);
      const transportError = error as BybitTransportError;
      expect(transportError.retryInfo).toEqual({
        attempts: 3,
        retries: 2,
        maxAttempts: 3,
        delaysMs: [50, 100],
        totalDelayMs: 150
      });
      expect(delays).toEqual([50, 100]);
    }
  });
});

describe("BybitReadonlyClient positions query", () => {
  it("does not force settleCoin when fetching linear positions", async () => {
    let requestUrl = "";

    globalThis.fetch = (async (...args: Parameters<typeof fetch>) => {
      const [input] = args;
      requestUrl = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      return new Response("{\"retCode\":0,\"retMsg\":\"OK\",\"result\":{\"list\":[]},\"time\":1}", {
        status: 200,
        statusText: "OK",
        headers: { "content-type": "application/json" }
      });
    }) as unknown as typeof fetch;

    const client = createTestClient();
    await client.getPositions("linear");

    const url = new URL(requestUrl);
    expect(url.pathname).toBe("/v5/position/list");
    expect(url.searchParams.get("category")).toBe("linear");
    expect(url.searchParams.get("limit")).toBe("200");
    expect(url.searchParams.has("settleCoin")).toBe(false);
  });
});
