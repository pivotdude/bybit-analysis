import type { ReportSourceMetadata } from "../types/report.types";

export function createSourceMetadata(source: ReportSourceMetadata): ReportSourceMetadata {
  return {
    ...source,
    cacheStatus: source.cacheStatus ?? "unknown"
  };
}
