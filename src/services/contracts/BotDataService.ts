import type { BotReport } from "../../types/domain.types";
import type { ServiceRequestContext } from "./AccountDataService";

export interface BotDataService {
  getBotReport(context: ServiceRequestContext): Promise<BotReport>;
}
