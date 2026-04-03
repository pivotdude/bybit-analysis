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
  "config",
  "health"
];

function isCommand(value: string): value is CommandName {
  return COMMANDS.includes(value as CommandName);
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
      case "--category":
        options.category = consumeValue() as ParsedCliOptions["category"];
        break;
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
    "  config       Effective runtime config (redacted)",
    "  health       API/connectivity/readiness checks",
    "",
    "Global options:",
    "  --api-key <value>",
    "  --api-secret <value>",
    "  --category <linear|spot>",
    "  --format <md|compact>",
    "  --from <ISO8601>",
    "  --to <ISO8601>",
    "  --window <7d|30d|90d>",
    "  --lang <en>",
    "  --timeout-ms <number>",
    "  --help, -h"
  ].join("\n");
}
