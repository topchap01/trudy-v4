## Trudy v4 — Operate & Ship

This runbook replaces the legacy go-live notes. It reflects the current codebase:
- Node 20+, pnpm workspaces
- Backend: Express, Prisma, SQLite default (MySQL optional)
- Frontend: React + Vite
- OpenAI integrations wired through `lib/openai.ts` and orchestration modules

Use this document when standing up an environment, running smoke checks, or handing off to on-call.

---

### 1. Requirements

- Node.js 20+
- pnpm 8+ (or npm/yarn with matching commands)
- For local dev, no external DB required (ships with SQLite).  
  For prod, provision MySQL-compatible DB and update `DATABASE_URL`.
- Optional: OpenAI API key (runs in “fake” mode if absent).

---

### 2. Environment Configuration

#### Backend (`apps/backend/.env`)
```env
PORT=4000
NODE_ENV=development

# CORS
FRONTEND_ORIGIN=http://localhost:5173
# Optional: comma-separated extras
# EXTRA_CORS_ORIGINS=https://staging.trudy.app

# Database (local default)
DATABASE_URL="file:./dev.db"

# OpenAI (leave unset to run in TRUDY_FAKE_RUNS mode)
OPENAI_API_KEY=

# Model + feature flags
TRUDY_SYNTH_MODEL=gpt-4o-mini
MODEL_STRATEGIST=gpt-4o
TRUDY_FAKE_RUNS=false
TRUDY_PERSIST_ASK=true

# Logging knobs
TRUDY_TRACE=0
JUDGE_LLM_DEFAULT=0
```

For MySQL/PlanetScale replace `DATABASE_URL` accordingly, e.g.
`mysql://user:pass@host:3306/trudy?sslaccept=strict`.

#### Frontend (`apps/frontend/.env`)
```env
VITE_DEV_EMAIL=you@company.com
```
In dev the FE sends `x-user-email` from `localStorage.devEmail` or `VITE_DEV_EMAIL`. The backend stub auth reads this header.

---

### 3. Install & Boot

From repo root:
```bash
# Install deps
pnpm install

# Generate Prisma client (only needed after schema changes)
pnpm --filter apps/backend prisma generate

# Start backend (http://localhost:4000)
pnpm --filter apps/backend dev

# Start frontend (http://localhost:5173)
pnpm --filter apps/frontend dev
```

Health check:
```bash
curl -s http://localhost:4000/api/health | jq
# => { "ok": true, "ts": "..."}
```

---

### 4. Smoke Tests (API)

All calls assume `EMAIL=you@company.com` and `BASE=http://localhost:4000/api`.

```bash
EMAIL=you@company.com
BASE=http://localhost:4000/api
```

1. **Create campaign**
```bash
CID=$(curl -s -X POST "$BASE/campaigns" \
  -H "Content-Type: application/json" \
  -H "x-user-email: $EMAIL" \
  -d '{"title":"Demo Campaign","clientName":"ACME","mode":"EVALUATE","market":"AU","category":"wine"}' \
  | jq -r '.id // .campaignId')
echo "CID=$CID"
```

2. **Attach brief (structured + raw)**
```bash
curl -s -X PUT "$BASE/campaigns/$CID/brief" \
  -H "Content-Type: application/json" \
  -H "x-user-email: $EMAIL" \
  -d '{"parsedJson":{"brand":"ACME","mechanicOneLiner":"Instant win","retailers":["Coles","Woolworths"]},"rawText":"ACME campaign brief..."}' \
  | jq
```

3. **Run Framing → Evaluate → Create → Synthesis**
```bash
curl -s -X POST "$BASE/campaigns/$CID/framing/run"    -H "x-user-email: $EMAIL" | jq '.result // .'
curl -s -X POST "$BASE/campaigns/$CID/evaluate/run"   -H "x-user-email: $EMAIL" | jq '.result // .'
curl -s -X POST "$BASE/campaigns/$CID/create/run"     -H "x-user-email: $EMAIL" -d '{"intensity":"DISRUPTIVE","count":7}' | jq '.result // .'
curl -s -X POST "$BASE/campaigns/$CID/synthesis/run"  -H "x-user-email: $EMAIL" | jq '.result // .'
curl -s -X POST "$BASE/campaigns/$CID/strategist/run" -H "Content-Type: application/json" -H "x-user-email: $EMAIL" \
  -d '{"customPrompts":["What if we reward bundle purchases?"],"deepDive":true}' \
  | jq '.result // .'
```

4. **Opinion & Improvements (optional but part of War Room)**
```bash
curl -s -X POST "$BASE/campaigns/$CID/opinion/run"      -H "x-user-email: $EMAIL" | jq '.result // .'
```

5. **Latest outputs snapshot**
```bash
curl -s "$BASE/campaigns/$CID/outputs/latest" -H "x-user-email: $EMAIL" | jq '{framing, evaluation, synthesis, opinion, strategist}'
```

6. **Generate export artifacts**
```bash
curl -s -X POST "$BASE/campaigns/$CID/exports" \
  -H "Content-Type: application/json" \
  -H "x-user-email: $EMAIL" \
  -d '{"format":"BOTH","sections":{"evaluationScoreboard":true}}' | jq

# List stored artifacts
curl -s "$BASE/campaigns/$CID/exports" -H "x-user-email: $EMAIL" | jq '.artifacts[0]'

# Download the latest PDF/HTML via the secured files route (requires auth header)
ART=$(curl -s "$BASE/campaigns/$CID/exports" -H "x-user-email: $EMAIL" | jq -r '.artifacts[0].path')
curl -s "http://localhost:4000/api/files${ART#$(pwd)}" -H "x-user-email: $EMAIL" -o export.pdf
```
Artifacts live under `storage/exports/<campaignId>/`. The backend now serves `/api/files/**` through the auth middleware; the legacy `/files/**` route is intentionally removed.

