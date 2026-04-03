import type { AccountDataService, ServiceRequestContext } from "../services/contracts/AccountDataService";
import type { ReportDocument } from "../types/report.types";

function hasPermission(permissions: Record<string, string[]>, scope: string, value: string): boolean {
  const values = permissions[scope] ?? [];
  return values.includes(value);
}

export class PermissionsReportGenerator {
  constructor(private readonly accountService: AccountDataService) {}

  async generate(context: ServiceRequestContext): Promise<ReportDocument> {
    const info = await this.accountService.getApiKeyPermissionInfo(context);
    const permissionRows = Object.entries(info.permissions)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([scope, values]) => [scope, values.join(", ") || "<none>"]);

    const hasSpotTrade = hasPermission(info.permissions, "Spot", "SpotTrade");
    const hasContractOrder = hasPermission(info.permissions, "ContractTrade", "Order");
    const hasContractPosition = hasPermission(info.permissions, "ContractTrade", "Position");
    const hasTradePermissions = hasSpotTrade || hasContractOrder || hasContractPosition;
    const botReadiness = (() => {
      if (!hasTradePermissions) {
        return "unlikely";
      }
      if (info.readOnly) {
        return "unlikely";
      }
      if (info.isMaster === false) {
        return "partial";
      }
      return "likely";
    })();

    const notes: string[] = [
      "botReadiness is heuristic: Bybit may still reject specific endpoints by account mode, UID scope, or compliance restrictions."
    ];
    if (info.readOnly) {
      notes.push("Key is read-only. Bot detail endpoints may require broader trade permissions.");
    }
    if (info.isMaster === false) {
      notes.push("Key belongs to sub UID. If bots are on a different UID (often master), requests can fail with 10005.");
    }
    if (!hasTradePermissions) {
      notes.push("No SpotTrade/ContractTrade permissions detected. This usually causes error 10005 on bot endpoints.");
    }

    return {
      command: "permissions",
      title: "API Key Permissions",
      generatedAt: new Date().toISOString(),
      sections: [
        {
          title: "Summary",
          type: "kpi",
          kpis: [
            { label: "Read Only", value: info.readOnly ? "yes" : "no" },
            { label: "Is Master UID", value: info.isMaster === undefined ? "unknown" : info.isMaster ? "yes" : "no" },
            { label: "Permission Scopes", value: String(Object.keys(info.permissions).length) },
            { label: "Bot Readiness", value: botReadiness }
          ]
        },
        {
          title: "Key Meta",
          type: "table",
          table: {
            headers: ["Field", "Value"],
            rows: [
              ["apiKey", info.apiKey ?? "<hidden>"],
              ["note", info.note ?? "<none>"],
              ["ipWhitelist", info.ips.join(", ") || "<none>"]
            ]
          }
        },
        {
          title: "Permissions",
          type: "table",
          table: {
            headers: ["Scope", "Values"],
            rows: permissionRows.length > 0 ? permissionRows : [["<none>", "<none>"]]
          }
        },
        {
          title: "Notes",
          type: "text",
          text: notes
        }
      ]
    };
  }
}
