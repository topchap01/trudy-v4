# Session Log

Shared handoff log between Claude Code sessions, Cowork sessions, and Mark. **Newest entry at the top.** Each entry: `## YYYY-MM-DD — Title`, with an `Actor:` line and freeform sections beneath. Append, don't rewrite history — past entries are the audit trail.

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