---

### 5. War Room / Frontend Checklist

- Dashboard lists your campaign (ensure status, mode, market render).
- War Room sections populate after the runs above:
  - Brief editor shows parsed JSON.
  - Framing/Evaluate/Create/Synthesis tiles show latest narratives.
  - Opinion & Improvements populate when endpoints succeed.
- Export panel fetches `/api/campaigns/:id/exports` and allows download (uses `/api/files/...` links).
- “Ask Outputs” modal hits `/api/ask-outputs`.

If the frontend shows empty panes, confirm `/api/campaigns/:id/outputs/latest` returns populated fields.

---

### 6. Database Notes

- Default SQLite database file: `apps/backend/prisma/dev.db`.  
  Migrations live in `apps/backend/prisma/migrations/`.
- To switch to MySQL/PlanetScale:
  1. Update `DATABASE_URL` in `.env`.
  2. Run `pnpm --filter apps/backend prisma migrate deploy`.
  3. Remove/ignore the local `dev.db`.
- Tables in use: `Campaign`, `Brief`, `PhaseRun`, `AgentMessage`, `Output`, `ExportArtifact`, `IdeaRoute`, `HeuristicScore`.
- Orchestrator helpers (`phaseRunSafe`) expect Prisma enums `Phase` and `RunStatus`; ensure schema stays in sync.

---

### 7. Go-Live Checklist

- [ ] Environment variables set (backend & frontend), secrets stored outside VCS.
- [ ] Database migrated; Prisma client regenerated.
- [ ] OpenAI key configured (or `TRUDY_FAKE_RUNS=true` acknowledged).
- [ ] Smoke tests (sections 4.1–4.6) pass against the deployed environment.
- [ ] Exports pipeline verified (HTML + PDF written, retrievable via `/api/files/...`).
- [ ] Frontend build (`pnpm --filter apps/frontend build`) succeeds with environment flags.
- [ ] Monitoring/alerts pointed at `/api/health` and orchestrator error logs.

---

### 8. Troubleshooting

- **CORS errors:** ensure frontend origin is listed in `FRONTEND_ORIGIN` or `EXTRA_CORS_ORIGINS`.
- **Prisma connection errors (P1001):** adjust `DATABASE_URL`, confirm DB reachable. The `withDb` helper retries transient failures.
- **OpenAI timeouts:** set `TRUDY_FAKE_RUNS=true` for offline demo; otherwise confirm network access and API quota.
- **Exports missing:** check `storage/exports/<campaignId>` and the `/api/campaigns/:id/exports` response. Puppeteer requires Chrome or `PUPPETEER_EXECUTABLE_PATH`.
- **Auth:** backend trusts `x-user-email`. Production deployments must front this with a real auth proxy/identity provider.

---

Keep this file current whenever orchestration flows or API contracts change. A stale runbook is worse than none. Pull requests touching routing, exports, or envs should include a note if updates are required here.

Vitess JSON/charset: Always send real JSON (no Buffers). We use safe upserts and drop empty/nulls.

Duplicate route suspicion: If you also mount a legacy askBrief router defining /campaigns/:id/ask/brief, either:

remove it from server.ts, or

ensure the preferred implementation is mounted first.

OpenAI off: unset OPENAI_API_KEY and set TRUDY_FAKE_RUNS=true to run locally without model calls.

SSE not streaming: We disable compression for /api/synthesis. Ensure proxies/CDNs don’t buffer (set X-Accel-Buffering: no equivalent).

Local cache confusion: Clear localStorage key trudy:lastLaunch:<id>.

7) Go-Live Checklist (No Drift)

 /api/health returns ok:true on the target infra

 DB migrations/schema pulled (prisma generate, db pull if needed)

 Auth header path validated (or replace with real auth)

 Launch gating verified (missing fields blocked)

 FRAMING → CREATE/EVALUATE returns summary & snapshots brief.assets.lastLaunch

 Synthesis streams and persists HTML to brief.assets.synthesisLast

 Ask(Brief) hygiene verified (no dupes, required flags)

 Ask(Outputs) returns JSON that FE renders

 Exports (PDF/DOCX) download successfully

 CORS permits FE origin(s)

 Logs clean (no unhandled promise rejections)

 Backups/snapshots enabled for DB (if production)

8) Rollback Plan

Revert to last known good commit (tag a release before deploy).

Keep TRUDY_FAKE_RUNS=true as an emergency flag to keep UX paths working while disabling external model dependencies.

Preserve snapshots in brief.assets.* to avoid FE breakage even if tables drift.

9) Appendix — Useful Commands
# List campaigns
curl -s http://localhost:4000/api/campaigns | jq '.campaigns | length'

# Tail SSE (non-debug)
curl -N "http://localhost:4000/api/synthesis?campaignId=$CID"

# Patch minimal brief to unblock Launch
curl -s -X PATCH "http://localhost:4000/api/campaigns/$CID/brief" \
  -H "Content-Type: application/json" \
  -d '{"parsedJson":{"brand":"X","category":"Y","mechanic":"Instant Win"}}' | jq


— End —

---

### 6. Developer Utilities

Common workspace scripts now live at the repo root:

```bash
# Lint frontend (warnings only for legacy gaps)
pnpm lint

# Backend typecheck (tsc noEmit)
pnpm typecheck

# Backend smoke tests (includes auth + War Room probe)
pnpm smoke
pnpm smoke:warroom

# Rebuild prompt bundle (packages/prompts)
pnpm prompts:bundle
```

> Prompt strings remain centralised in `packages/prompts`. Update prompts there, run `pnpm prompts:bundle`, and commit the generated dist to keep the backend/CLI in sync.
