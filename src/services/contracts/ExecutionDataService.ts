import type { PnLReport, RoiUnsupportedReasonCode } from "../../types/domain.types";
import type { AccountSnapshot } from "../../types/domain.types";
import type { ServiceRequestContext } from "./AccountDataService";

export interface GetPnlReportRequest {
  context: ServiceRequestContext;
  equityStartUsd?: number;
  equityEndUsd?: number;
  roiMissingStartReason?: string;
  roiMissingStartReasonCode?: RoiUnsupportedReasonCode;
  accountSnapshot?: Pick<AccountSnapshot, "unrealizedPnlUsd">;
}

export interface ExecutionDataService {
  getPnlReport(request: GetPnlReportRequest): Promise<PnLReport>;
}
