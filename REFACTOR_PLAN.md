# bybit-analysis Refactor Plan

## Goal

Bring the CLI to production-grade safety for:

- human operators
- CI/automation
- LLM/agent invocation

Primary success condition:

- no command may silently produce materially misleading analytics

## Progress Tracking

Use Markdown checkboxes directly:

- switch `[ ]` to `[x]` when done
- leave partially finished items unchecked
- if needed, append a short note in parentheses)

### Master Checklist

- [x] Workstream 1: Separate Live Snapshot vs Period Analytics
- [x] Workstream 2: Decouple Wallet Snapshot from Positions
- [x] Workstream 3: Replace Fail-Open Normalization with Validated Parsing
- [x] Workstream 4: Rework Data Completeness into Actionable Severity Classes
- [x] Workstream 5: Redesign Exit-Code Contract for Automation
- [x] Workstream 6: Add First-Class JSON Output
- [x] Workstream 7: Tighten CLI Semantics Around Time Flags
- [x] Workstream 8: Improve Bybit Retry and Failure Classification
- [x] Workstream 9: Replace Read-Only Endpoint Blocklist with Allowlist
- [x] Workstream 10: Add Source Freshness and Provenance to the Data Model
- [x] Workstream 11: Rationalize Domain Types for Multi-Exchange Readiness
- [x] Workstream 12: Expand Test Matrix Around Unsafe Semantics
- [x] Phase 1 complete
- [x] Phase 2 complete
- [x] Phase 3 complete

## Scope

This plan is driven by the current repository audit and focuses on:

- correctness
- data integrity
- reliability
- output contract safety
- testability
- future extensibility

## Guiding Rules

1. Fail closed for ambiguous or corrupted financial data.
2. Do not mix live snapshot state with historical-window analytics.
3. Distinguish optional degradation from critical unsupported states.
4. Keep stdout contract stable and machine-parseable.
5. Prefer explicit unsupported behavior over fabricated values.

## Workstreams

## 1. Separate Live Snapshot vs Period Analytics

### Problem

Current `pnl`, `performance`, and `summary` flows combine:

- current account snapshot data
- historical period execution data

This can misstate period results.

### Checklist

- [x] Split the data model into distinct concepts
- [x] Introduce `LiveAccountSnapshot`
- [x] Introduce `PeriodPnlSnapshot` or equivalent (implemented via explicit historical-boundary contract on `PnLReport`)
- [x] Introduce `HistoricalBoundaryState` or equivalent
- [x] Remove the implicit assumption that current `totalEquityUsd` and `unrealizedPnlUsd` represent `--to`
- [ ] For commands without true historical end-state, fetch proper historical state
- [x] Or mark the metric as unsupported
- [ ] Or reject the command/flag combination

### Target changes

- [src/services/contracts/AccountDataService.ts](/mnt/tom/projects/bybit-analys/src/services/contracts/AccountDataService.ts)
- [src/services/bybit/BybitAccountService.ts](/mnt/tom/projects/bybit-analys/src/services/bybit/BybitAccountService.ts)
- [src/services/contracts/ExecutionDataService.ts](/mnt/tom/projects/bybit-analys/src/services/contracts/ExecutionDataService.ts)
- [src/generators/PnLReportGenerator.ts](/mnt/tom/projects/bybit-analys/src/generators/PnLReportGenerator.ts)
- [src/generators/PerformanceReportGenerator.ts](/mnt/tom/projects/bybit-analys/src/generators/PerformanceReportGenerator.ts)
- [src/generators/SummaryReportGenerator.ts](/mnt/tom/projects/bybit-analys/src/generators/SummaryReportGenerator.ts)

### Acceptance criteria

- [x] `pnl` does not use current wallet state as period end-state unless explicitly labeled as live
- [x] `performance` ROI and capital-efficiency semantics are correct or explicitly unsupported
- [x] `summary` clearly separates live snapshot metrics from period metrics if both remain in one report

## 2. Decouple Wallet Snapshot from Positions

### Problem

`getAccountSnapshot()` always depends on `getOpenPositions()`, causing:

