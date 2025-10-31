#!/usr/bin/env bash
set -euo pipefail

BASE="${BASE:-http://localhost:4000}"
API="$BASE/api"
JQ_BIN="${JQ:-jq}"

# Optional auth header (e.g. export AUTH="Bearer dev-token")
HDR=()
if [[ -n "${AUTH:-}" ]]; then
  HDR=(-H "Authorization: ${AUTH}")
fi

h() { echo -e "\n==> $*"; }
jqq() { if command -v "$JQ_BIN" >/dev/null 2>&1; then "$JQ_BIN" "$@"; else cat; fi; }

# curl wrapper (adds Authorization only if set)
ccurl() {
  if (( ${#HDR[@]} > 0 )); then curl -fsS "${HDR[@]}" "$@"; else curl -fsS "$@"; fi
}

# returns status on line 1, body on subsequent lines
ccurl_status() {
  local tmp; tmp="$(mktemp)"
  local code
  if (( ${#HDR[@]} > 0 )); then
    code="$(curl -sS "${HDR[@]}" -w '%{http_code}' "$@" -o "$tmp")"
  else
    code="$(curl -sS -w '%{http_code}' "$@" -o "$tmp")"
  fi
  echo "$code"
  cat "$tmp"
  rm -f "$tmp"
}

h "Health"
ccurl "$API/health" | jqq .

h "Create temp campaign"
resp="$(ccurl_status -X POST "$API/campaigns" \
  -H 'Content-Type: application/json' \
  -d '{"clientName":"Smoke","title":"SMOKE-TEST","market":"AU","category":"Test","status":"DRAFT","mode":"CREATE"}')"

CODE="$(printf '%s\n' "$resp" | sed -n '1p')"
BODY="$(printf '%s\n' "$resp" | sed -n '2,$p')"

echo "HTTP $CODE"
echo "$BODY" | jqq . || true

if [[ "$CODE" != "200" && "$CODE" != "201" ]]; then
  echo "❌ Create failed (HTTP $CODE). If you use auth, run: AUTH=\"Bearer dev-token\" pnpm -C apps/backend smoke"
  exit 1
fi

# Support both shapes: {campaign:{id}} OR {id}
CID="$(echo "$BODY" | jqq -r '(.campaign.id // .id // empty)')"
echo "CID=$CID"
if [[ -z "$CID" ]]; then
  echo "❌ No campaign.id found in response; body shown above."
  exit 1
fi

h "Put brief"
ccurl -X PUT "$API/campaigns/$CID/brief" \
  -H 'Content-Type: application/json' \
  -d '{"rawText":"Smoke brief: one purchase, on-pack QR, instant+weekly.","parsedJson":{"purchase":"ONE","activation":"on-pack QR","cadence":"instant + weekly"}}' \
| jqq '.brief | {hasRaw: (.rawText|length>0)}' >/dev/null

h "Get brief"
ccurl "$API/campaigns/$CID/brief" | jqq '.brief | {ok: (.rawText|length>0)}'

h "Outputs latest (may be empty but must 200)"
ccurl "$API/campaigns/$CID/outputs/latest" | jqq 'keys'

h "Create export (HTML only)"
ART_PATH=$(
  ccurl -X POST "$API/campaigns/$CID/exports" \
    -H 'Content-Type: application/json' \
    -d '{"format":"HTML","sections":{"brief":true,"framing":false,"evaluation":false,"ideas":false,"extras":[]},"theme":{"titleOverride":"Smoke Export","accent":"#0ea5e9"}}' \
  | jqq -r '.artifact.path'
)
echo "artifact.path: $ART_PATH"

REL="${ART_PATH#*storage/}"
URL="$API/files/$REL"

h "HEAD download $URL"
ccurl -I "$URL" | head -n1

h "List exports"
ccurl "$API/campaigns/$CID/exports" | jqq '.artifacts | length'

echo "✅ SMOKE OK (no LLM)"

if [[ "${SMOKE_LLM:-0}" == "1" ]]; then
  h "(LLM) Framing"
  ccurl -X POST "$API/campaigns/$CID/framing/run" | jqq '.content | (.|length>0)'

  h "(LLM) Evaluation"
  ccurl -X POST "$API/campaigns/$CID/evaluate/run" | jqq '.content | (.|length>0)'

  h "(LLM) Create"
  ccurl -X POST "$API/campaigns/$CID/create/run" \
    -H 'Content-Type: application/json' \
    -d '{"intensity":"DISRUPTIVE","count":3}' | jqq '.content | (.|length>0)'

  h "(LLM) Synthesis"
  ccurl -X POST "$API/campaigns/$CID/synthesis/run" | jqq '.content | (.|length>0)'

  echo "✅ SMOKE OK (LLM)"
fi
