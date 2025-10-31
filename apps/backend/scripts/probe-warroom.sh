#!/usr/bin/env bash
set -euo pipefail

# ---- Config (override via env) ----
BASE_URL="${BASE_URL:-http://localhost:4000/api}"
EMAIL="${EMAIL:-mark@trevor.services}"
CID="${CID:?Set CID to a real campaign id}"

curlj() { curl -sS -H "x-user-email: $EMAIL" "$@"; }
say() { echo -e "\n▶ $*"; }

# ---- 0) Health ----
say "Health"
curlj "$BASE_URL/health" | jq '{ok, env}'

# ---- 1) Campaign core ----
say "Campaign"
curlj "$BASE_URL/campaigns/$CID" | jq '{ok, id: .campaign.id, status: .campaign.status, title: .campaign.title}'

# ---- 2) Gating ----
say "Gating"
curlj "$BASE_URL/campaigns/$CID/gating" | jq '{ok, mode, okGate: .ok, missing}'

# ---- 3) Routes ----
say "Routes"
curlj "$BASE_URL/campaigns/$CID/routes" | jq '{ok, count: (.routes|length)}'

# ---- 4) Framing snapshot ----
say "Framing snapshot"
curlj "$BASE_URL/campaigns/$CID/framing" | jq '{ok, has: (.framing != null), at: .framing.at}'

# ---- 5) Evaluation snapshot ----
say "Evaluation snapshot"
curlj "$BASE_URL/campaigns/$CID/evaluation" | jq '{ok, has: (.evaluation != null), at: .evaluation.at, routeCount: .evaluation.routeCount}'

# ---- 6) Saved Outputs (the list WarRoom renders) ----
say "Saved outputs (limit 50)"
OUTS_JSON="$(curlj "$BASE_URL/campaigns/$CID/outputs?limit=50")"
echo "$OUTS_JSON" | jq '{ok, count: (.outputs|length)}'
echo "$OUTS_JSON" | jq '.outputs[0:2] | map({id, action, createdAt, agent, role})'

# ---- 7) Cross-check via export route (this uses the export loader, not the outputs list) ----
say "Export cross-check (does export loader see messages?)"
# We won’t download files; just check status codes.
PDF_CODE=$(curl -s -o /dev/null -w "%{http_code}" -H "x-user-email: $EMAIL" "$BASE_URL/exports/pdf?campaignId=$CID")
DOCX_CODE=$(curl -s -o /dev/null -w "%{http_code}" -H "x-user-email: $EMAIL" "$BASE_URL/exports/docx?campaignId=$CID")
echo "PDF status:  $PDF_CODE"
echo "DOCX status: $DOCX_CODE"

# ---- 8) Optional: force an evaluation run to ensure a new AgentMessage exists, then re-check outputs ----
if [[ "${RUN_EVAL:-0}" == "1" ]]; then
  say "Run evaluation"
  curlj -X POST "$BASE_URL/campaigns/$CID/evaluate/run" | jq '{ok, delta: .deltaCount}'
  say "Saved outputs after evaluation (limit 50)"
  curlj "$BASE_URL/campaigns/$CID/outputs?limit=50" | jq '{ok, count: (.outputs|length)}'
fi

# ---- 9) Diagnostics summary ----
say "Diagnostics summary"
COUNT=$(echo "$OUTS_JSON" | jq '.outputs|length')
FRAMING_HAS=$(curlj "$BASE_URL/campaigns/$CID/framing" | jq -r '.framing != null')
EVAL_HAS=$(curlj "$BASE_URL/campaigns/$CID/evaluation" | jq -r '.evaluation != null')

if [[ "$COUNT" -eq 0 && ("$FRAMING_HAS" == "true" || "$EVAL_HAS" == "true") ]]; then
  echo "❗ Outputs list is empty but framing/evaluation exist."
  echo "   Likely cause: the /outputs endpoint filters more strictly than the export loader."
  echo "   Next step (no code change): run with RUN_EVAL=1 to confirm a fresh evaluation creates a visible output."
else
  echo "OK: outputs list appears consistent with snapshots."
fi
