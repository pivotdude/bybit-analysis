import { describe, expect, it } from "bun:test";
import { toRedactedConfigView } from "./config";
import type { RuntimeConfig } from "./types/config.types";

describe("toRedactedConfigView", () => {
  it("does not expose api key or api secret values", () => {
    const config: RuntimeConfig = {
      profile: "prod",
      profilesFile: "/tmp/.bybit-profiles.json",
      apiKey: "real_api_key_value",
      apiSecret: "real_api_secret_value",
      category: "linear",
      futuresGridBotIds: [],
      spotGridBotIds: [],
      format: "md",
      lang: "en",
      timeoutMs: 10_000,
      timeRange: {
        from: "2026-01-01T00:00:00.000Z",
        to: "2026-02-01T00:00:00.000Z"
      },
      sources: {
        profile: "cli",
        profilesFile: "cli",
        apiKey: "cli",
        apiSecret: "cli",
        category: "default",
        futuresGridBotIds: "default",
        spotGridBotIds: "default",
        format: "default",
        lang: "default",
        timeoutMs: "default",
        timeRange: "default"
      }
    };

    const view = toRedactedConfigView(config);

    expect(view.apiKey).toBe("<redacted>");
    expect(view.apiSecret).toBe("<redacted>");
    expect(view.apiKey).not.toContain("real_api_key_value");
    expect(view.apiSecret).not.toContain("real_api_secret_value");
  });
});
