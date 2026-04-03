import type { AccountDataService, ServiceRequestContext } from "../services/contracts/AccountDataService";
import type { ReportDocument } from "../types/report.types";
import { fmtIso } from "./formatters";

export class HealthReportGenerator {
  constructor(private readonly accountService: AccountDataService) {}

  async generate(context: ServiceRequestContext): Promise<ReportDocument> {
    const health = await this.accountService.checkHealth(context);

    return {
      command: "health",
      title: "Health Status",
      generatedAt: new Date().toISOString(),
      sections: [
        {
          title: "Health Status",
          type: "kpi",
          kpis: [
            { label: "Connectivity", value: health.connectivity },
            { label: "Auth", value: health.auth },
            { label: "Latency", value: `${health.latencyMs} ms` },
            { label: "Time Drift", value: `${health.timeDriftMs ?? 0} ms` }
          ]
        },
        {
          title: "Checks",
          type: "table",
          table: {
            headers: ["Check", "Status"],
            rows: [
              ["connectivity", health.connectivity],
              ["auth", health.auth],
              ["server_time", health.serverTime ? "ok" : "missing"]
            ]
          }
        },
        {
          title: "Diagnostics",
          type: "text",
          text: [
            `serverTime: ${health.serverTime ? fmtIso(health.serverTime) : "N/A"}`,
            ...health.diagnostics
          ]
        }
      ]
    };
  }
}
