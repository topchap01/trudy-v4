# Session Log

Shared handoff log between Claude Code sessions, Cowork sessions, and Mark. **Newest entry at the top.** Each entry: `## YYYY-MM-DD — Title`, with an `Actor:` line and freeform sections beneath. Append, don't rewrite history — past entries are the audit trail.

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
