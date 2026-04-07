import type {
  DataCompleteness,
  DataSource,
  ExchangeId,
  IntegrationMode,
  MarketCategory,
  SourceCacheStatus
} from "./domain.types";

export type ReportSectionType = "kpi" | "table" | "alerts" | "text";

export interface MarkdownKpi {
  label: string;
  value: string;
}

export interface MarkdownTable {
  headers: string[];
  rows: string[][];
  emptyMessage?: string;
  emptyMode?: "with_headers" | "message_only";
}

export interface MarkdownAlert {
  severity: "info" | "warning" | "critical";
  message: string;
}

interface ReportSectionBase<TType extends ReportSectionType> {
  id: string;
  title: string;
  type: TType;
}

export type ReportTextSection = ReportSectionBase<"text"> & {
  text: string[];
};

export type ReportKpiSection = ReportSectionBase<"kpi"> & {
  kpis: MarkdownKpi[];
};

export type ReportTableSection = ReportSectionBase<"table"> & {
  table: MarkdownTable;
};

export type ReportAlertsSection = ReportSectionBase<"alerts"> & {
  alerts: MarkdownAlert[];
};

export type ReportSection = ReportTextSection | ReportKpiSection | ReportTableSection | ReportAlertsSection;

export type ReportSourceKind =
  | "wallet_snapshot"
  | "positions_snapshot"
  | "period_pnl_snapshot"
  | "bot_report"
  | "health_check"
  | "api_key_permissions"
  | "runtime_config";

export type ReportSourceCacheStatus = SourceCacheStatus;

export interface ReportSourceMetadata {
  id: string;
  kind: ReportSourceKind;
  provider: DataSource | string;
  exchange?: ExchangeId;
  category?: MarketCategory;
  sourceMode?: IntegrationMode;
  fetchedAt: string;
  capturedAt?: string;
  exchangeServerTime?: string;
  periodFrom?: string;
  periodTo?: string;
  cacheStatus?: ReportSourceCacheStatus;
}

export interface ReportDocument {
  command: string;
  title: string;
  generatedAt: string;
  asOf?: string;
  schemaVersion: string;
  sections: ReportSection[];
  dataCompleteness?: DataCompleteness;
  healthStatus?: "ok" | "failed";
  sources?: ReportSourceMetadata[];
  data?: unknown;
}