- unnecessary API calls
- avoidable latency
- false degradation in commands that do not need positions

### Checklist

- [x] Replace the current account service contract with narrower primitives
- [x] Add `getWalletSnapshot()`
- [x] Keep `getOpenPositions()`
- [x] Keep `getApiKeyPermissionInfo()`
- [x] Keep `checkHealth()`
- [x] Compose richer aggregate objects at orchestration/generator level, not inside the account service

### Target changes

- [src/services/contracts/AccountDataService.ts](/mnt/tom/projects/bybit-analys/src/services/contracts/AccountDataService.ts)
- [src/services/bybit/BybitAccountService.ts](/mnt/tom/projects/bybit-analys/src/services/bybit/BybitAccountService.ts)
- [src/generators/BalanceReportGenerator.ts](/mnt/tom/projects/bybit-analys/src/generators/BalanceReportGenerator.ts)
- [src/generators/PnLReportGenerator.ts](/mnt/tom/projects/bybit-analys/src/generators/PnLReportGenerator.ts)
- [src/generators/PerformanceReportGenerator.ts](/mnt/tom/projects/bybit-analys/src/generators/PerformanceReportGenerator.ts)

### Acceptance criteria

- [x] `balance` never fails because positions are unavailable
- [x] `pnl` and `performance` only fetch positions when logically required
- [x] command latency and API fan-out are reduced for wallet-only flows

## 3. Replace Fail-Open Normalization with Validated Parsing

### Problem

Malformed exchange fields currently degrade into:

- `0`
- `UNKNOWN`
- current timestamp
- epoch-like timestamps

This preserves shape but can corrupt analytics.

### Checklist

- [x] Introduce explicit parsing helpers with three outcomes
- [x] Support `valid value`
- [x] Support `absent but allowed`
- [x] Support `invalid and reportable`
- [x] Add per-row normalization diagnostics
- [x] For critical fields, emit `dataCompleteness` issues
- [x] For critical fields, skip the row when safe
- [x] For critical fields, fail the command if the dataset becomes unsafe (via critical completeness state and non-success automation outcome)
- [x] Remove fabricated timestamps like `new Date().toISOString()` as fallback for source fields

### Target changes

- [src/services/bybit/normalizers/accountSnapshot.normalizer.ts](/mnt/tom/projects/bybit-analys/src/services/bybit/normalizers/accountSnapshot.normalizer.ts)
- [src/services/bybit/normalizers/position.normalizer.ts](/mnt/tom/projects/bybit-analys/src/services/bybit/normalizers/position.normalizer.ts)
- [src/services/bybit/normalizers/pnl.normalizer.ts](/mnt/tom/projects/bybit-analys/src/services/bybit/normalizers/pnl.normalizer.ts)
- [src/services/bybit/normalizers/spotPnl.normalizer.ts](/mnt/tom/projects/bybit-analys/src/services/bybit/normalizers/spotPnl.normalizer.ts)

### Acceptance criteria

- [x] malformed critical rows do not silently alter totals
- [x] invalid timestamps are never replaced with `now`
- [x] linear PnL normalization surfaces row corruption via completeness metadata

## 4. Rework Data Completeness into Actionable Severity Classes

### Problem

`dataCompleteness.partial=true` currently covers:

- optional enrichment loss
- unsupported critical features
- partial critical datasets

This is too coarse for automation.

### Checklist

- [x] Introduce explicit result states
- [x] Add `complete`
- [x] Add `partial_optional`
- [x] Add `partial_critical`
- [x] Add `unsupported`
- [x] Add `failed`
- [x] Preserve issue-level detail, but expose a report-level machine decision state
- [x] Stop using one generic degraded bucket for incompatible failure modes

### Target changes

- [src/types/domain.types.ts](/mnt/tom/projects/bybit-analys/src/types/domain.types.ts)
- [src/services/reliability/dataCompleteness.ts](/mnt/tom/projects/bybit-analys/src/services/reliability/dataCompleteness.ts)
- all generators under [src/generators](/mnt/tom/projects/bybit-analys/src/generators)
- [src/cli/exitCodes.ts](/mnt/tom/projects/bybit-analys/src/cli/exitCodes.ts)

