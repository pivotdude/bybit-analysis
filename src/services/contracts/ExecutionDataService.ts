import type { PnLReport } from "../../types/domain.types";
import type { ServiceRequestContext } from "./AccountDataService";

export interface ExecutionDataService {
  getPnlReport(context: ServiceRequestContext, equityStartUsd?: number, equityEndUsd?: number): Promise<PnLReport>;
}
