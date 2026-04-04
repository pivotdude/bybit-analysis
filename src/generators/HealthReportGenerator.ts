import type { AccountDataService, ServiceRequestContext } from "../services/contracts/AccountDataService";
import type { ReportDocument } from "../types/report.types";
import type { ReportSectionType } from "../types/report.types";
import { fmtIso } from "./formatters";
import { buildUnsupportedDataCompletenessAlerts, createSectionBuilder } from "./reportContract";

export const HEALTH_SCHEMA_VERSION = "health-markdown-v1";

export const HEALTH_SECTION_CONTRACT = {
  status: { id: "health.status", title: "Health Status", type: "kpi" },
  checks: { id: "health.checks", title: "Checks", type: "table" },
  diagnostics: { id: "health.diagnostics", title: "Diagnostics", type: "text" },
  dataCompleteness: { id: "health.data_completeness", title: "Data Completeness", type: "alerts" }
} as const satisfies Record<string, { id: string; title: string; type: ReportSectionType }>;

export const HEALTH_SECTION_ORDER = [
  "status",
  "checks",
  "diagnostics",
  "dataCompleteness"
] as const satisfies readonly (keyof typeof HEALTH_SECTION_CONTRACT)[];

const section = createSectionBuilder(HEALTH_SECTION_CONTRACT);

export class HealthReportGenerator {
  constructor(private readonly accountService: AccountDataService) {}

  async generate(context: ServiceRequestContext): Promise<ReportDocument> {
    const health = await this.accountService.checkHealth(context);

    return {
      command: "health",
      title: "Health Status",
      schemaVersion: HEALTH_SCHEMA_VERSION,
      generatedAt: new Date().toISOString(),
      sections: [
        section("status", {
          kpis: [
            { label: "Connectivity", value: health.connectivity },
            { label: "Auth", value: health.auth },
            { label: "Latency", value: `${health.latencyMs} ms` },
            { label: "Time Drift", value: `${health.timeDriftMs ?? 0} ms` }
          ]
        }),
        section("checks", {
          table: {
            headers: ["Check", "Status"],
            rows: [
              ["connectivity", health.connectivity],
              ["auth", health.auth],
              ["server_time", health.serverTime ? "ok" : "missing"]
            ]
          }
        }),
        section("diagnostics", {
          text: [
            `serverTime: ${health.serverTime ? fmtIso(health.serverTime) : "N/A"}`,
            ...health.diagnostics
          ]
        }),
        section("dataCompleteness", {
          alerts: buildUnsupportedDataCompletenessAlerts(
            "Data completeness is not tracked for health check reports."
          )
        })
      ]
    };
  }
}
