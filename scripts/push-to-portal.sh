#!/usr/bin/env bash
#
# push-to-portal.sh — Manually push intel JSON to the Trevor Staff Portal.
#
# Stopgap for the case where Cowork's sandbox can't reach the Vercel
# endpoint over HTTPS. Run this from your laptop after a Cowork task
# fires; it picks up the local JSON file and pushes it to the portal.
#
# Usage:
#   ./scripts/push-to-portal.sh <source>
#
# Where <source> is one of:
#   outcomes  →  <repo>/data/sf-campaign-outcomes.json
#   promos    →  ~/Documents/Claude/Scheduled/promo-monitor-fortnightly/baseline_promos.json
#   seo       →  ~/Documents/Claude/Scheduled/weekly-seo-deep-dive/seo-baseline-*.json (latest)
#   wine      →  ~/Documents/Claude/Scheduled/wine-promotional-landscape/wine-landscape-*.json (latest)
#   electrolux→  ~/Documents/Claude/Scheduled/electrolux-promo-landscape/electrolux-landscape-*.json (latest)
#   all       →  pushes every available source in sequence
#
# Requires: bash, curl, jq.
#
# Reads the push secret from:
#   ~/Documents/Claude/Scheduled/trevor-marketing-engine/.portal-push-secret
# (Same file Cowork's push step reads from — keeps a single source of truth.)
#

set -euo pipefail

PORTAL_URL="https://nebula-logger-dashboard.vercel.app/api/intel/push"
SECRET_FILE="$HOME/Documents/Claude/Scheduled/trevor-marketing-engine/.portal-push-secret"

# ── Resolve the trudy-v4 repo root regardless of where we're called from ───
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# ── Known source names — used to validate the CLI arg ─────────────────────
KNOWN_SOURCES=(outcomes promos seo wine electrolux)

is_known_source() {
  local source="$1"
  for s in "${KNOWN_SOURCES[@]}"; do
    [[ "$s" == "$source" ]] && return 0
  done
  return 1
}

# ── Source → file path lookup. Returns empty string when valid source has
#    no local file yet (caller distinguishes "skip" from "unknown" via
#    is_known_source). ───────────────────────────────────────────────────
file_for_source() {
  local source="$1"
  case "$source" in
    outcomes) echo "$REPO_ROOT/data/sf-campaign-outcomes.json" ;;
    promos)   echo "$HOME/Documents/Claude/Scheduled/promo-monitor-fortnightly/baseline_promos.json" ;;
    seo)      ls -t "$HOME/Documents/Claude/Scheduled/weekly-seo-deep-dive/"seo-baseline-*.json 2>/dev/null | head -n 1 ;;
    wine)     ls -t "$HOME/Documents/Claude/Scheduled/wine-promotional-landscape/"wine-landscape-*.json 2>/dev/null | head -n 1 ;;
    electrolux) ls -t "$HOME/Documents/Claude/Scheduled/electrolux-promo-landscape/"electrolux-landscape-*.json 2>/dev/null | head -n 1 ;;
    *)        echo "" ;;
  esac
}

# ── Pretty output helpers ─────────────────────────────────────────────────
ok()    { printf "\033[32m✓\033[0m %s\n" "$*"; }
warn()  { printf "\033[33m⚠\033[0m %s\n" "$*"; }
fail()  { printf "\033[31m✗\033[0m %s\n" "$*" >&2; }
info()  { printf "  %s\n" "$*"; }

# ── Validate environment ──────────────────────────────────────────────────
command -v jq >/dev/null   || { fail "jq not installed. brew install jq"; exit 2; }
command -v curl >/dev/null || { fail "curl not installed"; exit 2; }

if [[ ! -f "$SECRET_FILE" ]]; then
  fail "Push secret file not found: $SECRET_FILE"
  fail "Create it and paste the value of INTEL_PUSH_SECRET from Vercel."
  exit 2
fi

SECRET="$(cat "$SECRET_FILE" | tr -d '[:space:]')"
if [[ -z "$SECRET" || "$SECRET" == *"REPLACE_WITH"* ]]; then
  fail "Push secret looks like a placeholder. Fix: $SECRET_FILE"
  exit 2
fi

# ── Push one source ───────────────────────────────────────────────────────
push_one() {
  local source="$1"

  if ! is_known_source "$source"; then
    fail "[$source] Unknown source. Expected: ${KNOWN_SOURCES[*]}"
    return 1
  fi

  local file
  file="$(file_for_source "$source")"
  if [[ -z "$file" || ! -f "$file" ]]; then
    warn "[$source] No local file yet — skipping. (Cowork task hasn't fired locally?)"
    return 0
  fi

  local size_bytes
  size_bytes=$(wc -c < "$file" | tr -d ' ')
  info "[$source] pushing $file ($size_bytes bytes)"

  local payload
  if ! payload="$(jq -c --arg s "$source" '{source: $s, data: .}' "$file")"; then
    fail "[$source] Failed to build JSON payload (invalid source JSON?)"
    return 1
  fi

  local http_code
  local body_file
  body_file="$(mktemp)"
  trap 'rm -f "$body_file"' RETURN

  http_code=$(curl -sS -X POST "$PORTAL_URL" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $SECRET" \
    -d "$payload" \
    -o "$body_file" \
    -w "%{http_code}" \
    -m 60 \
    --connect-timeout 10) || {
      fail "[$source] curl failed (network / DNS / timeout)"
      return 1
    }

  if [[ "$http_code" == "200" ]]; then
    local updated_at
    updated_at=$(jq -r '.updatedAt // "unknown"' "$body_file" 2>/dev/null || echo "unknown")
    ok "[$source] HTTP 200 — pushed. updatedAt: $updated_at"
    return 0
  else
    fail "[$source] HTTP $http_code"
    info "Response body: $(cat "$body_file")"
    return 1
  fi
}

# ── Dispatch ──────────────────────────────────────────────────────────────
if [[ $# -lt 1 ]]; then
  cat >&2 <<EOF
usage: $0 <source>
sources: outcomes, promos, seo, wine, electrolux, all

example:
  $0 outcomes      # Push the SF campaign export
  $0 promos        # Push the latest Promo Monitor baseline
  $0 all           # Push every source that has a local file
EOF
  exit 1
fi

SOURCE_ARG="$1"

if [[ "$SOURCE_ARG" == "all" ]]; then
  any_failed=0
  for src in outcomes promos seo wine electrolux; do
    push_one "$src" || any_failed=1
  done
  exit "$any_failed"
else
  push_one "$SOURCE_ARG"
  exit "$?"
fi
