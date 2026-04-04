import type { RuntimeConfig } from "../../types/config.types";
import type { ExchangeId, IntegrationMode, MarketCategory } from "../../types/domain.types";
import type { CacheStore } from "../cache/CacheStore";
import type { AccountDataService } from "./AccountDataService";
import type { ServiceRequestContext } from "./AccountDataService";
import type { BotDataService } from "./BotDataService";
import type { ExecutionDataService } from "./ExecutionDataService";
import type { PositionDataService } from "./PositionDataService";

export interface ExchangeProviderCapabilities {
  supportedMarketCategories: readonly MarketCategory[];
  supportedSourceModes: readonly IntegrationMode[];
  botData: boolean;
}

export interface ServiceBundle {
  accountService: AccountDataService;
  positionService: PositionDataService;
  executionService: ExecutionDataService;
  botService?: BotDataService;
  capabilities: ExchangeProviderCapabilities;
  validateRequestContext?: (context: ServiceRequestContext) => void;
}

export interface ExchangeServiceProviderFactory {
  id: ExchangeId;
  create(config: RuntimeConfig, cache: CacheStore): ServiceBundle;
}
