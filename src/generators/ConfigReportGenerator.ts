import { toRedactedConfigView } from "../config";
import type { RuntimeConfig } from "../types/config.types";
import type { ReportDocument } from "../types/report.types";
import type { ReportSectionType } from "../types/report.types";
import { unsupportedDataCompleteness } from "../services/reliability/dataCompleteness";
import { fmtIso } from "./formatters";
import { buildUnsupportedDataCompletenessAlerts, createSectionBuilder } from "./reportContract";
import { createSourceMetadata } from "./sourceMetadata";

export const CONFIG_SCHEMA_VERSION = "config-markdown-v1";

export const CONFIG_SECTION_CONTRACT = {
  effective: { id: "config.effective_configuration", title: "Effective Configuration", type: "table" },
  priority: { id: "config.source_priority", title: "Source Priority", type: "table" },
  redacted: { id: "config.redacted_secrets", title: "Redacted Secrets", type: "text" },
  dataCompleteness: { id: "config.data_completeness", title: "Data Completeness", type: "alerts" }
} as const satisfies Record<string, { id: string; title: string; type: ReportSectionType }>;

export const CONFIG_SECTION_ORDER = [
  "effective",
  "priority",
  "redacted",
  "dataCompleteness"
] as const satisfies readonly (keyof typeof CONFIG_SECTION_CONTRACT)[];

const section = createSectionBuilder(CONFIG_SECTION_CONTRACT);

export class ConfigReportGenerator {
  generate(config: RuntimeConfig): ReportDocument {
    const view = toRedactedConfigView(config);
    const generatedAt = new Date().toISOString();
    const dataCompleteness = unsupportedDataCompleteness(
      "Data completeness is not tracked for static runtime configuration reports."
    );

    return {
      command: "config",
      title: "Runtime Configuration",
      schemaVersion: CONFIG_SCHEMA_VERSION,
      generatedAt,
      dataCompleteness,
      sources: [
        createSourceMetadata({
          id: "runtime_config",
          kind: "runtime_config",
          provider: "bybit",
          category: view.category,
          sourceMode: view.sourceMode,
          fetchedAt: generatedAt
        })
      ],
      data: {
        config: view
      },
      sections: [
        section("effective", {
          table: {
            headers: ["Key", "Value"],
            rows: [
              ["profile", view.profile ?? "<none>"],
              ["profilesFile", view.profilesFile ?? "<none>"],
              ["configReportMode", view.configReportMode],
              ["category", view.category],
              ["sourceMode", view.sourceMode],
              ["providerContext", view.providerContext],
              ["format", view.format],
              ["timeoutMs", String(view.timeoutMs)],
              ["pagination.positionsMaxPages", String(view.pagination.positionsMaxPages ?? "<none>")],
              [
                "pagination.executionsMaxPagesPerChunk",
                String(view.pagination.executionsMaxPagesPerChunk ?? "<none>")
              ],
              ["pagination.limitMode", view.pagination.limitMode],
              ["from", fmtIso(view.timeRange.from)],
              ["to", fmtIso(view.timeRange.to)],
              ["apiKey", view.apiKey],
              ["apiSecret", view.apiSecret],
              ["ambientEnv.enabled", String(view.ambientEnv.enabled)],
              ["ambientEnv.source", view.ambientEnv.source],
              ["ambientEnv.usedVars", view.ambientEnv.usedVars.join(",") || "<none>"]
            ]
          }
        }),
        section("priority", {
          table: {
            headers: ["Setting", "Resolved From"],
            rows: Object.entries(view.sources).map(([setting, source]) => [setting, source])
          }
        }),
        section("redacted", {
          text: [
            "Secrets are masked by default and never printed in plaintext.",
            "Safe mode suppresses credential-adjacent and operational identifiers.",
            "Use --config-diagnostics or BYBIT_CONFIG_DIAGNOSTICS=1 for expanded diagnostics."
          ]
        }),
        section("dataCompleteness", {
          alerts: buildUnsupportedDataCompletenessAlerts(dataCompleteness.warnings[0]!)
        })
      ]
    };
  }
}
