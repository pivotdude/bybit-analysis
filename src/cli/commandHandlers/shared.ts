import type { RuntimeConfig } from "../../types/config.types";
import type { ServiceRequestContext } from "../../services/contracts/AccountDataService";
import type { AccountDataService } from "../../services/contracts/AccountDataService";
import type { PositionDataService } from "../../services/contracts/PositionDataService";
import type { ExecutionDataService } from "../../services/contracts/ExecutionDataService";
import type { BotDataService } from "../../services/contracts/BotDataService";
import type { ReportRenderer } from "../../renderers/ReportRenderer";

export interface HandlerDeps {
  config: RuntimeConfig;
  renderer: ReportRenderer;
  accountService: AccountDataService;
  positionService: PositionDataService;
  executionService: ExecutionDataService;
  botService: BotDataService;
}

export function toServiceContext(config: RuntimeConfig): ServiceRequestContext {
  return {
    category: config.category,
    from: config.timeRange.from,
    to: config.timeRange.to,
    timeoutMs: config.timeoutMs
  };
}
