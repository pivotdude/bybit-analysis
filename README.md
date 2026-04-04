# bybit-analysis

Read-only analytics CLI for Bybit accounts. Outputs structured Markdown optimized for human and LLM consumption.

## Exchange Readiness Status

- Shared domain entities use extensible exchange identifiers (no hardcoded `exchange: "bybit"` contract in core types).
- Exchange-specific DTO mapping/normalization lives under `src/services/bybit/normalizers`.
- Composition root is provider-based via `src/services/composition/createServiceBundle.ts`.
- Provider contract is capability-based (`supportedMarketCategories`, `supportedSourceModes`, `botData`) and exposed in `ServiceBundle`.
- Shared request/config contracts keep provider payloads in generic `providerContext`; Bybit bot strategy IDs live under `providerContext.bybit.botStrategyIds`.
- `botService` is optional in `ServiceBundle` and only required by providers that expose bot capability.
- Current implementation status: only the `bybit` provider is implemented and registered.
- This is not full multi-exchange support yet; it is a structural split so new providers can be added without rewriting shared domain models.

## Install

```bash
bun install
```

## Run

```bash
bun run src/index.ts <command> [options]
```

Command-specific help:

```bash
bun run src/index.ts <command> --help
```

## Testing

```bash
# unit + integration suite
bun run test

# watch mode during development
bun run test:watch

# optional local coverage report
bun run test:coverage

# standard local gate (types + tests)
bun run verify
```

Current suite covers production-critical paths: spot PnL normalization, pagination safety handling, secret redaction, CLI stdout/stderr contract, summary report schema contract, and CLI smoke/integration flow.

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

## Summary Markdown Contract (`summary-markdown-v1`)

`summary` now uses a schema-stable section contract across market categories (`linear`, `spot`) and source modes (`market`, `bot`).

- Section IDs are fixed and rendered in headings as `## [section.id] Title`.
- Section order and section type are fixed.
- Section typing is pinned by explicit section contract mapping (`id + title + type`), not inferred from payload data.
- Missing category-specific data is represented as empty rows / zero values / info alerts, not by omitting sections.
- `summary.alerts` is always `alerts`; if a tabular/alternative representation is needed, it must use a different section ID and title.
- Bot enrichment failure policy:
  - `--source market`: bot summary is optional enrichment. Failures do not abort report generation, but are surfaced explicitly in `summary.alerts` and `summary.data_completeness` with the original error reason.
  - `--source bot`: bot summary is required input. Bot fetch failures are fail-fast and abort summary generation.

Report-level metadata:

- `Schema: summary-markdown-v1` line is present in output.

Fixed section order:

1. `summary.contract` (`text`)
2. `summary.overview` (`kpi`)
3. `summary.activity` (`kpi`)
4. `summary.allocation` (`kpi`)
5. `summary.exposure` (`kpi`)
6. `summary.risk` (`kpi`)
7. `summary.open_positions` (`table`)
8. `summary.top_holdings` (`table`)
9. `summary.symbol_pnl` (`table`)
10. `summary.bots` (`table`)
11. `summary.alerts` (`alerts`)
12. `summary.data_completeness` (`alerts`)

## Spot PnL Inventory Method

- Cost basis method: `weighted_average`.
- Opening inventory at `--from` is reconstructed from pre-window spot executions (lookback: last 365 days) for symbols sold inside the window.
- If sell quantity cannot be matched to reconstructed inventory, the report is marked `dataCompleteness.partial=true`, and unmatched quantity is excluded from realized PnL (no fallback to sell execution price).

## PnL ROI Contract

- `pnl` uses explicit ROI status: `supported` or `unsupported`.
- ROI is `supported` only when both start and end equity are available.
- Start equity is resolved from `account.equityHistory` using the latest sample at or before `--from`.
- If start equity is unavailable, ROI KPI is rendered as `unsupported`, and the report includes an explicit reason in `ROI Status`.

Example (`pnl` section):

```md
## ROI Status
- Status: unsupported
- Reason: no equity sample found at or before period start
```

## Global Options

- `--profile <name>`
- `--profiles-file <path>`
- `--category <linear|spot>`
- `--source <market|bot>`
- `--fgrid-bot-ids <id1,id2,...>`
- `--spot-grid-ids <id1,id2,...>`
- `--format <md|compact>`
- `--from <ISO8601>`
- `--to <ISO8601>`
- `--window <7d|30d|90d>`
- `--timeout-ms <number>`
- `--positions-max-pages <number>`
- `--executions-max-pages-per-chunk <number>`
- `--pagination-limit-mode <error|partial>`
- `--no-env`
- `--help, -h`

## Config & Environment Contract

Supported env vars:

- `BYBIT_API_KEY`
- `BYBIT_SECRET`
- `BYBIT_API_SECRET`
- `BYBIT_ALLOW_INSECURE_CLI_SECRETS`
- `BYBIT_DISABLE_ENV`
- `BYBIT_PROFILE`
- `BYBIT_PROFILES_FILE`
- `BYBIT_CATEGORY`
- `BYBIT_SOURCE_MODE`
- `BYBIT_FGRID_BOT_IDS`
- `BYBIT_SPOT_GRID_IDS`
- `BYBIT_FORMAT`
- `BYBIT_TIMEOUT_MS`
- `BYBIT_WINDOW`
- `BYBIT_POSITIONS_MAX_PAGES`
- `BYBIT_EXECUTIONS_MAX_PAGES_PER_CHUNK`
- `BYBIT_PAGINATION_LIMIT_MODE`
- `BYBIT_CONFIG_DIAGNOSTICS`

