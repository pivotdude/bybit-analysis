import type { DataCompleteness, DataSource, ExchangeId, Position } from "../../types/domain.types";
import type { ServiceRequestContext } from "./AccountDataService";

export interface PositionDataResult {
  source: DataSource;
  exchange: ExchangeId;
  capturedAt: string;
  positions: Position[];
  dataCompleteness: DataCompleteness;
}

export interface PositionDataService {
  getOpenPositions(context: ServiceRequestContext): Promise<PositionDataResult>;
}
