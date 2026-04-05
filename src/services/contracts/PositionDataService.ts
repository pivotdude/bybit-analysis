import type { DataCompleteness, DataSource, ExchangeId, Position, SourceCacheStatus } from "../../types/domain.types";
import type { ServiceRequestContext } from "./AccountDataService";

export interface PositionDataResult {
  source: DataSource;
  exchange: ExchangeId;
  capturedAt: string;
  positions: Position[];
  dataCompleteness: DataCompleteness;
  cacheStatus?: SourceCacheStatus;
}

export interface PositionDataService {
  getOpenPositions(context: ServiceRequestContext): Promise<PositionDataResult>;
}
