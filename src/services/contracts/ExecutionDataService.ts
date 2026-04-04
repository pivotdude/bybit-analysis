import type { PnLReport } from "../../types/domain.types";
import type { AccountSnapshot } from "../../types/domain.types";
import type { ServiceRequestContext } from "./AccountDataService";

export interface GetPnlReportRequest {
  context: ServiceRequestContext;
  equityStartUsd?: number;
  equityEndUsd?: number;
  accountSnapshot?: Pick<AccountSnapshot, "unrealizedPnlUsd">;
}

export interface ExecutionDataService {
  getPnlReport(request: GetPnlReportRequest): Promise<PnLReport>;
}
