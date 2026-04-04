import { describe, expect, it } from "bun:test";
import { PermissionsReportGenerator } from "./PermissionsReportGenerator";
import type { AccountDataService, ServiceRequestContext } from "../services/contracts/AccountDataService";

const context: ServiceRequestContext = {
  category: "linear",
  sourceMode: "market",
  providerContext: { bybit: { botStrategyIds: { futuresGridBotIds: [], spotGridBotIds: [] } } },
  from: "2026-01-01T00:00:00.000Z",
  to: "2026-02-01T00:00:00.000Z",
  timeoutMs: 5_000
};

describe("PermissionsReportGenerator", () => {
  it("prints only redacted API key and whitelist summary", async () => {
    const accountService: AccountDataService = {
      async getAccountSnapshot() {
        throw new Error("not used");
      },
      async checkHealth() {
        throw new Error("not used");
      },
      async getApiKeyPermissionInfo() {
        return {
          apiKeyStatus: "present",
          apiKeyDisplay: "<redacted>",
          note: "ops",
          readOnly: false,
          isMaster: true,
          ipWhitelistRestricted: true,
          ipWhitelistCount: 2,
          ipWhitelistDisplay: "configured (2 entries)",
          permissions: {
            Spot: ["SpotTrade"]
          }
        };
      }
    };

    const generator = new PermissionsReportGenerator(accountService);
    const report = await generator.generate(context);
    const keyMetaSection = report.sections.find((section) => section.title === "Key Meta");

    expect(keyMetaSection?.type).toBe("table");
    expect(keyMetaSection?.table?.rows).toEqual([
      ["apiKey", "<redacted>"],
      ["apiKeyStatus", "present"],
      ["note", "ops"],
      ["ipWhitelist", "configured (2 entries)"]
    ]);
  });
});