Precedence rules:

- General runtime fields: `CLI args -> profile (if applicable) -> env -> defaults`
- Credentials: `profile -> env -> legacy CLI flags (only with BYBIT_ALLOW_INSECURE_CLI_SECRETS=1) -> defaults`
- Time range: `--from + --to -> --window -> BYBIT_WINDOW -> default 30d window`
- Ambient env loading can be disabled with `--no-env` or `BYBIT_DISABLE_ENV=1`

Legacy hidden aliases are intentionally removed and not supported:

- `WINDOW`
- `DEFAULT_CATEGORY`
- `DEFAULT_FORMAT`
- `DEFAULT_TIMEOUT_MS`

CLI parsing conventions:

- Value options support both `--flag value` and `--flag=value`.
- `--` stops option parsing; everything after is treated as positional arguments.
- Repeated scalar options use last-value-wins semantics.
- Repeatable list options `--fgrid-bot-ids` and `--spot-grid-ids` append values in argument order.

Parser strategy:

- The project keeps a custom parser for now to preserve strict, predictable behavior and zero runtime dependencies.
- Behavior is locked with table-driven tests in `src/cli/parseArgs.test.ts`.

Output formats:

- `md` - standard Markdown layout.
- `compact` - lossless Markdown layout with tighter spacing (presentation-only; no row/text truncation).

## Credentials (Secure Default)

Recommended production paths:

- Environment variables (`BYBIT_API_KEY` + `BYBIT_SECRET` or `BYBIT_API_SECRET`)
- Explicit env-file launch, for example `bun --env-file=.env run src/index.ts ...`
- Credential profile file (`--profile` + `--profiles-file`)
- OS secret store -> export to env before launch

Example (`.env` used explicitly via `bun --env-file=.env ...`):

```env
BYBIT_API_KEY=xxx
BYBIT_SECRET=yyy
```

Legacy path (deprecated, insecure):

- `--api-key` and `--api-secret` are disabled by default because command-line secrets can leak via shell history, process listing, and command logging.
- Temporary bypass only: set `BYBIT_ALLOW_INSECURE_CLI_SECRETS=1`.

## Config Priority

- General runtime fields: `CLI args -> profile (if applicable) -> env -> defaults`
- Credentials only: `profile -> env -> legacy CLI flags (only with BYBIT_ALLOW_INSECURE_CLI_SECRETS=1) -> defaults`
- Repo-local `.env` is not auto-loaded; the repository sets `bunfig.toml` with `env = false` for hermetic CLI/test runs.
- Use `--no-env` or `BYBIT_DISABLE_ENV=1` when you need deterministic argv-only resolution even if the parent process exported `BYBIT_*` vars.

## Credential Profiles

Use profiles to keep sub-account keys in one local file and switch by name:

```bash
bun run src/index.ts summary --profile subaccount-a
```

Default profiles file is `./.bybit-profiles.json` (or set `BYBIT_PROFILES_FILE` / `--profiles-file`).

Example:

```json
{
  "subaccount-a": {
    "apiKey": "xxx",
    "apiSecret": "yyy"
  },
  "subaccount-b": {
    "apiKey": "aaa",
    "apiSecret": "bbb",
    "category": "linear",
    "sourceMode": "bot",
    "futuresGridBotIds": ["612330315406398322"]
  }
}
```

## Bot Mode In CLI

You can run built-in reports against grid bots by setting:

- `--source bot`
- `--category linear|spot` (optional; default `linear`)
- `--fgrid-bot-ids <id1,id2,...>` for Futures Grid bots
- `--spot-grid-ids <id1,id2,...>` for Spot Grid bots

Those bot identifiers are resolved in the Bybit adapter layer and mapped into provider request context:

- `providerContext.bybit.botStrategyIds.futuresGridBotIds`
- `providerContext.bybit.botStrategyIds.spotGridBotIds`

Or set bot IDs once via env:

- `BYBIT_FGRID_BOT_IDS=<id1,id2,...>`
- `BYBIT_SPOT_GRID_IDS=<id1,id2,...>`

Pagination safety (optional):

- `BYBIT_POSITIONS_MAX_PAGES=<number>`
- `BYBIT_EXECUTIONS_MAX_PAGES_PER_CHUNK=<number>`
- `BYBIT_PAGINATION_LIMIT_MODE=<error|partial>`

Example:

```bash
bun run src/index.ts summary \
  --source bot \
  --fgrid-bot-ids 612330315406398322 \
  --spot-grid-ids 612340768081708828
```

Permissions check:

```bash
bun run src/index.ts permissions
```

Security note: `config` and `permissions` outputs are redacted for logs/CI and do not print raw API keys, API secrets, or full IP whitelist values.
