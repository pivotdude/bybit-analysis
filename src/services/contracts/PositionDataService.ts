import type { Position } from "../../types/domain.types";
import type { ServiceRequestContext } from "./AccountDataService";

export interface PositionDataService {
  getOpenPositions(context: ServiceRequestContext): Promise<Position[]>;
}
