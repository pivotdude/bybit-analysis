import { describe, expect, it } from "bun:test";
import { HealthReportGenerator } from "./HealthReportGenerator";
import type { AccountDataService, ServiceRequestContext } from "../services/contracts/AccountDataService";

const context: ServiceRequestContext = {
  category: "linear",
  sourceMode: "market",
  providerContext: {},
  from: "2026-01-01T00:00:00.000Z",
  to: "2026-01-02T00:00:00.000Z",
  timeoutMs: 5000
};

function createAccountService(overrides: Partial<Awaited<ReturnType<AccountDataService["checkHealth"]>>>): AccountDataService {
  return {
    async getAccountSnapshot() {
      throw new Error("not used");
    },
    async checkHealth() {
      return {
        connectivity: "ok",
        auth: "ok",
        latencyMs: 1,
        diagnostics: [],
        ...overrides
      };
    },
    async getApiKeyPermissionInfo() {
      throw new Error("not used");
    }
  };
}

describe("HealthReportGenerator", () => {
  it("marks healthStatus as ok when connectivity/auth are ok", async () => {
    const generator = new HealthReportGenerator(createAccountService({ connectivity: "ok", auth: "ok" }));
    const report = await generator.generate(context);

    expect(report.healthStatus).toBe("ok");
  });

  it("marks healthStatus as failed when any health check fails", async () => {
    const generator = new HealthReportGenerator(createAccountService({ connectivity: "failed", auth: "ok" }));
    const report = await generator.generate(context);

    expect(report.healthStatus).toBe("failed");
  });
});