### Acceptance criteria

- [x] optional bot enrichment failure is distinguishable from unsupported exposure analytics
- [x] agents can determine whether output is actionable without prose parsing

## 5. Redesign Exit-Code Contract for Automation

### Problem

README says automation can branch on exit code alone, but exit code `3` is overloaded.

### Checklist

- [x] Define a clearer exit-code matrix
- [x] Separate optional partial success
- [x] Separate critical partial or unsupported result
- [x] Separate hard failure
- [x] Keep Markdown metadata aligned with exit semantics

### Target changes

- [src/cli/exitCodes.ts](/mnt/tom/projects/bybit-analys/src/cli/exitCodes.ts)
- [src/renderers/MarkdownRenderer.ts](/mnt/tom/projects/bybit-analys/src/renderers/MarkdownRenderer.ts)
- [README.md](/mnt/tom/projects/bybit-analys/README.md)
- contract tests in [src/cli](/mnt/tom/projects/bybit-analys/src/cli)

### Acceptance criteria

- [x] exit code meaning is one-to-one with machine action class
- [x] README no longer overpromises if parsing is still required

## 6. Add First-Class JSON Output

### Problem

Stable Markdown is useful, but it is still presentation-first.

### Checklist

- [x] Add `--format json`
- [x] Emit a versioned JSON document matching the internal report contract
- [x] Include schema version
- [x] Include report status
- [x] Include completeness class
- [x] Include source freshness
- [x] Include sections
- [x] Include machine-usable numeric values

### Target changes

- [src/types/command.types.ts](/mnt/tom/projects/bybit-analys/src/types/command.types.ts)
- [src/renderers/ReportRenderer.ts](/mnt/tom/projects/bybit-analys/src/renderers/ReportRenderer.ts)
- add JSON renderer under [src/renderers](/mnt/tom/projects/bybit-analys/src/renderers)
- help/docs/tests

### Acceptance criteria

- [x] agents can consume reports without Markdown parsing
- [x] JSON output is schema-tested and snapshot-tested

## 7. Tighten CLI Semantics Around Time Flags

### Problem

Global time flags are accepted for commands that are effectively live snapshots.

### Checklist

- [x] Classify commands into live snapshot commands and period analytics commands
- [x] Reject invalid flag combinations during argument validation or command routing
- [x] Add explicit `As Of` metadata for live snapshot commands

### Target changes

- [src/cli/parseArgs.ts](/mnt/tom/projects/bybit-analys/src/cli/parseArgs.ts)
- [src/cli/commandRouter.ts](/mnt/tom/projects/bybit-analys/src/cli/commandRouter.ts)
- generators for `balance`, `positions`, `exposure`, `risk`, `health`, `permissions`

### Acceptance criteria

- [x] no command silently ignores user-provided historical intent
- [x] help text differentiates live and period commands

## 8. Improve Bybit Retry and Failure Classification

### Problem

Retry logic covers transport and HTTP status failures, but not transient API-level envelope errors.

### Checklist

- [x] Add retry classification for retryable `retCode` values
- [x] Keep non-retryable auth and permission failures fail-fast
- [x] Expose retry count and final failure class in diagnostics metadata

### Target changes

- [src/services/bybit/BybitClientFactory.ts](/mnt/tom/projects/bybit-analys/src/services/bybit/BybitClientFactory.ts)
- [src/services/bybit/partialFailurePolicy.ts](/mnt/tom/projects/bybit-analys/src/services/bybit/partialFailurePolicy.ts)
- retry tests in [src/services/bybit](/mnt/tom/projects/bybit-analys/src/services/bybit)

### Acceptance criteria

- [x] transient Bybit API envelope failures are retried consistently
- [x] permanent permission or auth errors remain fail-fast

## 9. Replace Read-Only Endpoint Blocklist with Allowlist

### Problem

Read-only safety depends on a blocklist of known write endpoints.

### Checklist

- [x] Implement an allowlist of approved endpoints and methods
- [x] Deny any unknown private endpoint by default

### Target changes

