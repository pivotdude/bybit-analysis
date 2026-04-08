---
name: bybit-analysis
description: Analyze Bybit account state and trading performance using the bybit-analysis CLI. Use for health checks, permissions, balances, positions, exposure, risk, PnL, performance, and bot analytics.
argument-hint: <command> [--project-root <path>] [--profile <name>] [--format md|compact|json] [--window 7d|30d|90d] [--category linear|spot] [--source market|bot]
allowed-tools: Bash(bybit-analysis:*) Read
---

Use the compiled `bybit-analysis` binary from `PATH`.

## When to use

Use this skill for:

- Bybit API health and connectivity checks
- API permission inspection
- balance, positions, exposure, and risk review
- period PnL and performance analysis
- bot analytics using Futures Grid / Spot Grid bot IDs
- machine-readable JSON output for downstream automation

Do not use this skill for trading, order placement, transfers, or secret rotation.

## Commands

Live snapshot commands:

- `balance`
- `positions`
- `exposure`
- `risk`
- `permissions`
- `config`
- `health`

Period commands:

- `summary`
- `pnl`
- `performance`
- `bots`

## Rules

- Use `bybit-analysis <command> [options]`.
- Pass `--project-root <path>` when `.env` and `.bybit-profiles.json` live in a workspace directory rather than the current shell directory.
- Prefer `health` first when credentials or connectivity may be broken.
- Prefer `--format json` for downstream parsing and automation.
- Prefer `--format md` when the result is meant for a human.
- Treat exit codes as the primary machine contract.
- Do not pass raw API secrets on the command line unless the user explicitly requests the insecure legacy path.
- Do not mix `--from`, `--to`, or `--window` with snapshot-only commands.

## Profile behavior

When `--profile <name>` is used, assume the profile may already provide:

- credential env references
- default category and source mode
- `fgrid-bot-ids`
- `spot-grid-ids`

Do not redundantly require bot ID flags if the selected profile already defines them.

Explicit CLI flags override profile-provided values.

## Output formats

- `md` — standard human-readable Markdown
- `compact` — denser Markdown with the same content
- `json` — versioned machine-readable output

## Exit codes

- `0` — success
- `3` — partial success
- `4` — critical incomplete analytics
- `5` — health-check failure
- `1` — runtime failure
- `2` — usage/config failure

## Typical invocations

```bash
bybit-analysis health
bybit-analysis permissions --profile main
bybit-analysis balance --profile main
bybit-analysis positions --profile main --format json
bybit-analysis summary --project-root workspace/skills/bybit-analysis --profile main --window 30d --format md
bybit-analysis summary --project-root workspace/skills/bybit-analysis --profile main --source bot --format json
```
