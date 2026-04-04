import type { BotReport } from "../../types/domain.types";
import type { ServiceRequestContext } from "./AccountDataService";

export type BotReportRequirement = "required" | "optional";

export interface BotReportRequestOptions {
  requirement?: BotReportRequirement;
}

export class RequiredBotDataUnavailableError extends Error {
  readonly code = "required_input_failed";

  constructor(message: string) {
    super(message);
    this.name = "RequiredBotDataUnavailableError";
  }
}

export interface BotDataService {
  getBotReport(context: ServiceRequestContext, options?: BotReportRequestOptions): Promise<BotReport>;
}
