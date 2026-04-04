import type { DataCompleteness, Position } from "../../types/domain.types";
import type { ServiceRequestContext } from "./AccountDataService";

export interface PositionDataResult {
  positions: Position[];
  dataCompleteness: DataCompleteness;
}

export interface PositionDataService {
  getOpenPositions(context: ServiceRequestContext): Promise<PositionDataResult>;
}
