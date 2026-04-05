import type { AmbientEnvResolution } from "../types/config.types";
import { resolveRuntimeConfig, validateCredentials } from "../config";
import { MemoryCacheStore } from "../services/cache/MemoryCacheStore";
import { createServiceBundle } from "../services/composition/createServiceBundle";
import type { ParsedCliArgs } from "../types/command.types";
import type { ReportDocument } from "../types/report.types";
import { DefaultReportRenderer } from "../renderers/DefaultReportRenderer";
import { classifyReportExitCode } from "./exitCodes";
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
import { toServiceContext, type HandlerDeps } from "./commandHandlers/shared";

export class UsageError extends Error {}
export interface CommandExecutionResult {
  output: string;
  exitCode: number;
}

const LIVE_SNAPSHOT_COMMANDS = new Set(["balance", "positions", "exposure", "risk", "health", "permissions"]);

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
    botService,
    capabilities,
    validateRequestContext
  } = createServiceBundle(config, cache);

  return {
    config,
    renderer: new DefaultReportRenderer(),
    accountService,
    positionService,
    executionService,
    botService,
    capabilities,
    validateRequestContext
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
  const { report, deps } = await generateReport(parsed, env, ambientEnv);
  return deps.renderer.render(report, deps.config.format);
}

export async function executeCommandWithOutcome(
  parsed: ParsedCliArgs,
  env: Record<string, string | undefined> = {},
  ambientEnv: AmbientEnvResolution = {
    enabled: true,
    source: "default",
    usedVars: []
  }
): Promise<CommandExecutionResult> {
  const { report, deps } = await generateReport(parsed, env, ambientEnv);
  return {
    output: deps.renderer.render(report, deps.config.format),
    exitCode: classifyReportExitCode(report)
  };
}

async function generateReport(
  parsed: ParsedCliArgs,
  env: Record<string, string | undefined>,
  ambientEnv: AmbientEnvResolution
): Promise<{ report: ReportDocument; deps: HandlerDeps }> {
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

  if (LIVE_SNAPSHOT_COMMANDS.has(parsed.command) && deps.config.sources.timeRange !== "default") {
    throw new UsageError(
      `Command ${parsed.command} is a live snapshot command and does not accept historical time flags or BYBIT_WINDOW.`
    );
  }

  if (parsed.command !== "config" && parsed.command !== "health") {
    const serviceContext = toServiceContext(deps.config);

    if (!deps.capabilities.supportedMarketCategories.includes(deps.config.category)) {
      throw new UsageError(
        `Selected exchange provider does not support category ${deps.config.category}. Supported categories: ${deps.capabilities.supportedMarketCategories.join(", ")}`
      );
    }

    if (!deps.capabilities.supportedSourceModes.includes(deps.config.sourceMode)) {
      throw new UsageError(
        `Selected exchange provider does not support source mode ${deps.config.sourceMode}. Supported modes: ${deps.capabilities.supportedSourceModes.join(", ")}`
      );
    }

    if (deps.config.sourceMode === "bot" && !deps.capabilities.botData) {
      throw new UsageError("Selected exchange provider does not support bot analytics");
    }

    if (deps.validateRequestContext) {
      try {
        deps.validateRequestContext(serviceContext);
      } catch (error) {
        throw new UsageError(error instanceof Error ? error.message : String(error));
      }
    }

    try {
      validateCredentials(deps.config);
    } catch (error) {
      throw new UsageError(error instanceof Error ? error.message : String(error));
    }
  }

  let report: ReportDocument;
  switch (parsed.command) {
    case "summary":
      report = await summaryHandler(deps);
      break;
    case "balance":
      report = await balanceHandler(deps);
      break;
    case "pnl":
      report = await pnlHandler(deps);
      break;
    case "positions":
      report = await positionsHandler(deps);
      break;
    case "exposure":
      report = await exposureHandler(deps);
      break;
    case "performance":
      report = await performanceHandler(deps);
      break;
    case "risk":
      report = await riskHandler(deps);
      break;
    case "bots":
      report = await botsHandler(deps);
      break;
    case "permissions":
      report = await permissionsHandler(deps);
      break;
    case "config":
      report = await configHandler(deps);
      break;
    case "health":
      report = await healthHandler(deps);
      break;
    default:
      throw new UsageError(`Unsupported command: ${parsed.command}`);
  }

  return { report, deps };
}
