#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(git rev-parse --show-toplevel)"
cd "$ROOT_DIR"

ARTIFACT_PATTERN='(^|/)(\.env(|\..*)|\.bybit-profiles\.json|\.openclaude-profile\.json|.*\.tgz|logs/.*)$'
REQUIRED_GITIGNORE_RULES=(
  '.env'
  '.bybit-profiles.json'
  '.openclaude-profile.json'
  '*.tgz'
)

HAS_RG=0
if command -v rg >/dev/null 2>&1; then
  HAS_RG=1
fi

print_section() {
  printf '\n[%s]\n' "$1"
}

print_ok() {
  printf '%s\n' "$1"
}

print_fail() {
  printf 'ERROR: %s\n' "$1"
}

filter_paths_by_regex() {
  local pattern="$1"
  if [[ "$HAS_RG" -eq 1 ]]; then
    rg -n -- "$pattern" || true
  else
    grep -nE -- "$pattern" || true
  fi
}

gitignore_has_rule() {
  local rule="$1"
  if [[ "$HAS_RG" -eq 1 ]]; then
    rg -n -F -- "$rule" .gitignore >/dev/null 2>&1
  else
    grep -nF -- "$rule" .gitignore >/dev/null 2>&1
  fi
}

fail=0

print_section "Tracked files in HEAD"
tracked_matches="$(git ls-files | filter_paths_by_regex "$ARTIFACT_PATTERN")"
if [[ -n "$tracked_matches" ]]; then
  echo "$tracked_matches"
  print_fail "Private artifacts or local secrets are currently tracked in HEAD."
  fail=1
else
  print_ok "No private artifacts or local secrets are tracked in HEAD."
fi

print_section "Artifacts present in git history"
history_paths="$(git rev-list --objects --all | cut -d' ' -f2- | sed '/^$/d' || true)"
history_matches="$(printf '%s\n' "$history_paths" | filter_paths_by_regex "$ARTIFACT_PATTERN")"
if [[ -n "$history_matches" ]]; then
  echo "$history_matches"
  print_fail "Artifact-like paths were found in repository history."
  fail=1
else
  print_ok "No matching private artifact paths were found in repository history."
fi

print_section "Ignored-file policy"
missing_rules=0
for rule in "${REQUIRED_GITIGNORE_RULES[@]}"; do
  if gitignore_has_rule "$rule"; then
    printf 'present: %s\n' "$rule"
  else
    print_fail "Missing .gitignore rule: $rule"
    missing_rules=1
    fail=1
  fi
done

if [[ "$missing_rules" -eq 0 ]]; then
  print_ok "All required .gitignore rules are present."
fi

if [[ "$fail" -ne 0 ]]; then
  printf '\nAudit failed: private artifacts detected (or ignore policy incomplete).\n'
  exit 1
fi

printf '\nAudit passed: no private artifacts found in HEAD/history and ignore policy is present.\n'
