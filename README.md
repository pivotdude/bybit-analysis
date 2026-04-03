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
- `permissions` - API key permission diagnostics
- `config` - Effective runtime config (redacted)
- `health` - API/connectivity/readiness checks

## Global Options

- `--api-key <value>`
- `--api-secret <value>`
- `--category <linear|spot|bot>`
- `--fgrid-bot-ids <id1,id2,...>`
- `--spot-grid-ids <id1,id2,...>`
- `--format <md|compact>`
- `--from <ISO8601>`
- `--to <ISO8601>`
- `--window <7d|30d|90d>`
- `--lang <en>`
- `--timeout-ms <number>`
- `--help, -h`

## Config Priority

`CLI flags > .env > defaults`

## Bot Mode In CLI

You can run built-in reports against grid bots by setting:

- `--category bot`
- `--fgrid-bot-ids <id1,id2,...>` for Futures Grid bots
- `--spot-grid-ids <id1,id2,...>` for Spot Grid bots

Or set bot IDs once via env:

- `BYBIT_FGRID_BOT_IDS=<id1,id2,...>`
- `BYBIT_SPOT_GRID_IDS=<id1,id2,...>`

Example:

```bash
bun run src/index.ts summary \
  --category bot \
  --fgrid-bot-ids 612330315406398322 \
  --spot-grid-ids 612340768081708828
```

Permissions check:

```bash
bun run src/index.ts permissions
```
