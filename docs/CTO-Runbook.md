# Trudy v4 — CTO Runbook

This is the minimal, practical runbook to stand up, smoke-test, and operate Trudy v4.

---

## 0) Requirements

- Node 18+ (LTS)  
- A MySQL-compatible DB (PlanetScale/Vitess/MySQL 8). Dev default noted below.
- (Optional) OpenAI key for non-fake runs.

---

## 1) Environment Variables

Create `.env` at repo root:

```env
# --- Core ---
PORT=4000
DATABASE_URL="mysql://user:pass@127.0.0.1:3309/trudy"   # dev example

# --- Models ---
OPENAI_API_KEY=                                     # leave empty to run in fallback mode
TRUDY_SYNTH_MODEL=gpt-4o-mini                       # used by synthesis + parsers

# --- Feature flags ---
TRUDY_FAKE_RUNS=false                               # true => mock FRAMING/CREATE/EVALUATE/SYNTHESIS
TRUDY_PERSIST_ASK=true                              # store ask outputs in AgentMessage

# --- Frontend CORS ---
FRONTEND_ORIGIN=http://localhost:5173
EXTRA_CORS_ORIGINS=

Dev DB default (from code): 127.0.0.1:3309. Adjust as needed.

2) Database Notes

Tables referenced (Prisma):
Campaign, Brief, Narrative, IdeaRoute, PhaseRun, EvaluationDelta, AgentMessage, ShareLink.

Brief JSON columns: parsedJson, assets.

Snapshots live in brief.assets:

assets.lastLaunch = { at, phaseRuns, summary }

assets.synthesisLast = { at, text, meta, phaseRunId }

If schema drifts, FE still reads snapshots from brief.assets.*.

3) Start Services

Backend

# from apps/backend
npm i
npm run dev    # or your nodemon/tsx dev script
# server at http://localhost:4000/api/health


Frontend

# from apps/frontend
npm i
npm run dev    # typically Vite at :5173

4) Health & Smoke Tests (copy/paste)

Set an ID variable for reuse (replace with your real campaign id after create):

API=http://localhost:4000/api
CID=


Ping health

curl -s "$API/health" | jq


Create a campaign

curl -s -X POST "$API/campaigns" \
  -H 'Content-Type: application/json' \
  -d '{"clientId":"dev","title":"Demo Campaign","mode":"EVALUATION","market":"AU","category":"wine","brand":"Acme","mechanic":"Instant Win"}' | tee /tmp/create.json
CID=$(jq -r '.campaignId // .id' /tmp/create.json)
echo "CID=$CID"


Patch brief (minimal)

curl -s -X PATCH "$API/campaigns/$CID/brief" \
  -H 'Content-Type: application/json' \
  -d '{"parsedJson":{"brand":"Acme","category":"Wine","mechanic":"Instant Win"},"rawText":"Acme wine promo…"}' | jq


Ask (Brief)

curl -s -X POST "$API/campaigns/$CID/ask/brief" | jq '.result | {missingData, nQuestions: (.questions|length)}'


Launch

curl -s -X POST "$API/campaigns/$CID/launch" -H 'x-user-email: you@company.com' -d '{}' | jq


SSE Synthesis (debug mode)

curl -N "$API/synthesis?campaignId=$CID&debug=1"
# then verify snapshot:
curl -s "$API/campaigns/$CID" | jq '.campaign.brief.assets | {lastLaunch, synthesisLast}'


Exports

# PDF (writes file)
curl -s -X GET "$API/exports/pdf?campaignId=$CID" -o /tmp/trudy.pdf && ls -lh /tmp/trudy.pdf
# DOCX
curl -s -X GET "$API/exports/docx?campaignId=$CID" -o /tmp/trudy.docx && ls -lh /tmp/trudy.docx

5) Operator Cheatsheet
Launch Gate

Backend blocks Launch with BRIEF_INCOMPLETE until brand, category, mechanic exist.
FE Editor now shows a red banner with quick-save fields.

Ask (Brief) Hygiene

Server de-dupes & orders questions; marks required ones if core fields missing.
FE maps to labeled inputs with q.id as list keys (no React warnings).

Synthesis

GET /api/synthesis streams SSE; final JSON chunk includes cleaned HTML.

Backend persists:

Narrative.draftHtml

AgentMessage (audit; optional)

brief.assets.synthesisLast

PhaseRun(SYNTHESIS) → COMPLETE

FE WarRoom renders saved HTML directly and flips timeline green.

Exports

GET/POST /api/exports/pdf|docx

Uses Narrative.finalHtml || draftHtml || fallback HTML.

Fallback embeds Synthesis as HTML when available.

6) Common Failure Modes

CORS blocked: add your dev origin to FRONTEND_ORIGIN or EXTRA_CORS_ORIGINS.

Vitess JSON charset on brief patch: now mitigated via upsert + safe JSON; ensure no Buffer in JSON bodies.

Model unavailable: FAKE/fallback paths produce deterministic output; enable with TRUDY_FAKE_RUNS=true or omit OPENAI_API_KEY.

Narrative unique constraint: upsert used; confirm unique index is campaignId.

7) Endpoint Map (quick)

POST /api/campaigns • GET /api/campaigns • GET /api/campaigns/:id • GET /api/campaigns/:id/routes

PATCH /api/campaigns/:id/brief

POST /api/campaigns/:id/launch

POST /api/campaigns/:id/phaseRuns

POST /api/briefs/parse

POST /api/campaigns/:id/ask/brief

POST /api/campaigns/:id/ask/outputs

GET /api/synthesis (SSE)

GET|POST /api/exports/pdf

GET|POST /api/exports/docx

8) Production Flags

TRUDY_FAKE_RUNS=false

Provide a real OPENAI_API_KEY

Lock CORS to your real frontend origin

Harden auth middleware as needed

9) What “Good” Looks Like

WarRoom shows:

Phase timeline with SYNTHESIS green

Last launch summary populated

Routes rendered (Create) or Evaluation deltas (Evaluate)

Synthesis HTML present with timestamp/model

Editor:

No React key warnings

Assess & Question produces clean, grouped questions

Save required fields unblocks Launch

Exports: PDF & DOCX download with content

10) Triage Commands
# Show lastLaunch & synthesis snapshot quickly
curl -s "$API/campaigns/$CID" | jq '.campaign.brief.assets'

# Force a synthetic synthesis snapshot (if FE didn’t post it)
curl -s -X POST "$API/campaigns/$CID/phaseRuns" \
  -H 'Content-Type: application/json' \
  -d '{"phase":"SYNTHESIS","text":"<article><h2>Draft</h2><p>Test.</p></article>","meta":{"model":"debug"}}' | jq

