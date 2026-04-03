import { resolveRuntimeConfig, validateCredentials } from "../config";
import { MemoryCacheStore } from "../services/cache/MemoryCacheStore";
import { BybitAccountService } from "../services/bybit/BybitAccountService";
import { BybitBotService } from "../services/bybit/BybitBotService";
import { createBybitClient } from "../services/bybit/BybitClientFactory";
import { BybitExecutionService } from "../services/bybit/BybitExecutionService";
import { BybitPositionService } from "../services/bybit/BybitPositionService";
import type { ParsedCliArgs } from "../types/command.types";
import { MarkdownRenderer } from "../renderers/MarkdownRenderer";
import { balanceHandler } from "./commandHandlers/balance.handler";
import { botsHandler } from "./commandHandlers/bots.handler";
import { configHandler } from "./commandHandlers/config.handler";
import { exposureHandler } from "./commandHandlers/exposure.handler";
import { healthHandler } from "./commandHandlers/health.handler";
import { performanceHandler } from "./commandHandlers/performance.handler";
import { pnlHandler } from "./commandHandlers/pnl.handler";
import { positionsHandler } from "./commandHandlers/positions.handler";
import { riskHandler } from "./commandHandlers/risk.handler";
import { summaryHandler } from "./commandHandlers/summary.handler";
import type { HandlerDeps } from "./commandHandlers/shared";

export class UsageError extends Error {}

function buildDeps(parsed: ParsedCliArgs): HandlerDeps {
  const config = resolveRuntimeConfig(parsed.options);
  const cache = new MemoryCacheStore();
  const client = createBybitClient(config);
  const positionService = new BybitPositionService(client, cache);
  const accountService = new BybitAccountService(client, positionService, cache);
  const executionService = new BybitExecutionService(client, cache);
  const botService = new BybitBotService();

  return {
    config,
    renderer: new MarkdownRenderer(),
    accountService,
    positionService,
    executionService,
    botService
  };
}

export async function executeCommand(parsed: ParsedCliArgs): Promise<string> {
  if (parsed.errors.length > 0) {
    throw new UsageError(parsed.errors.join("; "));
  }
  if (!parsed.command) {
    throw new UsageError("Command is required");
  }

  let deps: HandlerDeps;
  try {
    deps = buildDeps(parsed);
  } catch (error) {
    throw new UsageError(error instanceof Error ? error.message : String(error));
  }

  if (parsed.command !== "config" && parsed.command !== "health") {
    try {
      validateCredentials(deps.config);
    } catch (error) {
      throw new UsageError(error instanceof Error ? error.message : String(error));
    }
  }

  switch (parsed.command) {
    case "summary":
      return summaryHandler(deps);
    case "balance":
      return balanceHandler(deps);
    case "pnl":
      return pnlHandler(deps);
    case "positions":
      return positionsHandler(deps);
    case "exposure":
      return exposureHandler(deps);
    case "performance":
      return performanceHandler(deps);
    case "risk":
      return riskHandler(deps);
    case "bots":
      return botsHandler(deps);
    case "config":
      return configHandler(deps);
    case "health":
      return healthHandler(deps);
    default:
      throw new UsageError(`Unsupported command: ${parsed.command}`);
  }
}
