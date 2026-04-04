import { afterEach, describe, expect, it } from "bun:test";
import type { RuntimeConfig } from "../../types/config.types";
import {
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

    const client = createBybitClient(runtimeConfig);

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

    const client = createBybitClient(runtimeConfig);

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

    const client = createBybitClient(runtimeConfig);

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

    const client = createBybitClient(runtimeConfig);

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

    const client = createBybitClient(runtimeConfig);

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
