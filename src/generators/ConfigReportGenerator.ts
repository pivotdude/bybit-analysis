import { toRedactedConfigView } from "../config";
import type { RuntimeConfig } from "../types/config.types";
import type { ReportDocument } from "../types/report.types";
import { fmtIso } from "./formatters";

export class ConfigReportGenerator {
  generate(config: RuntimeConfig): ReportDocument {
    const view = toRedactedConfigView(config);

    return {
      command: "config",
      title: "Runtime Configuration",
      generatedAt: new Date().toISOString(),
      sections: [
        {
          title: "Effective Configuration",
          type: "table",
          table: {
            headers: ["Key", "Value"],
            rows: [
              ["profile", view.profile ?? "<none>"],
              ["profilesFile", view.profilesFile ?? "<none>"],
              ["configReportMode", view.configReportMode],
              ["category", view.category],
              ["sourceMode", view.sourceMode],
              ["futuresGridBotIds", view.futuresGridBotIds],
              ["spotGridBotIds", view.spotGridBotIds],
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
        },
        {
          title: "Source Priority",
          type: "table",
          table: {
            headers: ["Setting", "Resolved From"],
            rows: Object.entries(view.sources).map(([setting, source]) => [setting, source])
          }
        },
        {
          title: "Redacted Secrets",
          type: "text",
          text: [
            "Secrets are masked by default and never printed in plaintext.",
            "Safe mode suppresses credential-adjacent and operational identifiers.",
            "Use --config-diagnostics or BYBIT_CONFIG_DIAGNOSTICS=1 for expanded diagnostics."
          ]
        }
      ]
    };
  }
}
