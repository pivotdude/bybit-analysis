import { BybitAccountService } from "./BybitAccountService";
import { BybitBotService } from "./BybitBotService";
import { createBybitClient } from "./BybitClientFactory";
import { BybitExecutionService } from "./BybitExecutionService";
import { BybitPositionService } from "./BybitPositionService";
import type { ExchangeServiceProviderFactory } from "../contracts/ExchangeServiceProvider";

export const bybitServiceProviderFactory: ExchangeServiceProviderFactory = {
  id: "bybit",
  create(config, cache) {
    const client = createBybitClient(config);
    const botService = new BybitBotService(client, cache);
    const positionService = new BybitPositionService(client, botService, cache, {
      maxPages: config.pagination.positionsMaxPages,
      limitMode: config.pagination.limitMode
    });
    const accountService = new BybitAccountService(client, positionService, botService, cache);
    const executionService = new BybitExecutionService(client, botService, cache, {
      maxPagesPerChunk: config.pagination.executionsMaxPagesPerChunk,
      limitMode: config.pagination.limitMode
    });

    return {
      accountService,
      positionService,
      executionService,
      botService
    };
  }
};
