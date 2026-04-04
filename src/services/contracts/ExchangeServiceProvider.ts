import type { RuntimeConfig } from "../../types/config.types";
import type { ExchangeId } from "../../types/domain.types";
import type { CacheStore } from "../cache/CacheStore";
import type { AccountDataService } from "./AccountDataService";
import type { BotDataService } from "./BotDataService";
import type { ExecutionDataService } from "./ExecutionDataService";
import type { PositionDataService } from "./PositionDataService";

export interface ServiceBundle {
  accountService: AccountDataService;
  positionService: PositionDataService;
  executionService: ExecutionDataService;
  botService: BotDataService;
}

export interface ExchangeServiceProviderFactory {
  id: ExchangeId;
  create(config: RuntimeConfig, cache: CacheStore): ServiceBundle;
}
