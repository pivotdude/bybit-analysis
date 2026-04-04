import type { CommandName, ParsedCliArgs, ParsedCliOptions } from "../types/command.types";
import { ENV_VARS } from "../configEnv";

const COMMANDS: CommandName[] = [
  "summary",
  "balance",
  "pnl",
  "positions",
  "exposure",
  "performance",
  "risk",
  "bots",
  "permissions",
  "config",
  "health"
];
const COMMAND_DESCRIPTIONS: Record<CommandName, string> = {
  summary: "Full account analytics snapshot",
  balance: "Wallet/equity/margin balances",
  pnl: "Realized/unrealized PnL analysis",
  positions: "Open position inventory and status",
  exposure: "Exposure and concentration analysis",
  performance: "ROI and capital efficiency analysis",
  risk: "Leverage and downside risk analysis",
  bots: "Optional bot/copy-trading analytics",
  permissions: "API key permissions diagnostics",
  config: "Effective runtime config (redacted)",
  health: "API/connectivity/readiness checks"
};
function isTruthyEnvValue(value: string | undefined): boolean {
  if (!value) {
    return false;
  }

  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

function isCommand(value: string): value is CommandName {
  return COMMANDS.includes(value as CommandName);
}

function parseIdList(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function splitLongOptionToken(token: string): { name: string; inlineValue: string | undefined } {
  const separatorIndex = token.indexOf("=");
  if (separatorIndex < 0) {
    return { name: token, inlineValue: undefined };
  }

  return {
    name: token.slice(0, separatorIndex),
    inlineValue: token.slice(separatorIndex + 1)
  };
}

function appendIdList(existing: string[] | undefined, value: string): string[] {
  const parsed = parseIdList(value);
  if (!existing || existing.length === 0) {
    return parsed;
  }
  return [...existing, ...parsed];
}

export function parseArgs(
  argv: string[],
  env: Record<string, string | undefined> = Bun.env
): ParsedCliArgs {
  const options: ParsedCliOptions = {};
  const errors: string[] = [];
  let command: CommandName | undefined;
  let optionsTerminated = false;
  const allowInsecureSecretFlags = isTruthyEnvValue(env[ENV_VARS.allowInsecureCliSecrets]);

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (!token) {
      continue;
    }

    if (!optionsTerminated && token === "--") {
      optionsTerminated = true;
      continue;
    }

    if (!token.startsWith("-") && !command) {
      if (isCommand(token)) {
        command = token;
      } else {
        errors.push(`Unknown command: ${token}`);
      }
      continue;
    }

    if (!optionsTerminated && (token === "--help" || token === "-h")) {
      options.help = true;
      continue;
    }

    if (!optionsTerminated && token.startsWith("--")) {
      const { name: optionName, inlineValue } = splitLongOptionToken(token);
      const consumeValue = (): string | undefined => {
        if (inlineValue !== undefined) {
          return inlineValue;
        }

        const next = argv[index + 1];
        if (!next || next.startsWith("-")) {
          errors.push(`Option ${optionName} requires a value`);
          return undefined;
        }

        index += 1;
        return next;
      };

      switch (optionName) {
        case "--api-key": {
          const value = consumeValue();
          if (value !== undefined) {
            if (allowInsecureSecretFlags) {
              options.apiKey = value;
            } else {
              errors.push(
                "Option --api-key is insecure and disabled by default. Use BYBIT_API_KEY / BYBIT_SECRET (or BYBIT_API_SECRET), .env, or a credential profile. If you must bypass this temporarily, set BYBIT_ALLOW_INSECURE_CLI_SECRETS=1."
              );
            }
          }
          break;
        }
        case "--api-secret": {
          const value = consumeValue();
          if (value !== undefined) {
            if (allowInsecureSecretFlags) {
              options.apiSecret = value;
            } else {
              errors.push(
                "Option --api-secret is insecure and disabled by default. Use BYBIT_API_KEY / BYBIT_SECRET (or BYBIT_API_SECRET), .env, or a credential profile. If you must bypass this temporarily, set BYBIT_ALLOW_INSECURE_CLI_SECRETS=1."
              );
            }
          }
          break;
        }
        case "--profile":
          options.profile = consumeValue();
          break;
        case "--profiles-file":
          options.profilesFile = consumeValue();
          break;
        case "--category":
          options.category = consumeValue() as ParsedCliOptions["category"];
          break;
        case "--source":
          options.sourceMode = consumeValue() as ParsedCliOptions["sourceMode"];
          break;
        case "--fgrid-bot-ids": {
          const value = consumeValue();
          if (value !== undefined) {
            options.futuresGridBotIds = appendIdList(options.futuresGridBotIds, value);
          }
          break;
        }
        case "--spot-grid-ids": {
          const value = consumeValue();
          if (value !== undefined) {
            options.spotGridBotIds = appendIdList(options.spotGridBotIds, value);
          }
          break;
        }
        case "--format":
          options.format = consumeValue() as ParsedCliOptions["format"];
          break;
        case "--from":
          options.from = consumeValue();
          break;
        case "--to":
          options.to = consumeValue();
          break;
        case "--window":
          options.window = consumeValue();
          break;
        case "--timeout-ms": {
          const value = consumeValue();
          if (value !== undefined) {
            const parsed = Number(value);
            if (!Number.isFinite(parsed) || parsed <= 0) {
              errors.push(`Invalid --timeout-ms value: ${value}`);
            } else {
              options.timeoutMs = parsed;
            }
          }
          break;
        }
        case "--positions-max-pages": {
          const value = consumeValue();
          if (value !== undefined) {
            const parsed = Number(value);
            if (!Number.isInteger(parsed) || parsed <= 0) {
              errors.push(`Invalid --positions-max-pages value: ${value}`);
            } else {
              options.positionsMaxPages = parsed;
            }
          }
          break;
        }
        case "--executions-max-pages-per-chunk": {
          const value = consumeValue();
          if (value !== undefined) {
            const parsed = Number(value);
            if (!Number.isInteger(parsed) || parsed <= 0) {
              errors.push(`Invalid --executions-max-pages-per-chunk value: ${value}`);
            } else {
              options.executionsMaxPagesPerChunk = parsed;
            }
          }
          break;
        }
        case "--pagination-limit-mode": {
          const value = consumeValue();
          if (value !== undefined) {
            if (value !== "error" && value !== "partial") {
              errors.push(`Invalid --pagination-limit-mode value: ${value}. Expected error|partial`);
            } else {
              options.paginationLimitMode = value;
            }
          }
          break;
        }
        case "--config-diagnostics":
          options.configDiagnostics = true;
          break;
        default:
          errors.push(`Unknown option: ${optionName}`);
      }
      continue;
    }

    if (!optionsTerminated && token.startsWith("-")) {
      errors.push(`Unknown option: ${token}`);
      continue;
    }

    if (!command) {
      if (isCommand(token)) {
        command = token;
      } else {
        errors.push(`Unknown command: ${token}`);
      }
      continue;
    }

    errors.push(`Unexpected argument for ${command}: ${token}`);
  }

  if (options.futuresGridBotIds && options.futuresGridBotIds.length === 0) {
    delete options.futuresGridBotIds;
  }
  if (options.spotGridBotIds && options.spotGridBotIds.length === 0) {
    delete options.spotGridBotIds;
  }

  return { command, options, errors };
}

function renderOptionsSection(): string[] {
  return [
    "Global options:",
    "  --api-key <value>  [deprecated, insecure; disabled by default]",
    "  --api-secret <value>  [deprecated, insecure; disabled by default]",
    "  --profile <name>",
    "  --profiles-file <path>",
    "  --category <linear|spot>",
    "  --source <market|bot>",
    "  --fgrid-bot-ids <id1,id2,...>",
    "  --spot-grid-ids <id1,id2,...>",
    "  --format <md|compact>",
    "    compact is lossless and only changes markdown presentation density",
    "  --from <ISO8601>",
    "  --to <ISO8601>",
    "  --window <7d|30d|90d>",
    "  --timeout-ms <number>",
    "  --positions-max-pages <number>",
    "  --executions-max-pages-per-chunk <number>",
    "  --pagination-limit-mode <error|partial>",
    "  --config-diagnostics  show expanded config diagnostics (sensitive identifiers)",
    "  --help, -h",
    "",
    "CLI conventions:",
    "  Value options support both --flag value and --flag=value forms.",
    "  -- stops option parsing; everything after it is treated as positional arguments.",
    "  Repeating scalar options keeps the last value.",
    "  Repeating --fgrid-bot-ids / --spot-grid-ids appends IDs in order."
  ];
}

function renderGlobalHelp(): string {
  return [
    "# bybit-analysis",
    "",
    "Read-only analytics CLI for Bybit accounts.",
    "",
    "Usage:",
    "  bybit-analysis <command> [options]",
    "  bybit-analysis <command> --help",
    "",
    "Commands:",
    ...COMMANDS.map((commandName) => `  ${commandName.padEnd(11)} ${COMMAND_DESCRIPTIONS[commandName]}`),
    "",
    ...renderOptionsSection(),
    "",
    "Resolution precedence:",
    "  General runtime fields: CLI args -> profile (if applicable) -> env -> defaults.",
    "  Credentials: profile -> env -> legacy CLI flags (only with BYBIT_ALLOW_INSECURE_CLI_SECRETS=1) -> defaults.",
    "  Time range: --from + --to -> --window -> BYBIT_WINDOW -> default 30d window.",
    "",
    "Credential input (recommended):",
    "  1) Environment variables or .env: BYBIT_API_KEY + BYBIT_SECRET (or BYBIT_API_SECRET).",
    "  2) Credential profiles: --profile <name> with --profiles-file.",
    "",
    "Legacy insecure flags (deprecated):",
    "  To temporarily allow --api-key/--api-secret, set BYBIT_ALLOW_INSECURE_CLI_SECRETS=1.",
    "",
    "Supported environment variables:",
    `  ${ENV_VARS.apiKey}=<value>`,
    `  ${ENV_VARS.secret}=<value>`,
    `  ${ENV_VARS.apiSecret}=<value>`,
    `  ${ENV_VARS.allowInsecureCliSecrets}=<1|true|yes|on>`,
    `  ${ENV_VARS.profile}=<name>`,
    `  ${ENV_VARS.profilesFile}=<path>`,
    `  ${ENV_VARS.category}=<linear|spot>`,
    `  ${ENV_VARS.sourceMode}=<market|bot>`,
    `  ${ENV_VARS.futuresGridBotIds}=<id1,id2,...>`,
    `  ${ENV_VARS.spotGridBotIds}=<id1,id2,...>`,
    `  ${ENV_VARS.format}=<md|compact>`,
    `  ${ENV_VARS.timeoutMs}=<number>`,
    `  ${ENV_VARS.window}=<7d|30d|90d>`,
    `  ${ENV_VARS.positionsMaxPages}=<number>`,
    `  ${ENV_VARS.executionsMaxPagesPerChunk}=<number>`,
    `  ${ENV_VARS.paginationLimitMode}=<error|partial>`,
    `  ${ENV_VARS.configDiagnostics}=<1|true|yes|on>`,
    "",
    `${ENV_VARS.configDiagnostics}=1 enables expanded config details`
  ].join("\n");
}

function renderCommandHelp(command: CommandName): string {
  return [
    `# bybit-analysis ${command}`,
    "",
    COMMAND_DESCRIPTIONS[command],
    "",
    "Usage:",
    `  bybit-analysis ${command} [options]`,
    `  bybit-analysis ${command} --help`,
    "",
    ...renderOptionsSection(),
    "",
    "Tip:",
    "  Run bybit-analysis --help for all commands and credential guidance."
  ].join("\n");
}

export function renderHelp(command?: CommandName): string {
  if (!command) {
    return renderGlobalHelp();
  }

  return renderCommandHelp(command);
}
