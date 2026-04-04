import type { CommandName, ParsedCliArgs, ParsedCliOptions } from "../types/command.types";

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

function isCommand(value: string): value is CommandName {
  return COMMANDS.includes(value as CommandName);
}

function parseIdList(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

export function parseArgs(argv: string[]): ParsedCliArgs {
  const options: ParsedCliOptions = {};
  const errors: string[] = [];
  let command: CommandName | undefined;

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (!token) {
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

    if (token === "--help" || token === "-h") {
      options.help = true;
      continue;
    }

    const next = argv[index + 1];
    const consumeValue = (): string | undefined => {
      if (!next || next.startsWith("-")) {
        errors.push(`Option ${token} requires a value`);
        return undefined;
      }
      index += 1;
      return next;
    };

    switch (token) {
      case "--api-key":
        options.apiKey = consumeValue();
        break;
      case "--api-secret":
        options.apiSecret = consumeValue();
        break;
      case "--profile":
        options.profile = consumeValue();
        break;
      case "--profiles-file":
        options.profilesFile = consumeValue();
        break;
      case "--category":
        options.category = consumeValue() as ParsedCliOptions["category"];
        break;
      case "--fgrid-bot-ids": {
        const value = consumeValue();
        if (value !== undefined) {
          options.futuresGridBotIds = parseIdList(value);
        }
        break;
      }
      case "--spot-grid-ids": {
        const value = consumeValue();
        if (value !== undefined) {
          options.spotGridBotIds = parseIdList(value);
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
      case "--lang":
        options.lang = consumeValue();
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
      default:
        errors.push(`Unknown option: ${token}`);
    }
  }

  return { command, options, errors };
}

export function renderHelp(): string {
  return [
    "# bybit-analysis",
    "",
    "Read-only analytics CLI for Bybit accounts.",
    "",
    "Usage:",
    "  bybit-analysis <command> [options]",
    "",
    "Commands:",
    "  summary      Full account analytics snapshot",
    "  balance      Wallet/equity/margin balances",
    "  pnl          Realized/unrealized PnL analysis",
    "  positions    Open position inventory and status",
    "  exposure     Exposure and concentration analysis",
    "  performance  ROI and capital efficiency analysis",
    "  risk         Leverage and downside risk analysis",
    "  bots         Optional bot/copy-trading analytics",
    "  permissions  API key permissions diagnostics",
    "  config       Effective runtime config (redacted)",
    "  health       API/connectivity/readiness checks",
    "",
    "Global options:",
    "  --api-key <value>",
    "  --api-secret <value>",
    "  --profile <name>",
    "  --profiles-file <path>",
    "  --category <linear|spot|bot>",
    "  --fgrid-bot-ids <id1,id2,...>",
    "  --spot-grid-ids <id1,id2,...>",
    "  --format <md|compact>",
    "  --from <ISO8601>",
    "  --to <ISO8601>",
    "  --window <7d|30d|90d>",
    "  --lang <en>",
    "  --timeout-ms <number>",
    "  --positions-max-pages <number>",
    "  --executions-max-pages-per-chunk <number>",
    "  --pagination-limit-mode <error|partial>",
    "  --help, -h",
    "",
    "Credential profiles:",
    "  --profile <name> picks keys from profile file before env fallback.",
    "  --profiles-file defaults to ./.bybit-profiles.json (or BYBIT_PROFILES_FILE).",
    "  Env alternatives: BYBIT_PROFILE, BYBIT_PROFILES_FILE",
    "",
    "Bot IDs can also be provided via env:",
    "  BYBIT_FGRID_BOT_IDS=<id1,id2,...>",
    "  BYBIT_SPOT_GRID_IDS=<id1,id2,...>",
    "",
    "Pagination safety (optional):",
    "  BYBIT_POSITIONS_MAX_PAGES=<number>",
    "  BYBIT_EXECUTIONS_MAX_PAGES_PER_CHUNK=<number>",
    "  BYBIT_PAGINATION_LIMIT_MODE=<error|partial>"
  ].join("\n");
}
