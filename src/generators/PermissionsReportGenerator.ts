import type { AccountDataService, ServiceRequestContext } from "../services/contracts/AccountDataService";
import { unsupportedDataCompleteness } from "../services/reliability/dataCompleteness";
import type { ReportDocument } from "../types/report.types";
import type { ReportSectionType } from "../types/report.types";
import { buildUnsupportedDataCompletenessAlerts, createSectionBuilder } from "./reportContract";
import { createSourceMetadata } from "./sourceMetadata";

export const PERMISSIONS_SCHEMA_VERSION = "permissions-markdown-v1";

export const PERMISSIONS_SECTION_CONTRACT = {
  summary: { id: "permissions.summary", title: "Summary", type: "kpi" },
  keyMeta: { id: "permissions.key_meta", title: "Key Meta", type: "table" },
  permissions: { id: "permissions.permissions", title: "Permissions", type: "table" },
  notes: { id: "permissions.notes", title: "Notes", type: "text" },
  dataCompleteness: { id: "permissions.data_completeness", title: "Data Completeness", type: "alerts" }
} as const satisfies Record<string, { id: string; title: string; type: ReportSectionType }>;

export const PERMISSIONS_SECTION_ORDER = [
  "summary",
  "keyMeta",
  "permissions",
  "notes",
  "dataCompleteness"
] as const satisfies readonly (keyof typeof PERMISSIONS_SECTION_CONTRACT)[];

const section = createSectionBuilder(PERMISSIONS_SECTION_CONTRACT);

function hasPermission(permissions: Record<string, string[]>, scope: string, value: string): boolean {
  const values = permissions[scope] ?? [];
  return values.includes(value);
}

export class PermissionsReportGenerator {
  constructor(private readonly accountService: AccountDataService) {}

  async generate(context: ServiceRequestContext): Promise<ReportDocument> {
    const info = await this.accountService.getApiKeyPermissionInfo(context);
    const generatedAt = new Date().toISOString();
    const dataCompleteness = unsupportedDataCompleteness(
      "Data completeness is not tracked for API permission metadata reports."
    );
    const permissionRows = Object.entries(info.permissions)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([scope, values]) => [scope, [...values].sort((left, right) => left.localeCompare(right)).join(", ") || "<none>"]);

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
      schemaVersion: PERMISSIONS_SCHEMA_VERSION,
      generatedAt,
      asOf: generatedAt,
      dataCompleteness,
      sources: [
        createSourceMetadata({
          id: "api_key_permissions",
          kind: "api_key_permissions",
          provider: "bybit",
          category: context.category,
          sourceMode: context.sourceMode,
          fetchedAt: generatedAt
        })
      ],
      data: {
        info,
        botReadiness,
        hasTradePermissions
      },
      sections: [
        section("summary", {
          kpis: [
            { label: "Read Only", value: info.readOnly ? "yes" : "no" },
            { label: "Is Master UID", value: info.isMaster === undefined ? "unknown" : info.isMaster ? "yes" : "no" },
            { label: "Permission Scopes", value: String(Object.keys(info.permissions).length) },
            { label: "IP Whitelist", value: info.ipWhitelistRestricted ? `yes (${info.ipWhitelistCount})` : "no" },
            { label: "Bot Readiness", value: botReadiness }
          ]
        }),
        section("keyMeta", {
          table: {
            headers: ["Field", "Value"],
            rows: [
              ["apiKey", info.apiKeyDisplay],
              ["apiKeyStatus", info.apiKeyStatus],
              ["note", info.note ?? "<none>"],
              ["ipWhitelist", info.ipWhitelistDisplay]
            ]
          }
        }),
        section("permissions", {
          table: {
            headers: ["Scope", "Values"],
            rows: permissionRows.length > 0 ? permissionRows : [["<none>", "<none>"]]
          }
        }),
        section("notes", {
          text: notes
        }),
        section("dataCompleteness", {
          alerts: buildUnsupportedDataCompletenessAlerts(dataCompleteness.warnings[0]!)
        })
      ]
    };
  }
}