- [src/services/bybit/BybitClientFactory.ts](/mnt/tom/projects/bybit-analys/src/services/bybit/BybitClientFactory.ts)

### Acceptance criteria

- [x] adding a new endpoint requires explicit read-only approval
- [x] no private request path can bypass the read-only guard accidentally

## 10. Add Source Freshness and Provenance to the Data Model

### Problem

Reports expose render time, not source capture provenance.

### Checklist

- [x] Add explicit metadata fields
- [x] Add exchange server time if available
- [x] Add source fetched at
- [x] Add source captured at
- [x] Add cache hit or miss if useful- [x] Surface these fields in JSON and Markdown

### Target changes

- [src/types/domain.types.ts](/mnt/tom/projects/bybit-analys/src/types/domain.types.ts)
- [src/types/report.types.ts](/mnt/tom/projects/bybit-analys/src/types/report.types.ts)
- account/execution services and renderers

### Acceptance criteria

- [x] operators can tell when the source data was actually collected
- [x] agents can compare runs with explicit freshness metadata

## 11. Rationalize Domain Types for Multi-Exchange Readiness

### Problem

The provider boundary exists, but the domain and config still assume Bybit too deeply.

### Checklist

- [x] introduce explicit exchange or provider selection in runtime config
- [x] move provider-specific context into provider-specific config types
- [x] audit core types for Bybit-only assumptions such as category and source semantics

### Target changes

- [src/services/composition/createServiceBundle.ts](/mnt/tom/projects/bybit-analys/src/services/composition/createServiceBundle.ts)
- [src/types/config.types.ts](/mnt/tom/projects/bybit-analys/src/types/config.types.ts)
- [src/services/bybit/bybitProviderContext.ts](/mnt/tom/projects/bybit-analys/src/services/bybit/bybitProviderContext.ts)

### Acceptance criteria

- [x] the shared layer no longer requires `bybit`-named context to exist
- [x] adding a second provider does not require rewriting report generators

## 12. Expand Test Matrix Around Unsafe Semantics

### Problem

The current suite is strong on contract stability but weak on semantic safety.

### Checklist

- [x] Add tests for historical `--to` behavior vs live state contamination
- [x] Add tests for malformed critical fields causing surfaced degradation
- [x] Add tests for retryable `retCode` envelope failures
- [x] Add tests for invalid flag combinations by command type
- [x] Add tests for JSON output schema contracts
- [x] Add tests for source freshness metadata
- [x] Add tests for distinction between optional and critical partial states

### Acceptance criteria

- [x] the suite fails if a report silently mixes live and historical state
- [x] the suite fails if malformed critical payloads become zero-valued analytics without degradation

## Delivery Phases

## Phase 1: Safety Corrections

- [x] Workstreams 1, 2, 3, 4, 5, 7 complete

Outcome:

- no silent semantic corruption
- no ambiguous automation status

## Phase 2: Machine Contract

- [x] Workstreams 6 and 10 complete

Outcome:

- agent-safe JSON contract
- explicit freshness/provenance

## Phase 3: Resilience and Extensibility

- [x] Workstreams 8, 9, 11, 12 complete

Outcome:

- stronger retry model
- stronger read-only guarantee
- cleaner provider boundary

## Recommended Order of Implementation

- [x] Split live snapshot vs period analytics
- [x] Decouple wallet snapshot from positions
- [x] Introduce stricter normalization and completeness severity classes
- [x] Redesign exit codes and report status contract
- [x] Tighten CLI flag semantics
- [x] Add JSON output
- [x] Improve retry classification
- [x] Replace endpoint blocklist with allowlist
- [x] Refine provider-neutral architecture
- [x] Backfill regression tests for all of the above

## Definition of Done

The refactor is complete when:

- [x] no report mixes live and historical semantics without explicit labeling
- [x] malformed critical exchange data cannot silently produce plausible analytics
- [x] automation can determine actionability without prose parsing
- [x] snapshot commands and period commands have non-ambiguous CLI semantics
- [x] a versioned JSON contract exists
- [x] read-only safety is enforced by allowlist
- [x] the new behavior is covered by regression tests
