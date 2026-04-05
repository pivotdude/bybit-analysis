import type {
  HistoricalBoundaryState,
  PnLReport,
  RoiUnsupportedReasonCode
} from "../../types/domain.types";
import type { ServiceRequestContext } from "./AccountDataService";

export interface GetPnlReportRequest {
  context: ServiceRequestContext;
  equityStartUsd?: number;
  endingState?: HistoricalBoundaryState;
  roiMissingStartReason?: string;
  roiMissingStartReasonCode?: RoiUnsupportedReasonCode;
}

export interface ExecutionDataService {
  getPnlReport(request: GetPnlReportRequest): Promise<PnLReport>;
}
