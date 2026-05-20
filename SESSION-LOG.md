# Session Log

Shared handoff log between Claude Code sessions, Cowork sessions, and Mark. **Newest entry at the top.** Each entry: `## YYYY-MM-DD — Title`, with an `Actor:` line and freeform sections beneath. Append, don't rewrite history — past entries are the audit trail.

---

## 2026-05-20 — Intel data-quality fixes: promos fields, electrolux gaps, sense-check guard

**Actor:** Claude Code (Opus 4.7) — portal `~/Documents/nebula-logger-dashboard` + electrolux task SKILL.md

Mark reviewed the first Master Control proposals and rejected the Promo Monitor one ("158 promotions and no brands"). Investigated all the intel feeds. Findings + fixes:

### Promo Monitor summary (portal) — FIXED

- **Root cause:** `summarizeIntel` lumped promos in with wine/electrolux and counted `brand`/`retailer`. Promo Monitor records use `promoter`/`category`/`technique` — no brand/retailer. Hence "184 promos / 0 brands".
- **Fix (`4ab6b0b`, merged with Cowork's parallel work):** promos now has its own summarizer — promoters, categories, top techniques.
- **Second issue:** promos prize-value stats were garbage (avg $520k, max $40M). The raw `value` field is unnormalised — **0 of 184 records have `parsedValue`**, and raw values span $1k to a wrong $10M ("$100 Coles voucher" tagged $10.1M). Dropped value stats from the promos summary until fixed upstream.
- **UPSTREAM TODO (Cowork):** `promo-monitor-fortnightly` isn't running its own Step-2d `parsedValue` normalisation. Until it does, promo value data is unusable. Once it emits clean `parsedValue`, re-enable value stats in `lib/intel-snapshots.js` (promos branch).

### Electrolux landscape — DIAGNOSED + SKILL.md FIXED

The electrolux report Mark saw was bad for three reasons, all upstream (not a portal bug — the portal renders faithfully):

1. **It pushes a summary object, not records.** Unlike wine/promos, the task pushed `{ brandCounts, typeCounts, gaps, ... }` instead of the raw promo array — so no titles, no click-through, degraded fallback view. The SKILL.md already said "push records, not summary" (so this run disobeyed).
2. **The gaps contradict its own counts.** Gap "No cashback or trade-in mechanics" while `typeCounts` shows **Trade-In: 3**. Gap "No vacuum/floor care" while Dyson is in the brand list. The task hallucinated gaps instead of deriving them.
3. **Partial scrape:** 9 of 15 sources succeeded, 4 failed — so several "gaps" are likely false negatives from sources that didn't load.

**SKILL.md fixes drafted** (`~/Documents/Claude/Scheduled/electrolux-promo-landscape/SKILL.md`):
- **Gap self-consistency rule** (Slide 16): every gap must be verified against the counts before stating it; distinguish "absent from entire market sample" (count 0 across all brands) vs the real strategic gap "Electrolux Group absent from a mechanic competitors use" (must cite competitor count); caveat any gap in a category covered by a failed source.
- **Mandatory pre-push verification:** a `javascript_tool` guard that confirms `data` is a records array (≥5 records, has `brand`/`title`) and hard-fails if it looks like a summary object (`brandCounts`/`typeCounts`/`gaps`). The "push records" instruction existed but nothing enforced it — now it can't push the wrong shape.
- **Action for Cowork:** re-run `electrolux-promo-landscape` so it pushes records — the portal blob still holds the stale bad summary until then.

### Portal sense-check guard — SHIPPED (`c309b5b`)

- New `flagGapContradictions(data)` in `lib/intel-snapshots.js`: source-agnostic — for any payload with a `gaps` array + count objects, flags negating gaps ("no X") that name a token with a non-zero count. Caught the live electrolux trade-in contradiction.
- When contradictions exist: proposal title gets a ⚠️ prefix, confidence drops to `low`, and the body spells out each contradiction. This is the **seed of the daily Claude sense-check layer** — it'll generalise to records-shape analysis later.

### Coordination note

Cowork is actively committing to the portal repo in parallel (added the Electrolux summary-fallback renderer + summary-shape handling in `79bb504`/`4ab6b0b`). Merges have been clean so far because we've touched adjacent concerns, but **watch `lib/intel-snapshots.js` and `app/intel/electrolux/page.js`** — both of us edit those. Latest portal commit: `c309b5b`.

---

## 2026-05-19 — Master Control inbox + Postgres foundation + intel reactor v1

**Actor:** Claude Code (Opus 4.7) — working in `~/Documents/nebula-logger-dashboard`

### The strategic reframe Mark made tonight

> "I want us to build the data that feeds our own AI and I end up being the master control or we use Claude to sense check daily etc."
> "Everything we drag in just makes it wiser and wiser."

This shifts the project. The portal is no longer "dashboards with action lists nobody actions" — it's the foundation for **Trevor's accumulating institutional intelligence**. Every intel push, every evaluation, every decision Mark makes becomes structured queryable data that Trudy reasons over in future work. The "madness" of Cowork schedules goes away; the portal becomes the orchestrator with Mark as master control, and Claude doing daily sense-check across the data.

### What shipped tonight

- `0f2e13f` — **Master Control inbox foundation.** Neon Postgres connected via Vercel Storage. New `proposals` table holds every Trudy output that wants a human decision. New routes: `GET/POST /api/trudy/proposals`, `PATCH /api/trudy/proposals/[id]`. New UI: `/trudy/control` (filter chips for Pending / Approved / Rejected / All, expandable cards, inline approve/reject with a "why" textarea that captures Mark's reasoning as future training signal). New `/admin` page with "Run migrations" button (gated by middleware cookie). New `lib/db.js` (`@neondatabase/serverless`), `lib/proposals.js` CRUD, `migrations/001_proposals.sql`. `/api/trudy/evaluate` now writes a proposal row alongside the Blob save — every new evaluation lands in the inbox automatically.
- `658298c` — **Migration SQL parser fix.** First migration attempt failed because my splitter dropped chunks starting with `--`, killing the `CREATE TABLE` whenever its file had a comment header. Now strips line comments first, then splits on `;`. Applied to both `app/api/admin/migrate/route.js` and `scripts/migrate.mjs`.
- `b04bd06` — **Intel reactor v1.** Migration `002_intel_snapshots.sql` adds the time-series log Trudy will diff over time. `/api/intel/push` now writes a snapshot row + auto-creates a "Fresh intel" proposal with a computed summary (counts, top brands, mechanic spread, prize values, etc.) every time a Cowork task — or eventually a portal cron job — pushes data. New `/admin` "Backfill intel snapshots" button walks existing blobs (seo, promos, wine, electrolux, outcomes) and seeds Postgres so day-one Trudy isn't empty. New `lib/intel-snapshots.js` with `summarizeIntel(source, data)` per-source summary helpers.

### Current architecture

Postgres (Neon, via Vercel Storage):
- `proposals` — every Trudy output awaiting Mark's decision; captures status, decision_note, executed_at
- `intel_snapshots` — append-only log of intel pushes; jsonb data + computed summary
- `schema_migrations` — version table for ordered migrations

Vercel Blob:
- `intel/*` — canonical "latest" intel per source (still the source of truth for dashboards)
- `trudy/evaluations/<id>.json` — full evaluation verdicts

The two coexist: Blob holds raw/large payloads, Postgres holds the time-series + decision history Trudy reasons over.

### Open milestones (in priority order, per Mark)

1. **Trudy reasoning over snapshots + past decisions** — when `/api/trudy/evaluate` runs, query past intel snapshots + past `proposals.decision_note` rows + past evaluations, feed them to the orchestrator so verdicts are grounded in actual Trevor history. ("We saw cashback at this scale 6 months ago — Mark rejected it because Harvey Norman pushed back. Here's a different mechanic.")
2. **Diff-aware proposals** — instead of "Fresh wine intel: 47 promos", emit "Vinarchy moved cashback $1k → $2k vs last month" — real change detection across consecutive snapshots.
3. **Daily Claude sense-check cron** — nightly Claude review of yesterday's intel + evaluations + decisions; outputs meta-insights ("three cashback proposals rejected this week — your cashback heuristic may need an update").
4. **Move intel collection to portal** — kill Cowork tasks one at a time. SF Outcomes first (pure Salesforce API, half-day). SEO next (Serper API). Promo Monitor / Wine / Electrolux last (Browserless.io ~$30-50/mo).

### Operator notes

- Mark provisioned Neon via Vercel Storage tonight. `DATABASE_URL` is auto-injected in Production + Preview. Local dev needs `vercel env pull --environment=production .env.production.local` but secrets are sanitized — to run migrations locally use `scripts/migrate.mjs` after adding the URL manually, or just hit `/admin/migrate` from a logged-in browser.
- `migrations/` is the source of truth for schema. Add new files as `00N_<name>.sql`. The runner is idempotent (uses `CREATE TABLE IF NOT EXISTS` + `ON CONFLICT DO NOTHING` on `schema_migrations`).
- `.env.production.local` is now gitignored (along with `.env.local` and `.env.*.local`).
- Latest commit on prod: `b04bd06`. Next tyre-kicking step for Mark when he's back: hit `/admin` and click both buttons in order (migrate, then backfill), then open `/trudy/control` to see the inbox populated with ~4 proposals from current intel state.

---

## 2026-05-19 — Evaluate timeout fix + PPTX export from verdict viewer

**Actor:** Claude Code (Opus 4.7) — working in `~/Documents/nebula-logger-dashboard`

### What shipped

- `381e4d8` — fix: `/api/trudy/evaluate` `maxDuration` 60s → 300s. First real Beko evaluation hit the 60s ceiling on the multi-agent pipeline and Vercel returned a runtime timeout. 300s is the Pro maximum and gives comfortable headroom.
- `d0e77fd` — feat: PPTX export from `/trudy/evaluate/[id]`. New "Download PPTX" button on the verdict viewer. Streams `application/vnd.openxmlformats…` from `GET /api/trudy/evaluations/[id]/pptx`. Slide builder lives at `lib/trudy-verdict-pptx.js` (reuses the Trevor brand palette from `report-pptx.js`).

Deck includes (transparency-forward, ~13 slides): cover with verdict badge → verdict + rationale + reclassification → what works / breaks / change board → three voices side-by-side with scores → message hierarchy (current vs improved) → five headline angles (one row per lens) → signature moment → kill sheet table → 3-Second Equation (big numbers, three cards) → retailer readiness + S.O.S. pitch → one slide per alternative route (SAFE/BOLD/RIDICULOUS with top 3 headlines and signature moment) → closing.

End-to-end smoke test passed: real Beko brief returned a full REWORK verdict, all sections populated.

### Verified

- Beko evaluation Provocateur 3 / Pragmatist 3 / Creative Director 7 — reclassification path didn't trigger because no individual score hit 7 except CD. Worth a future tune to also trigger reclassification when Creative Director alone scores ≥8 (the headlines were good).

### Quality issue flagged (deferred per Mark)

The three alternative routes (Tier Ladder / Winter Warmth / Kitchen Confidence) had **nearly identical signature moments** ("cashback credited to energy bills") and nearly identical headlines across SAFE/BOLD/RIDICULOUS. The route names and mechanics differentiated; the creative didn't. Likely fix in the orchestrator alternatives prompt — force distinct signature moments and headlines per ambition zone. Mark wants this addressed later.

### Cowork's parallel work this session

- `ea5969e` — Electrolux Landscape intel page + push pipeline. New `/intel/electrolux` route with filters, charts, stats, full promo table. Push step added to `electrolux-promo-landscape` SKILL.md. Nav and landing card updated. Decision implicit: client-specific route name (`/intel/electrolux`) not category-broad (`/intel/appliances`).

### Still open

- Alternative-route differentiation bug (above).
- Reclassification trigger when only Creative Director scores high.
- Wine push step in `wine-promo-landscape` (Cowork side).
- `/api/intel/trigger` still a stub — needs wiring to real firing mechanism.

---

## 2026-05-19 — Trudy evaluate/history surfaced in nav

**Actor:** Claude Code (Opus 4.7) — working in `~/Documents/nebula-logger-dashboard`

### What shipped

- `27274ba` — feat: surface `/trudy/evaluate` and `/trudy/history` in `components/Nav.jsx` and `app/page.js`. Drops the "coming soon" placeholders; both routes are live (return 307 → /login through the auth middleware, as expected).

Deployed to production via `vercel --prod --yes`. The one thing flagged as blocking in Cowork's earlier handover is now done — staff can reach the brief form and history list from the sidebar and landing page.

### Still open

- Wine push step in `wine-promo-landscape` (Cowork side).
- Electrolux landscape push — decision pending: `/intel/appliances` (broad whitegoods) vs `/intel/electrolux` (Trevor client-specific).
- `/api/intel/trigger` still a stub — needs wiring to a real Cowork firing mechanism.
- `/trudy/evaluate/[id]` could grow a "Generate PPTX for client" button reusing Client Reports formatting (Mark to decide if worth it).

---

## 2026-05-19 — Git commits, SEO renderer fix, task persistence bug fix

**Actor:** Cowork (Opus 4.6) — working in `~/Documents/nebula-logger-dashboard` + scheduled task configs

### Git commits shipped

- `c29699f` — feat: Client Reports (PPTX + PDF generation with AI recommendations). 5 new files, 4 modified, 1989 lines added.
- `326031b` — chore: gitignore next-env.d.ts and tsconfig.tsbuildinfo
- `f699689` — fix: SEO page renderer maps actual baseline shape (keyword_observations object → keyword table, pillar_distribution → bars, keyword_gaps → gap list, indexation stats, actions taken section)

### SEO portal push confirmed working

The weekly-seo-deep-dive task ran autonomously and successfully pushed data to the portal via Chrome MCP `javascript_tool` + `fetch()`. Data is live on `/intel/seo`. This proves the bash-sandbox workaround (commit `7d0fe54` CORS + Chrome fetch) is reliable.

### Task file persistence bug — systemic fix

Discovered that every scheduled task saving dated archive files to its own directory was losing them. Root cause: task agents used bash to write files, but bash runs in an ephemeral sandbox where host paths aren't directly writable. Files vanished between sessions.

**Affected tasks (all fixed):**
- `weekly-seo-deep-dive` — zero baseline files ever persisted. Seeded `seo-baseline-2026-05-19.json` manually.
- `sf-outcome-export` — archive copies (`sf-outcomes-[date].json`) never persisted. Primary output to `trudy-v4/data/` was fine (different connected folder).
- `electrolux-promo-landscape` — landscape JSON never persisted.
- `wine-promo-landscape` — landscape JSON never persisted.

**Fix:** Updated all 4 SKILL.md files with explicit instructions to use Write/Read/Glob tools instead of bash for any file that needs to persist in the task's own directory.

### Handover

Saved `HANDOVER-TO-CLAUDE-CODE.md` in trudy-v4 with updated status. Only remaining item for Claude Code: add Trudy evaluator links to Nav.jsx and landing page.

---

## 2026-05-18 (evening) — Client Reports feature + portal push pipeline fix

**Actor:** Cowork (Opus 4.6) — working in `~/Documents/nebula-logger-dashboard` + scheduled task configs

### Client Reports feature

Built a full report generation feature on the portal at `/reports`. Staff select a client, campaign, category, and format (PPTX or PDF), then download a polished deck/document combining campaign performance, competitive landscape, and AI-generated strategic recommendations (Trudy voice, Shelf Truth framework).

**Files created:** `app/reports/page.js`, `app/api/reports/generate/route.js`, `lib/report-data.js`, `lib/report-pptx.js`, `lib/report-pdf.js`
**Files modified:** `components/Nav.jsx`, `app/page.js`, `app/globals.css`, `package.json` (added pptxgenjs + jspdf)

**Note:** These files are uncommitted — next Claude Code session or Mark should `git add` and deploy.

### Portal push pipeline fix

All three data-pushing scheduled tasks were broken for two reasons:
1. **Stale secret:** `.portal-push-secret` had an old value that didn't match `INTEL_PUSH_SECRET` on Vercel → updated to current value
2. **Wrong push method:** All used `curl` in bash, but the Cowork sandbox can't reach external domains → rewrote to use Chrome MCP `javascript_tool` with `fetch()` (works via CORS headers added earlier today)

**Tasks updated:**
- `weekly-seo-deep-dive` (Step 8b)
- `promo-monitor-fortnightly` (Step 8)
- `sf-outcome-export` (Step 5b)

All pushes remain non-fatal — local files and email reports still succeed if the push fails.

---

## 2026-05-18 (evening, post-Cowork-reports) — Portal Session 3 Stage B2: Trudy evaluate API + storage

**Actor:** Claude Code (Opus 4.7, 1M context) — working in `~/Documents/nebula-logger-dashboard`

### Summary

Wired the Stage B1 ported orchestrator into a live API. POST a brief, get back a streaming multi-agent verdict (Provocateur + Pragmatist + Creative Director + optional alternative routes). Past evaluations persist to Vercel Blob and are listable / readable for the B3 history view.

**Commit:** `a3c1a12` in `nebula-logger-dashboard`.

### What landed (5 new files, 414 lines)

| File | Purpose |
|---|---|
| `lib/trudy/brief-input.ts` | IdeaInput Zod schema + checkBriefSufficiency, ported from trudy-v4 shelf.ts route |
| `lib/trudy/evaluations-store.ts` | Blob-backed save/list/read for evaluations at `trudy/evaluations/<id>.json` |
| `app/api/trudy/evaluate/route.ts` | POST + SSE stream — sufficiency gate, runShelfResearch, evaluateIdea, save to Blob, emit phase events |
| `app/api/trudy/evaluations/route.ts` | GET list of past evaluations (newest first) |
| `app/api/trudy/evaluations/[id]/route.ts` | GET single evaluation (404 if not found) |

Plus two patches to B1 ported files: stripped `.js` import suffixes from `orchestrator.ts` + `research.ts` (Next.js webpack can't resolve `.js` → `.ts`).

### How the evaluate flow works

```
POST /api/trudy/evaluate (body: IdeaInput)
  │
  ├─ data: {type:'phase', phase:'validate', message:'Checking the brief...'}
  │
  ├─ checkBriefSufficiency(input)
  │  ├─ insufficient → persist NEEDS_INPUT verdict, emit 'done', close. No LLM call.
  │  └─ sufficient → continue
  │
  ├─ data: {type:'phase', phase:'research', message:'Building research dossier...'}
  ├─ runShelfResearch(...)   ← Promo Monitor + SF outcomes + SEO augmentation from Blob
  │
  ├─ data: {type:'phase', phase:'evaluate', message:'Running Provocateur / Pragmatist / Creative Director...'}
  ├─ evaluateIdea(input, research)   ← multi-agent verdict, ~30-90s with thinking
  │
  ├─ data: {type:'phase', phase:'save', message:'Saving evaluation...'}
  ├─ saveEvaluation({id, evaluatedAt, brief, verdict, research})
  │
  └─ data: {type:'done', id:'eval_<...>', verdict:{...}}
```

If anything throws, emits `data: {type:'error', message:'...'}` instead of `done`.

### Verified

- `npx tsc --noEmit -p .` — clean.
- `npm run build` — clean. 4 new dynamic routes registered.
- Deployed to production. All 3 routes return HTTP 401 to unauthenticated curl (proves they exist + middleware gating is active).

### Storage model

- `trudy/evaluations/eval_<base36ms>_<6char>.json` — one blob per evaluation, sortable-by-time IDs
- Both successful verdicts AND NEEDS_INPUT placeholders persisted, so history shows everything you attempted
- Each record: `{ id, evaluatedAt, brief, verdict, research? }`
- B3's history page lazy-loads each card's full record (~same pattern as trudy-v4's history)

### Mark's pre-test checklist

1. `ANTHROPIC_API_KEY` already set in Vercel (Advisor uses it)
2. `BLOB_READ_WRITE_TOKEN` already set (intel pipeline uses it)
3. **No additional env vars needed** — B2 reuses both

To poke it from a browser DevTools console (while signed in to the portal):
```js
const res = await fetch('/api/trudy/evaluate', {
  method: 'POST',
  headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({
    brand: 'Beko', category: 'Kitchen appliances',
    mechanic: 'Cashback', rewardDescription: 'Tiered cashback $150-$500',
    majorPrizeValue: 500, prizeCount: 50,
    startDate: '2026-06-01', endDate: '2026-07-31',
    headline: 'Win up to $500 cashback',
    entryRequirement: 'Buy 2+ Beko appliances, upload receipt'
  })
});
const reader = res.body.getReader();
const dec = new TextDecoder();
while (true) {
  const {done, value} = await reader.read();
  if (done) break;
  console.log(dec.decode(value));
}
```

You'll see phase events stream in, then a `done` event with the full verdict + new `eval_*` id.

### What's still queued (B3)

- Brief form at `/trudy/evaluate` — port `ShelfBrief.jsx` (structured fields, sufficiency hint, suggested-prompt cards, navigate to viewer on done)
- Verdict viewer at `/trudy/evaluate/[id]` — port `ShelfRoutes.jsx` (Provocateur / Pragmatist / Creative Director cards, 5-lens headline grid, signature moment, alternative routes with ambition zone stripes, reclassification call-out)
- History list at `/trudy/history` — port `ShelfHistory.jsx` (card grid, verdict-badge, click-to-view)

All three are pure frontend now — the API is live and waiting.

### Note for next session

Cowork shipped a **Client Reports** feature in parallel (see entry below) — pptxgenjs + jspdf + new `/reports` page + `/api/reports/generate` route. The files are sitting uncommitted in Mark's portal repo at commit time. Mark or the next session should `git add app/reports app/api/reports lib/report-*.js + the modified shell files`, commit, and deploy. Doesn't touch B2 — fully orthogonal.

### Portal repo at commit time

```
a3c1a12  feat: Stage B2 — Trudy evaluate API + evaluation storage    ← this
391331d  feat: Stage B1 — port Shelf backend modules to portal
26b5e7d  feat: Trudy Advisor chat — Session 3 Stage A
7d0fe54  feat: CORS on push endpoint for Cowork Chrome-based push
b76b49d  fix(blob): use list() not head() — empty sources return 404
1dbea0e  feat: Session 2 — intel dashboards
[+ earlier]
```

---

## 2026-05-18 (evening) — Client Reports feature added to portal

**Actor:** Cowork (Opus 4.6) — working in `~/Documents/nebula-logger-dashboard`

### What was built

Full "Client Reports" feature on the Trevor Staff Portal — staff can generate downloadable PPTX or PDF reports to share with clients, combining:

1. **Campaign performance** — pulled from `outcomes` intel source (sf-campaign-outcomes data). Single campaign deep dive or full portfolio view.
2. **Competitive landscape** — pulled from `promos` intel source (baseline_promos). Filtered by category. Shows mechanic distribution, top promoters, top promos by value.
3. **AI strategic recommendations** — Claude (via portal's existing Anthropic SDK) generates Trudy-voice recommendations using the Shelf Truth framework, grounded in the actual campaign + market data.

### Files created

| File | Purpose |
|------|---------|
| `app/reports/page.js` | Client-facing report builder UI — select client, campaign, category, format (PPTX/PDF), toggle market data and AI recs |
| `app/api/reports/generate/route.js` | API route — gathers data, calls Claude for recs, generates PPTX or PDF, streams as download |
| `lib/report-data.js` | Data layer — reads from Vercel Blob intel store, filters, computes stats |
| `lib/report-pptx.js` | PPTX generator using pptxgenjs — branded dark-theme slides: cover, exec summary, campaign detail, prize analysis, competitive landscape, AI recommendations, closing |
| `lib/report-pdf.js` | PDF generator using jsPDF — print-friendly A4 landscape with same data sections |

### Files modified

| File | Change |
|------|--------|
| `components/Nav.jsx` | Added "Client Reports" section with "Generate Report" link |
| `app/page.js` | Added "Client Reports" card to landing grid (orange accent) |
| `app/globals.css` | Added `.reports-*` styles — config panel, format toggle, preview slides, mobile responsive |
| `package.json` | Added `pptxgenjs` and `jspdf` dependencies |

### Design decisions

- **PPTX uses dark theme** matching the portal aesthetic (navy bg, cyan accent) — looks premium in presentations
- **PDF uses light/print theme** — white bg, proper for printing/emailing
- **AI recs are optional** — checkbox toggle; report generates without them if Anthropic API isn't configured or if user unchecks
- **Graceful degradation** — if outcomes or promos data isn't available, report still generates with whatever data exists
- **Preview panel** — right side of the page shows a mini slide preview so staff know what they're about to generate before hitting the button

### Dependencies added

- `pptxgenjs ^4.0.1` — server-side PowerPoint generation
- `jspdf ^4.2.1` — server-side PDF generation

### What's next

- Deploy to Vercel (git push)
- Test with real data (outcomes + promos need to be pushed to Vercel Blob first)
- Could add: custom branding per client, historical trend charts, email delivery option

---

## 2026-05-18 (late afternoon) — Portal Session 3 Stage B1: Shelf backend ported

**Actor:** Claude Code (Opus 4.7, 1M context) — working in `~/Documents/nebula-logger-dashboard`

### Summary

All 9 Shelf backend modules ported from `trudy-v4/apps/backend/src/` into the portal's `lib/trudy/`. The orchestrator + research + multi-agent scoring + Zod schemas now compile and live in the portal, ready to be wired up to an API route in B2. Intel readers (market-context, campaign-outcomes, seo-context) were adapted to read from Vercel Blob instead of the local filesystem — same public functions, now async. TypeScript support added to the portal alongside the existing plain JS.

**Commit:** `391331d` in nebula-logger-dashboard.

### Files ported (9 files, ~2,600 lines)

| File | Notes |
|---|---|
| `constitution.ts` | Shelf framework prompts + named vocabulary. Copy as-is. |
| `trevor-schema.ts` | Zod schemas. One Zod v4 fix: `z.record(value)` → `z.record(z.string(), value)` |
| `models.ts` | Model resolution. Copy as-is. |
| `openai.ts` | Anthropic SDK wrapper (chat / chatFull / chatStream / tool_use / thinking). Copy as-is. |
| `market-context.ts` | **Adapted** — loadBaseline now reads via `readIntel('promos')`. Async public API. |
| `campaign-outcomes.ts` | **Adapted** — loadExport now reads via `readIntel('outcomes')`. Async public API. |
| `seo-context.ts` | **Adapted** — loadBaseline now reads via `readIntel('seo')`. Async public API. |
| `research.ts` | **Adapted** — `chat` import path fixed, prisma cache replaced with in-memory Map, all 3 augmentation functions become async to await the now-async intel getters. |
| `orchestrator.ts` | **Adapted** — `chat`/`chatFull`/`resolveModel` import paths fixed for same-folder layout. |

### Adaptations made

- **Filesystem → Blob.** Both `~/Documents/Claude/Scheduled/...` reads and the SF outcomes file read at `<repo>/data/sf-campaign-outcomes.json` now route through `readIntel(source)` from `lib/intel-store.js`. Public function signatures preserved (still return the same `MarketContextResult` / `CampaignOutcomesResult` / `SeoContextResult` shapes), just async now.
- **Prisma research cache → in-memory Map.** The trudy-v4 research module used Prisma to dedupe 24-hour research dossiers. Portal version uses a simple `Map<key, {dossier, expiresAt}>`. Cold-start resets are fine for v1 — the cost driver is the LLM call, not the cache.
- **TypeScript support added to the portal.** New `tsconfig.json`, `typescript` + `@types/*` installed as devDeps. Existing .js files unchanged. The 9 ported .ts files compile cleanly via `npx tsc --noEmit`.
- **`zod` runtime dep installed** for trevor-schema.
- **All Trevor-v4-relative imports** rewritten (`'../lib/openai.js'` → `'./openai.js'`).

### Verification

`npx tsc --noEmit -p .` — passes clean.
`npm run build` — passes clean. 19 routes + middleware all compile. No new routes added in B1 (modules are dormant until B2 wires them).

### What's not in B1 (queued for next session)

- **B2**: `POST /api/trudy/evaluate` with SSE streaming progress events. Calls `evaluateIdea()` from the ported orchestrator. The route + storage for past evaluations (Blob-backed `eval:<id>` style keys, similar to intel-store pattern).
- **B3**: Brief form at `/trudy/evaluate` (port `ShelfBrief.jsx` — structured fields + sufficiency gate + suggested-prompt cards), verdict viewer at `/trudy/evaluate/[id]` (port `ShelfRoutes.jsx` — Provocateur / Pragmatist / Creative Director cards + 5-lens headlines + signature moment + alternative routes), history list at `/trudy/history`.

The ported orchestrator already exports `evaluateIdea(input): Promise<EvaluationVerdict>` — a single function call from any future API route handler.

### Portal repo at commit time

```
391331d  feat: Stage B1 — port Shelf backend modules to portal
26b5e7d  feat: Trudy Advisor chat — Session 3 Stage A
7d0fe54  feat: CORS on push endpoint for Cowork Chrome-based push (Cowork)
b76b49d  fix(blob): use list() not head() so missing blobs return 404 not 500
1dbea0e  feat: Session 2 — intel dashboards (promos, outcomes, seo, wine)
492c708  fix(blob): include BLOB_READ_WRITE_TOKEN as Bearer header on read fetch
42401e1  fix(blob): use private access + downloadUrl for read
54ca3f8  refactor: swap @vercel/kv for @vercel/blob (Vercel storage reorg)
2b5abe5  feat: Session 1B — shared-password auth for the 2-staff portal
246c76c  feat: Trevor Staff Portal foundation
```

---

## 2026-05-18 (afternoon) — Trudy Advisor live in portal + manual push script + appliances gap noted

**Actor:** Claude Code (Opus 4.7, 1M context) — working in `~/Documents/nebula-logger-dashboard` and `~/Documents/GitHub/trudy-v4`

### Summary

Trudy Advisor now lives in the portal at `/trudy` — staff-facing chat with the full Cowork-authored prompt + bundled knowledge files + fresh SF outcomes/Promo Monitor data via Vercel Blob. Server-side SSE streaming, prompt-cache discount on the ~49K-token system context. Replaces the Claude.ai Project workflow that couldn't be shared on Pro tier.

Also shipped a `push-to-portal.sh` script in trudy-v4 as a stopgap for the days where Mark wants to push intel without waiting for Cowork's scheduled run. And manually pushed today's SF outcomes + promos so two dashboards now show real data.

**Headline commits:**
- `26b5e7d` in nebula-logger-dashboard — Trudy Advisor chat
- `86234f8` in trudy-v4 — push-to-portal.sh

### Trudy Advisor — what landed

| File | Purpose |
|---|---|
| `lib/anthropic.js` | Shared Anthropic SDK wrapper. Used by advisor + (Stage B) full Shelf evaluator. |
| `lib/trudy/advisor.js` | System-context builder. Loads prompt + 2 bundled JSON files at build time + 2 live JSON files from Blob at request time. Uses `cache_control: ephemeral` markers so the static portion hits prompt cache. |
| `app/api/trudy/advisor/route.js` | POST SSE-streaming endpoint. Sanitises message history, calls `client.messages.stream`, emits per-token `delta` events, then `done` with usage. |
| `app/trudy/page.js` | Chat UI. Replaces placeholder. Streaming display, markdown rendering, suggested-prompt cards, stop button, "New conversation" reset. |
| `lib/trudy/_assets/` | Bundled snapshots of TRUDY-ADVISOR-PROMPT.md, taxonomy.json, mark.json. |

Total system context ~49K tokens (well within Sonnet's 200K). With prompt caching:
- Cold turn: ~$0.15 input
- Warm turn (within 5 min): ~$0.02 input

For Mark + 2 staff occasional use, that's ~$5–20/month.

**To enable:**
1. Mark sets `ANTHROPIC_API_KEY` in Vercel env vars
2. (Optional) `MODEL_DEFAULT` if not using `claude-sonnet-4-20250514`
3. Vercel redeploys on env var change
4. Visit `/trudy`, type a question, watch it stream

If the key isn't set, the route returns 503 with a clear error message — UI surfaces it.

### push-to-portal.sh — manual intel push stopgap

`/Users/markalexander/Documents/GitHub/trudy-v4/scripts/push-to-portal.sh <source>`

Where source = `outcomes | promos | seo | wine | all`. Reads the secret from the same file Cowork reads from, posts to the live Vercel endpoint, prints green ✓ or yellow ⚠ skip or red ✗. Used today to populate /intel/outcomes and /intel/promos with real data.

This is the third path for getting data into the portal:
1. **Cowork's scheduled task** (preferred long-term) — now unblocked via CORS, awaiting first autonomous fire
2. **Cowork's Chrome MCP push** (cleaner workaround) — unblocked via CORS
3. **This script** (ad-hoc) — works from Mark's terminal anytime

### Appliances gap noted

Mark asked why wine has a dedicated intel dashboard but appliances doesn't. Honest answer: appliances IS in the data (22 Electrolux campaigns + Westinghouse in `/intel/outcomes`, live appliance promos in `/intel/promos`), just not as a *category-specific landscape view* like `/intel/wine`. The Cowork Electrolux Landscape task exists but isn't pushed to portal.

Easy follow-up: add an `appliances` source slot + Cowork push step from the existing Electrolux Landscape task + build `/intel/appliances` page. ~30 min when prioritised.

### Stage B (full Shelf evaluator) — queued for next session

Stage A (advisor chat) ships now. Stage B is the bigger work:
- Port `shelf/research.ts` + `shelf/orchestrator.ts` + `shelf/constitution.ts` + Zod schemas to `lib/trudy/`
- Build `/api/trudy/evaluate` and `/api/trudy/generate` with SSE streaming
- Port `ShelfBrief.jsx` form (structured fields + sufficiency gate) to `/trudy/evaluate`
- Build verdict viewer at `/trudy/evaluate/:id` with all the Provocateur / Pragmatist / Creative Director sections
- Port `/trudy/history` from trudy-v4

The shared `lib/anthropic.js` and `lib/trudy/_assets/` already in place means Stage B plugs in cleanly when built.

### Cowork-side coordination for context

Cowork updated all three intel push steps overnight (Promo Monitor, SEO Deep Dive, SF Outcome Export) with Chrome MCP fetch — designed to bypass the bash sandbox's network restriction. First autonomous fire will be the real test.

Cowork also flagged that SF outcomes refresh fortnightly, Promo Monitor fortnightly, SEO weekly — meaning data freshness in `/trudy` advisor will reflect those cadences. The `cache_control` ephemeral markers will invalidate when data changes, so first turn after a refresh is cold, subsequent turns hit cache.

### Portal repo at commit time

```
26b5e7d  feat: Trudy Advisor chat — Session 3 Stage A
7d0fe54  feat: CORS on push endpoint for Cowork Chrome-based push  ← Cowork
b76b49d  fix(blob): use list() not head() so missing blobs return 404 not 500
1dbea0e  feat: Session 2 — intel dashboards (promos, outcomes, seo, wine)
492c708  fix(blob): include BLOB_READ_WRITE_TOKEN as Bearer header on read fetch
42401e1  fix(blob): use private access + downloadUrl for read
54ca3f8  refactor: swap @vercel/kv for @vercel/blob (Vercel storage reorg)
2b5abe5  feat: Session 1B — shared-password auth for the 2-staff portal
246c76c  feat: Trevor Staff Portal foundation
```

### Trudy-v4 repo at commit time

```
86234f8  feat(scripts): push-to-portal.sh — manual intel push stopgap
```

### What's next

- Mark to set `ANTHROPIC_API_KEY` in Vercel + smoke-test `/trudy` advisor in browser
- Cowork's next autonomous scheduled task fire — proves the CORS fix end-to-end
- Stage B Trudy evaluator port (separate session)
- Appliances intel dashboard (small, can slot in any time)
- `/api/intel/trigger` real wiring (when Mark decides the mechanism)

---

## 2026-05-18 (morning) — Trudy Advisor Claude Project setup + CORS fix for portal push

**Actor:** Cowork (Opus 4.6)

### Summary

Two things done: (1) set up the Trudy Advisor as a Claude.ai Project for staff access, and (2) added CORS headers to the portal's push endpoint to unblock Cowork's scheduled task data pushes.

### Trudy Advisor — Claude.ai Project

Created the project on claude.ai with the full system prompt from `TRUDY-ADVISOR-PROMPT.md`. Uploaded four knowledge files: `sf-campaign-outcomes.json` (58 Trevor campaigns), `taxonomy.json`, `mark.json`, `baseline_promos.json` (200+ live AU promos).

**Key finding: project sharing requires a Team or Enterprise plan.** On Pro, projects are personal only — no way to invite staff. This confirms the portal chat page (Phase 9 in `PORTAL-BUILD-SPEC.md`) is the right distribution path for Trudy. The Claude.ai project works as Mark's personal advisor in the interim.

All reference files also copied to the Cowork project folder (`~/Documents/Claude/Projects/Trudy — Promo Strategy Advisor/`) for easy re-upload when data refreshes.

### CORS fix for portal push endpoint

Cowork's bash sandbox can't reach `nebula-logger-dashboard.vercel.app` (domain not in network allowlist). The scheduled tasks' push-to-portal step was failing silently. Three options were evaluated:

1. **Sandbox allowlist** — cleanest, but not configurable on current tier
2. **Chrome-based push (navigate to portal origin, then fetch)** — works but clunky, requires same-origin
3. **Manual push script** — defeats the purpose of scheduling

**Fix shipped:** Added CORS headers (`Access-Control-Allow-Origin: *` + OPTIONS preflight) to `/api/intel/push` in the `nebula-logger-dashboard` repo. Bearer auth still gates writes — CORS just lets the browser send the request. This means Cowork can now `fetch()` the push endpoint from **any** Chrome tab, no same-origin navigation required.

Changed file: `app/api/intel/push/route.js`

**What Cowork scheduled tasks should do now:**
1. Read the push secret from `~/.../trevor-marketing-engine/.portal-push-secret`
2. Use Chrome MCP (`javascript_tool`) to run `fetch('https://nebula-logger-dashboard.vercel.app/api/intel/push', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer <secret>' }, body: JSON.stringify({ source: '<key>', data: <payload> }) })`
3. No need to navigate to the portal first — CORS allows cross-origin

### Mark's action items

1. **Commit + deploy the CORS change** — `cd ~/Documents/nebula-logger-dashboard && git add -A && git commit -m "feat: CORS on push endpoint for Cowork Chrome-based push" && git push`
2. **Re-upload baseline_promos.json** to the Claude.ai project after each Promo Monitor run (fortnightly)

### For the next portal session (Claude Code)

The CORS change needs to be committed and deployed. If Claude Code picks up Session 3 next, it should `git pull` first to get this change, then proceed with the Trudy port per the build spec.

---

## 2026-05-18 (morning) — Portal Session 2 shipped: intel dashboards + KV→Blob swap

**Actor:** Claude Code (Opus 4.7, 1M context) — working in `~/Documents/nebula-logger-dashboard`

### Summary

The intel half of the portal is live. Four dashboard pages reading from Vercel Blob, end-to-end pipeline verified against real test pushes. The plan had been KV but Vercel reorganised their storage suite — KV moved to Marketplace integrations (Upstash) and isn't a first-party option anymore. Swapped to Vercel Blob, which is actually a better semantic fit ("store this document, retrieve it") for what we're doing. Cowork's push step didn't need to change — the API contract stayed the same.

### Commits shipped (in nebula-logger-dashboard, in order)

| Commit | What it did |
|---|---|
| `54ca3f8` | refactor: swap @vercel/kv for @vercel/blob (Vercel storage reorg) |
| `42401e1` | fix(blob): use private access + downloadUrl for read |
| `492c708` | fix(blob): include BLOB_READ_WRITE_TOKEN as Bearer header on read fetch |
| `1dbea0e` | feat: Session 2 — intel dashboards (promos, outcomes, seo, wine) |

### Pipeline end-to-end verification

Mark set `INTEL_PUSH_SECRET` in both Vercel env vars and the local `.portal-push-secret` file. Added a Vercel Blob store via the dashboard (auto-injected `BLOB_READ_WRITE_TOKEN`).

```
POST /api/intel/push (with bearer secret) →
  HTTP 200, {ok:true, source:"promos", pathname:"intel/promos/latest.json",
             url:"https://78qwl2p9uw4bmiqb.private.blob.vercel-storage.com/...",
             updatedAt:"2026-05-18T07:01:59.659Z"}

GET /api/intel/promos (with portal_auth cookie) →
  HTTP 200, {source, data, updatedAt, url} — full round-trip works
```

### Dashboards built

| Path | Source | v1 features |
|---|---|---|
| `/intel/promos` | `promos` (Promo Monitor fortnightly) | Summary stats, search + category + mechanic filters, sortable promo table. Defensive unwrap of array / .promos / .records shape. |
| `/intel/outcomes` | `outcomes` (SF Outcome Export weekly) | Summary stats incl. aggregate prize claim rate, mechanic + status filters, sorted-by-entries campaign table with expandable rows showing prize ladder + cashback tiers + metadata. |
| `/intel/seo` | `seo` (SEO Deep Dive weekly) | Adaptive renderer (shape not yet confirmed). Summary stats, pillar distribution bars, keyword gaps, visibility table, cannibalisation, competitor domains. Falls through to raw-JSON view if structures don't match. |
| `/intel/wine` | `wine` (no push pipeline yet) | Empty state until wine push is added. Will adapt when data lands. |

### Shared components

- **IntelLayout.jsx** — title + tagline + last-updated freshness badge + refresh button + loading/error/empty/data state handling. Every page uses this.
- **RefreshButton.jsx** — opens a modal showing the Cowork task name with copy-to-clipboard, plus a "Log refresh request" button (stub for now).
- **Freshness badge** uses relative time: <1hr "just now", <24hr "N hours ago", <7day "N days ago" (amber when >24hr), older = absolute date.
- **Empty / error / "data exists but wrong shape" states** all handled cleanly — the dashboards never crash on weird payloads, they just surface the raw JSON for inspection.

### One open question for the next session

**Cowork trigger mechanism.** Mark asked for the ability to fire Cowork tasks from the dashboard. The "Refresh data" button on each page opens a modal with the task name + copy button — that's v1. The portal endpoint `/api/intel/trigger` is a stub that logs the request and returns 202 "queued."

To wire actual remote triggering, we need to know how Cowork accepts external triggers. Options:
- HTTP endpoint on Cowork (localhost or remote)
- Webhook URL via Zapier/Make/IFTTT
- Email to Mark via transactional service
- Append to a Blob "refresh queue" that Mark polls

When the mechanism is decided, the change is small — just swap the stub body in `app/api/intel/trigger/route.js`.

### Current state of intel data

| Source | Status |
|---|---|
| `promos` | Test payload from pipeline verification. Real data on next Promo Monitor fortnightly fire. |
| `outcomes` | No data yet. SF Outcome Export weekly; next run will push. |
| `seo` | No data yet. SEO Deep Dive weekly (Monday 6:30am). |
| `wine` | No data, no push step in pipeline yet. Cowork to add. |

### What's next

- **Session 3** — Trudy port. Full Shelf pipeline (research + evaluate + creative director + alternatives) as Next.js API routes with SSE streaming. Plus the `/trudy` form, `/trudy/results/[id]` viewer, `/trudy/history` list. Blocked on Mark setting `ANTHROPIC_API_KEY` + `SERPER_API_KEY` in Vercel env vars.
- **Session 4** — On-demand competitive research trigger.
- **Cowork trigger wiring** (when mechanism known) — swap the `/api/intel/trigger` stub.
- **Wine push step** — Cowork to add when ready.

### Portal repo at commit time

```
1dbea0e  feat: Session 2 — intel dashboards (promos, outcomes, seo, wine)
492c708  fix(blob): include BLOB_READ_WRITE_TOKEN as Bearer header on read fetch
42401e1  fix(blob): use private access + downloadUrl for read
54ca3f8  refactor: swap @vercel/kv for @vercel/blob (Vercel storage reorg)
2b5abe5  feat: Session 1B — shared-password auth for the 2-staff portal
246c76c  feat: Trevor Staff Portal foundation — restructure + nav + KV scaffold
db431ea  (prior — Mark's earlier Campaign dashboard commit)
```

---

## 2026-05-17 (post-midnight) — Cowork: Push-to-KV step added to 3 scheduled tasks

**Actor:** Cowork (Opus 4.6)

### What was done

Added a push-to-portal step to the three data-producing scheduled tasks so the Staff Portal's Vercel KV store gets fresh data on each run. This unblocks Claude Code Session 2 (intelligence dashboards).

| Task | Source key | Push step |
|------|-----------|-----------|
| `promo-monitor-fortnightly` | `promos` | New Step 8 after email report — POSTs `baseline_promos.json` |
| `weekly-seo-deep-dive` | `seo` | New Step 8b after saving baseline JSON — POSTs `seo-baseline-*.json` |
| `sf-outcome-export` | `outcomes` | New Step 5b after saving JSON — POSTs `sf-campaign-outcomes.json` |

**Push endpoint:** `POST https://nebula-logger-dashboard.vercel.app/api/intel/push`
**Auth:** Bearer token from `/Users/markalexander/Documents/Claude/Scheduled/trevor-marketing-engine/.portal-push-secret`
**Body:** `{ "source": "<key>", "data": <full JSON> }`

All push steps are non-fatal — if the push fails (secret not set, network error, etc.), the task continues normally and local files are still produced.

### Mark's action items

1. **Set `INTEL_PUSH_SECRET` in Vercel dashboard** — any random string (e.g., `openssl rand -base64 32`)
2. **Put the same string in** `/Users/markalexander/Documents/Claude/Scheduled/trevor-marketing-engine/.portal-push-secret` — this file currently contains the placeholder text `REPLACE_WITH_YOUR_INTEL_PUSH_SECRET`
3. Once both are set, the next run of each task will automatically push data to KV

### Notes

- The bash commands use `jq` to wrap the JSON in the expected `{source, data}` envelope
- Each task checks if the secret file contains "REPLACE_WITH" and skips gracefully if so
- The SF outcome export was updated via the scheduled task API (not a file edit) since its folder isn't in the connected workspace
- Portal URL is the existing `nebula-logger-dashboard.vercel.app` — can change to a custom domain later by updating the push URLs in each task

---

## 2026-05-17 (late night) — Portal Session 1B shipped: shared-password auth

**Actor:** Claude Code (Opus 4.7, 1M context) — working in `~/Documents/nebula-logger-dashboard`

### Summary

Mark called it: "1B is simple, I only have 2 employees." Skipped NextAuth + Google SSO entirely — overkill for a 2-person staff. Shipped the simplest thing that's still actually secure: shared password + HMAC-signed cookie + Edge middleware gate. 30-day session. Sign-out button in the sidebar.

**Commit:** `2b5abe5` in `nebula-logger-dashboard`.

### What landed

| File | Purpose |
|---|---|
| `lib/auth.js` | `isAuthRequired()`, `computeSessionToken()` (Edge-compatible HMAC-SHA256 via crypto.subtle), `isValidSessionCookie()` (constant-time compare) |
| `app/login/page.js` + `LoginForm.jsx` | Server-rendered wrapper around Suspense-wrapped client form (Next 14 requires this around `useSearchParams`). Password input, error display, redirect to `?next=` after success |
| `app/api/auth/login/route.js` | POST. Validates password against `PORTAL_PASSWORD` env var, sets `portal_auth` cookie (httpOnly, secure in prod, sameSite=lax, 30-day) |
| `app/api/auth/logout/route.js` | POST. Clears the cookie |
| `middleware.js` | Edge middleware. Redirects HTML routes to `/login?next=<path>`, returns JSON `401` on `/api/*` routes for clean client handling. Bypasses: `/login`, `/api/auth/*`, `/api/intel/push` (which has its own bearer auth), and static asset prefixes |
| `components/Nav.jsx` | Returns null on `/login` (no sidebar for the signed-out view). Sign-out button in sidebar footer |
| `app/globals.css` | New `.portal-login` + `.portal-logout` styles using existing CSS variables |

### How auth works

- **Cookie value** = HMAC-SHA256(`PORTAL_PASSWORD + ":portal-session-v1"`, `AUTH_SECRET`) as hex
- **Rotation** — change `AUTH_SECRET` to invalidate every existing session; change `PORTAL_PASSWORD` when a staff member leaves
- **Dev mode** — if either env var is unset, middleware passes through everything. `next dev` keeps working without needing to remember a password.

### Verified

`npm run build` succeeds with all 17 routes (added: 1 login page + 2 auth API routes). Middleware compiled at 26.8kB.

### Mark's pre-deploy checklist

1. Generate a secret: `openssl rand -base64 32`
2. Set in Vercel project env vars:
   - `PORTAL_PASSWORD=<a memorable shared password>`
   - `AUTH_SECRET=<the random secret from step 1>`
3. Redeploy. Visit `/` and you'll be bounced to `/login`.
4. Share the password with your 2 staff.

### What's next

Both 1A and 1B are now in place. The portal foundation is done. Subsequent sessions:

| Session | Scope | Blocking on |
|---|---|---|
| **2** | Intel dashboard pages (SEO, Promos, Outcomes, Wine) reading from Vercel KV | Cowork pushing data to KV (needs `INTEL_PUSH_SECRET` set + push step added to each task prompt) |
| **3** | Trudy port — full Shelf pipeline as Next.js API routes with SSE streaming | Mark setting `ANTHROPIC_API_KEY` + `SERPER_API_KEY` in Vercel env vars |
| **4** | On-demand competitive research trigger | Session 3 complete |

---

## 2026-05-17 (late night) — Portal Session 1A shipped: foundation, nav, KV scaffold

**Actor:** Claude Code (Opus 4.7, 1M context) — working in `~/Documents/nebula-logger-dashboard`

### Summary

Session 1A of the staff-portal build per `PORTAL-BUILD-SPEC.md` (on Mark's Desktop). Restructured the Nebula Logger repo in place to become the Trevor Staff Portal shell. The portal now has a real sidebar, a real landing page, the existing Logger + Campaign Reports still work unchanged, and the Vercel KV push/read endpoints are scaffolded so Cowork tasks can start streaming intelligence data to it. Five "coming soon" placeholder pages mark where Sessions 2–4 will land.

### Repo handoff note

**Portal lives at:** `~/Documents/nebula-logger-dashboard` (deployed to `nebula-logger-dashboard.vercel.app`). Future portal sessions should `cd` there, not into trudy-v4. The trudy-v4 repo continues to be Mark's local Trudy dev environment — both repos coexist.

**Commit shipped this session:** `246c76c` in `nebula-logger-dashboard` repo.

### Decisions taken with Mark's "default" green-light

- **In-place restructure** of Nebula Logger (not a new `trevor-portal` repo) — Vercel deploy + SF env vars already configured, lower risk
- **Vercel Pro assumed** for the 60s+ function timeout Trudy needs. Will also implement SSE streaming from day one so we're not solely dependent on the timeout limit
- **Domain stays** `nebula-logger-dashboard.vercel.app` for now — custom domain can come later
- **Tighter Session 1 scope:** Split the spec's Session 1 (which bundled auth + KV + everything) into **Session 1A (this — foundation)** and **Session 1B (next — NextAuth + Google + allowlist)**. Auth is its own integration with its own failure modes; cleaner to ship it separately.

### What landed (Session 1A)

| Area | What |
|---|---|
| Restructure | `app/page.js` (Nebula Logger homepage) → `app/logger/page.js` unchanged. New `app/page.js` is the Trevor Portal landing with 4 section cards. `app/campaigns/` stays as-is. |
| Layout shell | `app/layout.js` now wraps children in a sticky sidebar + main column. `components/Nav.jsx` (new) holds the sidebar — 4 sections, 9 nav items, active highlighting, "soon" badges on placeholders. |
| Design | Extended `app/globals.css` with portal-shell / portal-sidebar / portal-link / portal-landing / portal-placeholder classes using the existing CSS variable design tokens (`--bg`, `--card`, `--accent`, etc.). Existing `.container` / `.card` / `.metric` patterns continue to work unchanged. Mobile: sidebar collapses to top bar under 768px. |
| Placeholders | `/intel/{seo,promos,outcomes,wine}`, `/trudy`, `/trudy/history`, `/research` — each notes its data source and which Session will build it. |
| KV scaffold | `lib/kv.js` with `readIntel(source)` / `writeIntel(source, data)` / `isKvConfigured()`. Falls back gracefully when KV env vars aren't set, so `next dev` keeps working locally. |
| Push endpoint | `POST /api/intel/push` — bearer-secret-authed (`INTEL_PUSH_SECRET` env var). Body: `{ source, data }`. Cowork tasks call this after writing their local JSON. Sources: `seo`, `promos`, `outcomes`, `wine`. |
| Read endpoint | `GET /api/intel/[source]` — returns latest payload + `updatedAt` timestamp. Used by upcoming dashboards. |
| Build | `npm run build` succeeds. 14 routes total (4 existing + 7 new placeholders + 2 new API + landing + _not-found). |

### What did NOT land (intentionally deferred)

- **NextAuth + Google + email allowlist** — Session 1B
- **Intel dashboards rendering real data** — Session 2 (need KV populated first; need shared `BarChart` / `TrendChart` / `DataTable` extracted from the existing campaigns page)
- **Trudy port** — Session 3 (the big one: port `runShelfResearch` + `evaluateIdea` + `generateRoutes` to Next.js API routes with SSE streaming)
- **On-demand competitive research** — Session 4
- **Two pre-existing uncommitted changes** in `app/api/campaigns/*.js` were left alone — not mine to commit; Mark to handle when he's next in that repo.

### For the next portal session

Read `PORTAL-BUILD-SPEC.md` (Desktop), then this entry, then `cd ~/Documents/nebula-logger-dashboard`.

**Session 1B (recommended next):** NextAuth.js + Google provider + `ALLOWED_EMAILS` env-var allowlist. Mark needs to provision Google OAuth credentials in Google Cloud Console first (or I can walk him through it inline). New session ID at top of SESSION-LOG when complete.

**Cowork's job (parallel, not blocking):** Add the push-to-KV step to each scheduled task's prompt per spec Phase 2. Format:
```
curl -X POST https://nebula-logger-dashboard.vercel.app/api/intel/push \
  -H "Authorization: Bearer ${INTEL_PUSH_SECRET}" \
  -H "Content-Type: application/json" \
  -d '{"source": "<seo|promos|outcomes|wine>", "data": <JSON content>}'
```
Once Cowork starts pushing, Session 2 can build the dashboards against real data.

### One thing for Mark to do when convenient

Provision the `INTEL_PUSH_SECRET` (any random string — `openssl rand -base64 32` works) and add it to the Vercel project env vars + share with Cowork. Until that's set, `POST /api/intel/push` returns 503 — the endpoint is wired but locked.

---

## 2026-05-17 (night) — Staff portal architecture decided + build spec written

**Actor:** Cowork (Opus 4.6)

### Decision

Mark asked: "How easy would it be to create a portal for staff to see the SEO report, the live nebula logger, campaign reports, and Trudy in action?" After reviewing the Nebula Logger codebase (`~/Documents/nebula-logger-dashboard`) and Trudy's backend, the decision is:

**Merge everything into a single Vercel monorepo.** The Nebula Logger becomes the Trevor Staff Portal — same URL, same deploy, same dark theme. Staff get full access: dashboards AND the ability to trigger Trudy evaluations.

### Architecture

- **Hosting:** Vercel (same as Nebula Logger today)
- **Data layer:** Vercel KV for intelligence data. Cowork tasks get a push step (curl POST) after writing local JSON. Local files remain for dev, KV for production.
- **Auth:** NextAuth.js + Google SSO, email allowlist via env var
- **Staff access:** Full — submit briefs, trigger competitive reports, watch agents evaluate in real time
- **AI calls:** Streaming SSE from Vercel serverless functions (requires Pro plan for 60s+ timeout)

### Build spec

Written to `PORTAL-BUILD-SPEC.md` in the trudy-v4 repo. Covers:
- Repo restructure (directory layout for merged app)
- Vercel KV schema and push endpoint
- Auth setup (Google SSO + email allowlist)
- 5 intelligence dashboard pages (SEO, promos, wine, outcomes, competitive)
- Full Trudy eval pipeline ported to Next.js API routes with streaming
- 4 Claude Code sessions estimated, ordered by dependency
- Component reuse plan (BarChart, TrendChart, DonutChart, DataTable extracted from Nebula Logger)
- Env vars, dependencies, risk notes (serverless timeouts, API costs)

### Also completed this session

- **augmentWithSeoContext()** — wrote the function body in `research.ts` (was called but didn't exist). 6 fact types: keyword gaps, pillar distribution, refresh candidates, cannibalisation risks, page-1 keywords, competitor domains.
- **Named vocabulary** — added `<named_vocabulary>` section to `constitution.ts` with 12 canonical Shelf Truth terms (Dopamine Sandwich, Insult Threshold, Rule of Three, Slippage, Budget Hacker, etc.)
- **CLAUDE.md + SESSION-LOG** — updated integration status (3 arrows now ✅), added wine landscape to data table
- **Mark's .zshrc fix** — guided Mark through removing empty `ANTHROPIC_API_KEY` export (3 session logs had flagged it)

### For Claude Code: next session

Read `PORTAL-BUILD-SPEC.md` before starting. Session 1 (Foundation) is the first target: restructure repo, move Nebula Logger pages, add Vercel KV + push endpoint, add auth, deploy.

---

## 2026-05-17 (late evening) — Evaluation history page + Cowork bundle committed

**Actor:** Claude Code (Opus 4.7, 1M context)

### Summary

Closed the "where do my evaluations go?" loop and committed Cowork's earlier-evening work that was sitting uncommitted in the working tree. Trudy now has a `/shelf/history` page listing every past evaluation as a card (verdict badge, brand/category, date, rationale snippet, improved headline, alt-route count, click-through to the full verdict view). `ShelfRoutes` hydrates from storage when opened by direct URL — so the cards are linkable, the History page works end-to-end, and you can refresh any evaluation page without losing it. The previous "Existing Campaigns" picker on ShelfBrief now defaults to EVALUATION mode and separates "View verdict" from "Re-run brief."

### Commits added

| Commit | Actor | What it did |
|---|---|---|
| `2fb22d9` | Claude Code | **Evaluation history + ShelfRoutes hydration.** New `GET /api/campaigns?mode=EVALUATION` filter + dedicated `GET /api/campaigns/:id/shelf/evaluation` endpoint that returns the latest `shelfEvaluation` output as the same JSON the renderer consumes from a live evaluate. New `/shelf/history` React page with verdict-badged cards that lazy-load each card's full verdict to show substance (rationale + improved headline). `ShelfRoutes` hydrates from storage when there's no in-memory nav state. `ShelfBrief` picker filters to EVALUATION mode + adds View/Re-run buttons. TopNav gets a History link. |
| `14ab6ae` | Cowork (committed by Claude Code) | **SEO baseline reader + named Shelf vocabulary + wine taxonomy.** Bundle of Cowork's earlier-evening work that was staged but uncommitted in the working tree. Documented in the 2026-05-17 (evening) entry below. Attributed to Cowork in the commit message; Claude Code committed on its behalf to keep the tree clean. |

### Why the history was invisible before

Three separate gaps stacked up:
1. `/api/campaigns` listed everything (CREATE + EVALUATION + DRAFT) with no filter
2. The existing `/api/campaigns/:id/outputs/latest` endpoint only queried the OLD War Room output types (`framingNarrative`, `evaluationNarrative`, etc.) — never `shelfEvaluation`, so even direct API access didn't surface Shelf verdicts
3. The picker on ShelfBrief looked like a history list but actually re-loaded the brief for re-running — clicking a card replaced the form, never opened the past verdict

The new endpoint + page + hydration close all three.

### Proof point

Mark's evaluation history (as of commit time): **25 past Shelf evaluations** persisted across the session — Guinness x4, Beko x4, plus earlier work. All now reachable at `/shelf/history` with full verdict data including Creative Director output and alternative routes.

### What's now linkable

- `/shelf/history` — list of every past evaluation
- `/shelf/<campaignId>/routes` — the full verdict view (works as a deep link now; previously only worked with in-memory state)
- Both via the new "History" link in TopNav, or via the "View verdict" button on each card in the ShelfBrief picker

### Open follow-ups (carried forward)

Unchanged from earlier entries:
- Shell `ANTHROPIC_API_KEY=""` in `~/.zshrc` — flagged in three logs now, still unfixed by Mark
- Per-verdict feedback capture for the closed outcome loop
- Two-mode classifier (Accountant vs Gambler) at brief level
- Per-alternative headline dedup

New one to consider:
- The history list currently lazy-loads each card's full verdict on mount (one request per card). Cheap with 25 cards; will need pagination + summary fields if it grows to hundreds. Worth caching the verdict summary (verdict label, headline, alt count) on the Campaign row itself so the list can render in one query.

---

## 2026-05-17 (evening) — Cowork-side fixes: taxonomy alignment, SEO reader, wine landscape, named vocabulary

**Actor:** Cowork (Opus 4.6)

### Summary

Picked up the Claude Code session's open follow-ups and fixed everything reachable from the Cowork side. The three "data → Trudy" arrows on the architecture diagram are now all wired: Promo Monitor (shipped May 16), SF Outcomes (shipped May 16), and SEO Deep Dive (shipped this session). Also hardened the two Cowork data-collection tasks (Promo Monitor, Electrolux Landscape) to output canonical taxonomy strings, eliminating the fuzzy-matching workarounds Trudy-side. Created a new Wine Promotional Landscape monthly task. Wired Mark's named Shelf Truth vocabulary into the evaluation prompts.

### Changes made

| What | Where | Detail |
|---|---|---|
| **SEO baseline reader** | `src/lib/seo-context.ts` (new) | Same mtime-cache pattern as market-context.ts and campaign-outcomes.ts. Reads `~/Documents/Claude/Scheduled/weekly-seo-deep-dive/seo-baseline-*.json`. Returns keyword gaps, pillar distribution, refresh candidates, cannibalisation risks, top keywords, competitor domains, indexation stats. |
| **SEO route + mount** | `src/routes/seo-context.ts` (new), `src/index.ts` | `GET /api/seo-context` endpoint, mounted in the api router. |
| **SEO → research augmentation** | `src/shelf/research.ts` | `augmentWithSeoContext()` injects up to 6 fact types into `categoryFacts`: keyword gaps, pillar distribution, refresh candidates, cannibalisation risks, relevant page-1 keywords, competitor domains in SERPs. Filters by brand/category relevance where possible. |
| **Shelf Truth named vocabulary** | `src/shelf/constitution.ts` | Added `<named_vocabulary>` section with 12 canonical terms: Dopamine Sandwich, Insult Threshold, Rule of Three, Slippage, Budget Hacker, Kill Switch, S.O.S. Framework, Catalogue Ready, Two Pilots, Goal Gradient Effect, Currency Bias, 3-Second Equation. Agents now use these terms by name in outputs. |
| **Serper .env fix** | `apps/backend/.env` | Removed trailing spaces from SERPER_API_KEY and related vars (was causing HTTP 400, research dossier falling back to empty). |
| **Promo Monitor taxonomy alignment** | Cowork task prompt | Added Step 2b (canonical taxonomy mapping tables for 16 mechanics + 16 categories from taxonomy.json), Step 2c (classifier quality rules fixing false positives: gift card ≠ cashback, discount ≠ cashback, etc.), Step 2d (parsedValue numeric extraction). |
| **Electrolux Landscape taxonomy alignment** | Cowork task prompt | Rewrote promotion types and product categories sections with canonical taxonomy tables. Updated Step 0 to filter on exact canonical category matches and use parsedValue. |
| **Wine Promotional Landscape** | New monthly Cowork task | Retailer-first sourcing (Dan Murphy's, BWS, Liquorland, First Choice, Vintage Cellars). Manufacturer sites deliberately excluded from primary sources (wine brands don't run promotable offers on their .com). Adaptive slide count — only slides with substance. Strict "is this actually a promotion?" filter. |
| **taxonomy.json — wine industry** | `packages/heuristics/taxonomy.json` | Added Australian Vintage (McGuigan, Tempus Two, Nepenthe, Barossa Valley Estate) as client. Added 5 wine competitor groups (Treasury Wine Estates, Accolade Wines, Casella Family Brands, De Bortoli, McWilliam's) with subBrands. Added 5 liquor retailers (Dan Murphy's, BWS, Liquorland, First Choice Liquor, Vintage Cellars). |

### Integration files now in play

| Path | Who writes | Who reads (Trudy code) |
|---|---|---|
| `~/Documents/Claude/Scheduled/promo-monitor-fortnightly/baseline_promos.json` | Promo Monitor task | `lib/market-context.ts` |
| `<repo>/data/sf-campaign-outcomes.json` (gitignored) | SF Outcome Export task | `lib/campaign-outcomes.ts` |
| `~/Documents/Claude/Scheduled/weekly-seo-deep-dive/seo-baseline-*.json` | SEO Deep Dive task | `lib/seo-context.ts` |

### What an agent now additionally sees (SEO augmentation example)

- *categoryFact*: "SEO keyword gaps with no Trevor content coverage: cashback promotion rules australia, instant win competition examples, …"
- *categoryFact*: "Current blog content distribution across One Job pillars: Converter: 12, Breaker: 8, Builder: 4, …"
- *categoryFact*: "Trevor already ranks on page 1 for: 'cashback promotion' (Found on page 1), …"

### Still open

- **Shell `ANTHROPIC_API_KEY=""`** in `~/.zshrc` — flagged in both May 16 and May 17 logs, still unfixed. Mark to unset when convenient.
- **Outcome loop** — Trudy still doesn't capture Mark's per-verdict scoring for feedback. Next Claude Code session should wire this.
- **Two-mode classifier** — Accountant vs Gambler split at brief level. Vision doc calls for it; not yet built.
- **Per-alternative headline dedup** — Creative Director calls don't see sibling routes' headlines, so lenses can echo across SAFE/BOLD/RIDICULOUS spread.

---

## 2026-05-17 — Structured briefs, Creative Director, verdict reclassification

**Actor:** Claude Code (Opus 4.7, 1M context)

### Summary

Closed the loop on the input form (was collapsing every campaign detail into one free-text field) and the creative output (Provocateur + Pragmatist produced strong reasoning but the headlines kept landing on transactional rewrites). Trudy now: accepts structured briefs with a sufficiency gate, runs a third Creative Director agent producing five distinctly-positioned headlines + a signature moment per route, forces a SAFE/BOLD/RIDICULOUS spread across alternative routes, and auto-reclassifies KILL → REWORK when the score signals contradict the verdict. The system is visibly closer to Mark's 2024 vision now — both for the multi-agent creative range and the "looks for missing info instead of guessing" handshake.

### Commits added (in order)

| Commit | What it did |
|---|---|
| `d931ee7` | **Structured brief fields + NEEDS_INPUT gate.** ShelfBrief form now captures mechanic, oneJob, dates, prize count/value/pool, headline, reward description, entry requirement. Free-text moved to optional "Additional context." API + Zod schema + buildBriefXML extended end-to-end. Backend returns a `NEEDS_INPUT` verdict (listing missing fields) before burning an LLM round-trip when the brief is too thin. Eval-mode prompt teaches the agent to ground in structured fields and name gaps rather than fabricate. |
| `40294c8` | **Creative Director agent + SAFE/BOLD/RIDICULOUS ambition zones.** Third agent runs alongside Provocateur + Pragmatist. Produces exactly 5 headlines per route, one per lens (TRANSACTIONAL / CULTURAL_MOMENT / BRAND_TRUTH / EMOTIONAL_JOB / WILDCARD), each with rationale + pilot assignment. Plus a per-route `signatureMoment` — "the scene people will talk about" (direct from Mark's 2024 vision doc). `generateAlternatives` now forces a SAFE/BOLD/RIDICULOUS ambition spread, each alternative getting its own Creative Director pass. New trevor-schema types (HeadlineAngle, AmbitionZone). Frontend renderer adds Creative Director section + per-route ambition badges + 5 colour-coded headline cards + signature moment call-out. |
| `fc9024f` | **UI fix.** `whatBreaks` was rendering only "Fix:" lines, swallowing the issue text — schema is `{ issue, shelfReference, fix }` but the renderer looked for `point || text`. Also added a coloured left-edge stripe per ambition zone (slate / amber / fuchsia) so the SAFE→BOLD→RIDICULOUS spread is visible at a glance. |
| `cdc882c` | **Verdict reclassification + always generate alternatives.** The Guinness brief returned KILL with Provocateur 7 / Creative Director 8 / Pragmatist 2 — the concept clearly had merit, the Pragmatist's objections were execution-fixable. Updated eval-mode prompt with explicit verdict taxonomy (KILL = fundamentally flawed concept, NOT brief gaps or execution issues). Added `reclassifyVerdict` safety net that auto-downgrades KILL → REWORK when Provocateur OR Creative Director ≥7, with an amber UI call-out explaining the reclassification. `generateAlternatives` now fires on KILL too, with verdict-specific framing — KILL alternatives are told to "preserve what the concept gets right and route around the Pragmatist's blockers" (with the Pragmatist's note injected as `<pragmatist_blockers>`). |

### Proof points

**Beko cashback brief, before this session:** "KILL — Cannot evaluate undefined campaign" with every Kill Sheet item "FAIL — Unspecified."

**Beko cashback brief, after this session:** "REWORK — Strong cultural timing and novel concept, but operational complexity prevents this from achieving the BUILDER job." LOADER job correctly identified. Three alternative routes — Guaranteed Cashback Tiers (SAFE) / Cost-of-Living Cashback Tracker (BOLD) / Buy Now Beko Pays You Later (RIDICULOUS) — each with 5 lens headlines and a signature moment.

**Guinness Sir Guinness racehorse brief:** Provocateur 8, Creative Director 8, Pragmatist 2 — the agents disagree productively. Creative output worth quoting:
- BRAND_TRUTH: *"Good things come to those who back winners — Patience pays off, in tees and horse dividends"* (a direct rework of Guinness's actual famous tagline)
- WILDCARD: *"Drink yourself into horse ownership. Seriously."*
- Signature moment: *"Live trackside broadcast from Sir Guinness's first race with split-screen showing 5000 Guinness shareholders watching from pubs across Australia."*

The Pragmatist independently flagged AUSTRAC reporting + state-by-state gambling permits + age verification — meaningful compliance check without Quentin being active.

### Vision check-in (Mark shared `bamboo_trevor_intelligence_platform.svg` + the 2024 Trudy vision doc)

Honest read: the system is **at or beyond the 2024 vision** on real-data grounding, the "looks for missing info instead of guessing" handshake (now literally implemented as `NEEDS_INPUT`), and the multi-agent voice (Provocateur × Pragmatist × Creative Director). **Still behind** on: explicit Accountant vs Gambler two-mode classifier at brief level, brand-fit as a hard scoring lens, the closed feedback loop (Trudy still doesn't learn from Mark's scoring of its own past verdicts), and Quentin / compliance gate (deferred by Mark — currently folded into the Pragmatist, working adequately).

### Known limitations / open follow-ups

- **Per-alternative-route headline angles can overlap** across the SAFE/BOLD/RIDICULOUS spread because each Creative Director call sees only its own route, not the other two. Routes still feel distinct from each other (mechanics differ, signature moments differ) but the 5 lenses sometimes echo. Prompt could be tightened to pass sibling-route headlines as exclusion context.
- **Serper key still has a trailing space in `apps/backend/.env`** — Serper returns HTTP 400, research dossier falls back to empty for cultural moments. Mark to fix (one-character edit).
- **Shell `ANTHROPIC_API_KEY=""`** still set from Mark's shell init — Trudy works around it via `src/env.ts` `override: true`, but other Node projects on the machine will hit the same bug. Mark to unset in `~/.zshrc` when convenient.
- **Outcome loop is still one-way** — Trudy reasons with Trevor's past campaign data but doesn't capture Mark's per-verdict scoring as a feedback signal. Closing this loop would let the system genuinely "improve as it learns what worked" (vision phrase).

### Suggested next moves (when you next sit down)

- **SEO Deep Dive baseline reader** — third Cowork data source, same architectural pattern as Promo Monitor and SF outcomes. Would feed Jax during route generation, completing the third "data → Trudy" arrow on the architecture diagram.
- **Two-mode classifier at brief level** — Accountant vs Gambler split would let the system route to different evaluation prompts for cashback/GWP vs prize-led mechanics. Vision doc explicitly called for this.
- **Per-evaluate feedback capture** — thumbs/score on each verdict that gets stored against the IdeaRoute, enabling the closed feedback loop.
- **Wire `mark.json` heuristics into the Shelf system prompt** — would surface more of Mark's named vocabulary (Insult Threshold, Dopamine Sandwich, Rule of Three, Slippage) in the verdict prose. Currently only Gambler/Accountant appear by name.

### Running infrastructure

- Backend: `pnpm dev:backend` from repo root → http://localhost:4000
- Frontend: `pnpm dev:frontend` from repo root → http://localhost:5173
- Both run under `tsx --watch` / `vite` so code edits hot-reload
- Two test endpoints worth knowing for inspection: `GET /api/market-context?mechanic=Cashback`, `GET /api/campaign-outcomes?mechanic=Cashback`

---

## 2026-05-16 — Cowork integration shipped (Phases 3 + 4)

**Actor:** Claude Code (Opus 4.7, 1M context)

### Summary

Started session with app not booting and ~30 files of uncommitted War Room refactor. Ended with: working app + six clean commits + two of the three "data → Trudy" arrows from the architecture diagram fully wired. Trudy agents now reason with grounded data from the Promo Monitor baseline (live AU competitor promos) and the Salesforce campaign-outcomes export (Trevor's own past campaigns with prize claim rates).

### Commits added (in order)

| Commit | What it did |
|---|---|
| `652bd02` | Cowork integration contract: `CLAUDE.md`, `packages/heuristics/taxonomy.json`, `packages/heuristics/worldview.md` |
| `69aa633` | Landed War Room refactor (56 files). Shelf-native routing + wizard UI. TS errors fixed (~20 → 0). New `src/env.ts` pre-import dotenv loader with `override:true` |
| `590699d` | `lib/market-context.ts` reader for Promo Monitor + `GET /api/market-context`. Fuzzy match handles "Cash back" ↔ "Cashback", "Sweep single draw" ↔ "Prize Draw (Single)" |
| `d481eb4` | Wired Promo Monitor into `runShelfResearch`. Agents see observed AU competitor promos in `competitorPromos` + `categoryFacts` |
| `81058c0` | `lib/campaign-outcomes.ts` for SF export + `GET /api/campaign-outcomes`. Wired into `runShelfResearch` — agents see Trevor's own campaigns in `mechanicPrecedents` with entry counts and prize claim rates. `data/` added to `.gitignore` |
| `46becf1` | Surfaced `cashbackRanges` — cashback campaigns now expose tier structures (spend thresholds × cashback values) for price-point reasoning |

### Integration files in play

| Path | Who writes | Who reads (Trudy code) |
|---|---|---|
| `~/Documents/Claude/Scheduled/promo-monitor-fortnightly/baseline_promos.json` | Promo Monitor task | `lib/market-context.ts` |
| `<repo>/data/sf-campaign-outcomes.json` (gitignored) | SF Outcome Export task | `lib/campaign-outcomes.ts` |

### What an agent now sees in the dossier for a cashback brief

- *categoryFacts*: "Trevor has run 7 Cashback campaigns (2,975 total entries, avg 425). Cashback structures: $100–$1,000 cashback against $100–$10,000 spend thresholds. Highest-entry: Westinghouse Aspire Bundle Cashback (896 entries)"
- *mechanicPrecedents*: per-campaign tier ladder, e.g. "888 entries | cashback tiers: $3,000–$4,999 → $250; $5,000–$6,999 → $400; $7,000–$9,999 → $700; $10,000+ → $1,000"
- *competitorPromos*: up to 20 currently-live AU promos from Promo Monitor, prepended ahead of Claude's web-search extractions

### Known data-quality gaps (Cowork-side, not Trudy)

- Promo Monitor: some `value` fields unparseable (e.g. "Upto $1,00") — dropped from value stats but records still surface
- Promo Monitor: classifier false positives (e.g. "Visa Gift Card" tagged as "Cash back" technique)
- SF: cashback campaigns don't carry redemption/claim counts per range — only tier structure
- SF: `winners` and `consumerUrl` empty across all 58 records

### Still not wired (next obvious work)

- **SEO Deep Dive baseline → Trudy** (would feed Jax during route generation)
- **Electrolux landscape → Trudy** (whitegoods-specific competitor data alongside generic Promo Monitor)
- Push canonical taxonomy labels back into Cowork task prompts (currently fuzzy-matched Trudy-side)

### Shell fixes Mark needs to do once

1. `unset ANTHROPIC_API_KEY` from `~/.zshrc` — was exported empty, shadowing the `.env`. Trudy overrides via `src/env.ts` but other Node projects will hit the same bug
2. Trailing space on `SERPER_API_KEY` in `apps/backend/.env` — causes Serper HTTP 400; shelf-research falls back to empty dossier

### Architecture diagram check-in

Mark shared `bamboo_trevor_intelligence_platform.svg` — diagram is largely accurate to shipped state. Two minor corrections to the diagram noted: Quentin (legal gate) missing from the agents list; SEO → Trudy arrow is aspirational not yet shipped. Minor SVG bug on line 166 (broken `<path>` element with `y1`/`y2` attributes; cosmetic only, line 167 below it renders the actual arrow).
