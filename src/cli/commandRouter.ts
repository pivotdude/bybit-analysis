import type { AmbientEnvResolution } from "../types/config.types";
import { resolveRuntimeConfig, validateCredentials } from "../config";
import { MemoryCacheStore } from "../services/cache/MemoryCacheStore";
import { createServiceBundle } from "../services/composition/createServiceBundle";
import type { ParsedCliArgs } from "../types/command.types";
import { MarkdownRenderer } from "../renderers/MarkdownRenderer";
import { balanceHandler } from "./commandHandlers/balance.handler";
import { botsHandler } from "./commandHandlers/bots.handler";
import { configHandler } from "./commandHandlers/config.handler";
import { exposureHandler } from "./commandHandlers/exposure.handler";
import { healthHandler } from "./commandHandlers/health.handler";
import { performanceHandler } from "./commandHandlers/performance.handler";
import { permissionsHandler } from "./commandHandlers/permissions.handler";
import { pnlHandler } from "./commandHandlers/pnl.handler";
import { positionsHandler } from "./commandHandlers/positions.handler";
import { riskHandler } from "./commandHandlers/risk.handler";
import { summaryHandler } from "./commandHandlers/summary.handler";
import type { HandlerDeps } from "./commandHandlers/shared";

export class UsageError extends Error {}

function buildDeps(
  parsed: ParsedCliArgs,
  env: Record<string, string | undefined>,
  ambientEnv: AmbientEnvResolution
): HandlerDeps {
  const config = resolveRuntimeConfig(parsed.options, env, ambientEnv);
  const cache = new MemoryCacheStore();
  const {
    accountService,
    positionService,
    executionService,
    botService
  } = createServiceBundle(config, cache);

  return {
    config,
    renderer: new MarkdownRenderer(),
    accountService,
    positionService,
    executionService,
    botService
  };
}

export async function executeCommand(
  parsed: ParsedCliArgs,
  env: Record<string, string | undefined> = {},
  ambientEnv: AmbientEnvResolution = {
    enabled: true,
    source: "default",
    usedVars: []
  }
): Promise<string> {
  if (parsed.errors.length > 0) {
    throw new UsageError(parsed.errors.join("; "));
  }
  if (!parsed.command) {
    throw new UsageError("Command is required");
  }

  let deps: HandlerDeps;
  try {
    deps = buildDeps(parsed, env, ambientEnv);
  } catch (error) {
    throw new UsageError(error instanceof Error ? error.message : String(error));
  }

  if (parsed.command !== "config" && parsed.command !== "health") {
    if (
      deps.config.sourceMode === "bot" &&
      deps.config.futuresGridBotIds.length === 0 &&
      deps.config.spotGridBotIds.length === 0
    ) {
      throw new UsageError("For --source bot provide --fgrid-bot-ids and/or --spot-grid-ids");
    }

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
    case "permissions":
      return permissionsHandler(deps);
    case "config":
      return configHandler(deps);
    case "health":
      return healthHandler(deps);
    default:
      throw new UsageError(`Unsupported command: ${parsed.command}`);
  }
}
