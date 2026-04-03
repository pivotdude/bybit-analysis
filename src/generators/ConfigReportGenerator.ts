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
              ["category", view.category],
              ["futuresGridBotIds", view.futuresGridBotIds.join(",") || "<none>"],
              ["spotGridBotIds", view.spotGridBotIds.join(",") || "<none>"],
              ["format", view.format],
              ["lang", view.lang],
              ["timeoutMs", String(view.timeoutMs)],
              ["from", fmtIso(view.timeRange.from)],
              ["to", fmtIso(view.timeRange.to)],
              ["apiKey", view.apiKey],
              ["apiSecret", view.apiSecret]
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
          text: ["Secrets are masked by default and never printed in plaintext."]
        }
      ]
    };
  }
}
