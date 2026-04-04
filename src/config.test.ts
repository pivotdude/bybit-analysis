import { describe, expect, it } from "bun:test";
import { toRedactedConfigView } from "./config";
import { buildBybitProviderContext } from "./services/bybit/bybitProviderContext";
import type { RuntimeConfig } from "./types/config.types";

describe("toRedactedConfigView", () => {
  it("uses safe redaction by default and suppresses operational identifiers", () => {
    const config: RuntimeConfig = {
      profile: "prod",
      profilesFile: "/tmp/.bybit-profiles.json",
      apiKey: "real_api_key_value",
      apiSecret: "real_api_secret_value",
      category: "linear",
      sourceMode: "market",
      providerContext: buildBybitProviderContext({
        futuresGridBotIds: ["fgrid-id-1"],
        spotGridBotIds: ["spot-id-1", "spot-id-2"]
      }),
      format: "md",
      timeoutMs: 10_000,
      timeRange: {
        from: "2026-01-01T00:00:00.000Z",
        to: "2026-02-01T00:00:00.000Z"
      },
      pagination: {
        positionsMaxPages: 50,
        executionsMaxPagesPerChunk: 100,
        limitMode: "error"
      },
      ambientEnv: {
        enabled: true,
        source: "default",
        usedVars: []
      },
      sources: {
        profile: "cli",
        profilesFile: "cli",
        apiKey: "cli",
        apiSecret: "cli",
        category: "default",
        sourceMode: "default",
        providerContext: "default",
        format: "default",
        timeoutMs: "default",
        timeRange: "default",
        positionsMaxPages: "default",
        executionsMaxPagesPerChunk: "default",
        paginationLimitMode: "default"
      }
    };

    const view = toRedactedConfigView(config);

    expect(view.apiKey).toBe("<configured>");
    expect(view.apiSecret).toBe("<configured>");
    expect(view.providerContext).toContain("configured (1 id)");
    expect(view.providerContext).toContain("configured (2 ids)");
    expect(view.apiKey).not.toContain("real_api_key_value");
    expect(view.apiSecret).not.toContain("real_api_secret_value");
    expect(view.providerContext).not.toContain("fgrid-id-1");
    expect(view.providerContext).not.toContain("spot-id-1");
    expect(view.configReportMode).toBe("safe");
    expect(view.ambientEnv).toEqual({
      enabled: true,
      source: "default",
      usedVars: []
    });
  });

  it("shows expanded values only in explicit diagnostic mode", () => {
    const config: RuntimeConfig = {
      apiKey: "real_api_key_value",
      apiSecret: "real_api_secret_value",
      category: "linear",
      sourceMode: "market",
      providerContext: buildBybitProviderContext({
        futuresGridBotIds: ["fgrid-id-1"],
        spotGridBotIds: ["spot-id-1", "spot-id-2"]
      }),
      format: "md",
      timeoutMs: 10_000,
      timeRange: {
        from: "2026-01-01T00:00:00.000Z",
        to: "2026-02-01T00:00:00.000Z"
      },
      pagination: {
        limitMode: "error"
      },
      ambientEnv: {
        enabled: true,
        source: "default",
        usedVars: ["BYBIT_API_KEY", "BYBIT_API_SECRET"]
      },
      sources: {
        profile: "default",
        profilesFile: "default",
        apiKey: "env",
        apiSecret: "env",
        category: "default",
        sourceMode: "default",
        providerContext: "env",
        format: "default",
        timeoutMs: "default",
        timeRange: "default",
        positionsMaxPages: "default",
        executionsMaxPagesPerChunk: "default",
        paginationLimitMode: "default"
      }
    };

    const view = toRedactedConfigView(config, "diagnostic");

    expect(view.apiKey).toBe("<redacted>");
    expect(view.apiSecret).toBe("<redacted>");
    expect(view.providerContext).toContain("fgrid-id-1");
    expect(view.providerContext).toContain("spot-id-1,spot-id-2");
    expect(view.configReportMode).toBe("diagnostic");
    expect(view.ambientEnv.usedVars).toEqual(["BYBIT_API_KEY", "BYBIT_API_SECRET"]);
  });
});
