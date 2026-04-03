# bybit-analysis

Read-only analytics CLI for Bybit accounts. Outputs structured Markdown optimized for human and LLM consumption.

## Install

```bash
bun install
```

## Run

```bash
bun run src/index.ts <command> [options]
```

## Commands

- `summary` - Full account analytics snapshot
- `balance` - Wallet/equity/margin balances
- `pnl` - Realized/unrealized PnL analysis
- `positions` - Open position inventory and status
- `exposure` - Exposure and concentration analysis
- `performance` - ROI and capital efficiency analysis
- `risk` - Leverage and downside risk analysis
- `bots` - Optional bot/copy-trading analytics
- `config` - Effective runtime config (redacted)
- `health` - API/connectivity/readiness checks

## Global Options

- `--api-key <value>`
- `--api-secret <value>`
- `--category <linear|spot>`
- `--format <md|compact>`
- `--from <ISO8601>`
- `--to <ISO8601>`
- `--window <7d|30d|90d>`
- `--lang <en>`
- `--timeout-ms <number>`
- `--help, -h`

## Config Priority

`CLI flags > .env > defaults`
